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

Extrahiere daraus strukturierte Lernerkenntnisse für das Fach "${subject}", Thema "${topic}".
Antworte ausschließlich als JSON ohne Markdown-Codeblock:
{
  "strengths": ["max. 4 kurze Stichpunkte was der Schüler gut kann"],
  "weaknesses": ["max. 4 kurze Stichpunkte wo er Schwierigkeiten hat"],
  "style_notes": "1 Satz über Arbeitsweise, Tempo, Besonderheiten — oder null wenn keine Info vorhanden",
  "difficulty": "leichter | passend | schwerer (war die Aufgabe angemessen?)"
}`;

	try {
		const msg = await anthropic.messages.create({
			model: 'claude-haiku-4-5-20251001',
			max_tokens: 512,
			messages: [{ role: 'user', content: prompt }]
		});
		const text = msg.content.find((b) => b.type === 'text')?.text ?? '';
		return JSON.parse(text) as InsightUpdate;
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
