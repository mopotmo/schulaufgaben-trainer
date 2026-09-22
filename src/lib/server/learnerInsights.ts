/**
 * Lernerkenntnisse destillieren und als Prompt-Baustein aufbereiten.
 *
 * Der Datenzugriff läuft über `repo/insights`, das den Scope prüft. Das ist hier keine
 * Formalie: Der Text landet über `getInsightPrompt` im System-Prompt der Generierung.
 * Wer hier schreiben darf, beeinflusst, welche Aufgaben ein fremdes Kind bekommt.
 */
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import type { LearnerInsight } from '$lib/server/directus';
import type { Actor } from '$lib/server/authz';
import { getInsight, upsertInsight as persistInsight, type InsightUpdate } from '$lib/server/repo/insights';
import { logError } from '$lib/server/logger';

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const DIFFICULTIES = ['leichter', 'passend', 'schwerer'] as const;

/**
 * Statt „antworte als JSON" das Werkzeug-Schema.
 *
 * Die Funktion hat seit Juni nie ein Ergebnis geliefert, in zwei Stufen:
 * Bis zum 22.09.2026 verpackte das Modell die Antwort trotz gegenteiliger Anweisung in einen
 * Markdown-Codeblock, an dem `JSON.parse` scheiterte. Das Herausschneiden des ersten
 * JSON-Objekts löste das — bis am selben Tag ein Anführungszeichen **innerhalb** eines
 * Stichpunkts den Wert zerriss. Beides sind Symptome derselben Ursache: JSON, das durch
 * Fließtext transportiert wird, muss geparst werden und kann dabei kaputtgehen.
 *
 * Mit einem Werkzeug kommt die Struktur bereits als Objekt zurück — es gibt keinen Text,
 * der falsch aufgebaut sein könnte.
 */
const INSIGHT_TOOL: Anthropic.Tool = {
	name: 'lernerkenntnisse',
	description: 'Hält strukturierte Lernerkenntnisse zu einem Schüler fest.',
	input_schema: {
		type: 'object',
		properties: {
			strengths: {
				type: 'array',
				items: { type: 'string' },
				maxItems: 4,
				description: 'Kurze Stichpunkte, was der Schüler gut kann.'
			},
			weaknesses: {
				type: 'array',
				items: { type: 'string' },
				maxItems: 4,
				description: 'Kurze Stichpunkte, wo er Schwierigkeiten hat.'
			},
			style_notes: {
				type: 'string',
				description:
					'Ein Satz über Arbeitsweise, Tempo, Besonderheiten. Weglassen, wenn nichts erkennbar ist.'
			},
			difficulty: {
				type: 'string',
				enum: [...DIFFICULTIES],
				description: 'War die Aufgabe für diesen Schüler angemessen?'
			}
		},
		required: ['strengths', 'weaknesses', 'difficulty']
	}
};

/**
 * Das Werkzeug erzwingt das Schema nicht — es beschreibt es. Was hier ankommt, geht über
 * `learner_insights` in den System-Prompt der Generierung, deshalb wird es auf die erwartete
 * Form zurechtgestutzt, statt es durchzureichen.
 */
function normalize(input: unknown): InsightUpdate {
	const obj = (input ?? {}) as Record<string, unknown>;
	const list = (value: unknown) =>
		Array.isArray(value)
			? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '').slice(0, 4)
			: [];
	const difficulty = DIFFICULTIES.find((d) => d === obj.difficulty) ?? 'passend';
	const notes = typeof obj.style_notes === 'string' ? obj.style_notes.trim() : '';

	return {
		strengths: list(obj.strengths),
		weaknesses: list(obj.weaknesses),
		style_notes: notes || null,
		difficulty
	};
}

async function extractInsightsFromText(
	subject: string,
	topic: string,
	inputText: string,
	existing: LearnerInsight | null
): Promise<InsightUpdate | null> {
	const existingContext = existing
		? `Bisheriger Wissensstand zu diesem Schüler (${subject} / ${topic}):
- Stärken: ${existing.strengths.join(', ') || '–'}
- Schwächen: ${existing.weaknesses.join(', ') || '–'}
- Stil-Hinweise: ${existing.style_notes || '–'}
- Schwierigkeitsgrad zuletzt: ${existing.difficulty}

Merge die neuen Erkenntnisse mit dem bisherigen Stand. Entferne Schwächen, die offensichtlich überwunden wurden.`
		: `Noch keine Erkenntnisse zu diesem Schüler vorhanden. Erstelle einen ersten Eintrag.`;

	const prompt = `${existingContext}

Neue Information:
${inputText}

Extrahiere daraus strukturierte Lernerkenntnisse für das Fach "${subject}", Thema "${topic}"
und halte sie mit dem Werkzeug \`lernerkenntnisse\` fest.`;

	try {
		const msg = await anthropic.messages.create({
			model: 'claude-haiku-4-5-20251001',
			max_tokens: 1024,
			tools: [INSIGHT_TOOL],
			tool_choice: { type: 'tool', name: INSIGHT_TOOL.name },
			messages: [{ role: 'user', content: prompt }]
		});

		const call = msg.content.find((b) => b.type === 'tool_use');
		if (!call) throw new Error(`Keine Werkzeugantwort (stop_reason: ${msg.stop_reason})`);

		return normalize(call.input);
	} catch (e) {
		await logError('learnerInsights/extract', e, { subject, topic });
		return null;
	}
}

export async function upsertInsight(
	actor: Actor,
	profileId: string,
	subject: string,
	topic: string,
	inputText: string
): Promise<void> {
	const existing = await getInsight(actor, profileId, subject, topic);
	const update = await extractInsightsFromText(subject, topic, inputText, existing);
	if (!update) return;

	await persistInsight(actor, profileId, subject, topic, update).catch((e) =>
		logError('learnerInsights/persist', e, { profileId, subject, topic })
	);
}

export async function getInsightPrompt(
	actor: Actor,
	profileId: string,
	subject: string,
	topic: string
): Promise<string> {
	const insight = await getInsight(actor, profileId, subject, topic).catch(() => null);
	if (!insight) return '';

	return [
		`Lernerkenntnisse zu diesem Schüler (${subject} / ${topic}):`,
		insight.strengths.length > 0 ? `- Stärken: ${insight.strengths.join(', ')}` : '',
		insight.weaknesses.length > 0
			? `- Schwächen: ${insight.weaknesses.join(', ')} — baue gezielt Aufgaben dazu ein`
			: '',
		insight.style_notes ? `- Arbeitsweise: ${insight.style_notes}` : '',
		`- Schwierigkeitsgrad zuletzt: ${insight.difficulty} — orientiere dich daran`
	]
		.filter(Boolean)
		.join('\n');
}
