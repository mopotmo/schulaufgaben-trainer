import { readItems, createItem, updateItem } from '@directus/sdk';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { getDirectus, type LearnerInsight } from './directus';
import { logError } from './logger';

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

type InsightUpdate = {
	strengths: string[];
	weaknesses: string[];
	style_notes: string | null;
	difficulty: 'leichter' | 'passend' | 'schwerer';
};

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
	profileId: string,
	subject: string,
	topic: string,
	inputText: string
): Promise<void> {
	const directus = getDirectus();

	const existing = await directus
		.request(
			readItems('learner_insights', {
				filter: { profile_id: { _eq: profileId }, subject: { _eq: subject }, topic: { _eq: topic } },
				limit: 1
			})
		)
		.then((r) => r[0] ?? null)
		.catch(() => null);

	const update = await extractInsightsFromText(subject, topic, inputText, existing);
	if (!update) return;

	if (existing) {
		await directus
			.request(updateItem('learner_insights', existing.id, { ...update, updated_at: new Date().toISOString() }))
			.catch((e) => logError('learnerInsights/update', e, { profileId, subject, topic }));
	} else {
		await directus
			.request(createItem('learner_insights', { profile_id: profileId, subject, topic, ...update }))
			.catch((e) => logError('learnerInsights/create', e, { profileId, subject, topic }));
	}
}

export async function getInsightPrompt(
	profileId: string,
	subject: string,
	topic: string
): Promise<string> {
	const directus = getDirectus();

	const insight = await directus
		.request(
			readItems('learner_insights', {
				filter: { profile_id: { _eq: profileId }, subject: { _eq: subject }, topic: { _eq: topic } },
				limit: 1
			})
		)
		.then((r) => r[0] ?? null)
		.catch(() => null);

	if (!insight) return '';

	const lines: string[] = [
		`Lernerkenntnisse zu diesem Schüler (${subject} / ${topic}):`,
		insight.strengths.length > 0 ? `- Stärken: ${insight.strengths.join(', ')}` : '',
		insight.weaknesses.length > 0
			? `- Schwächen: ${insight.weaknesses.join(', ')} — baue gezielt Aufgaben dazu ein`
			: '',
		insight.style_notes ? `- Arbeitsweise: ${insight.style_notes}` : '',
		`- Schwierigkeitsgrad zuletzt: ${insight.difficulty} — orientiere dich daran`
	].filter(Boolean);

	return lines.join('\n');
}
