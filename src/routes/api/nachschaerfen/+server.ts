import { getDirectus } from '$lib/directus';
import { readItem, createItem } from '@directus/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { json, error } from '@sveltejs/kit';
import Anthropic from '@anthropic-ai/sdk';
import { logError } from '$lib/logger';
import type { RequestHandler } from './$types';

export type NachschaerpenMode = 'weak_areas' | 'easier' | 'harder';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { exerciseId, correctionResult, mode }: {
		exerciseId: string;
		correctionResult: string;
		mode: NachschaerpenMode;
	} = body;

	if (!exerciseId || !correctionResult || !mode) error(400, 'Pflichtfelder fehlen');

	const directus = getDirectus();
	const exercise = await directus.request(readItem('exercises', exerciseId));
	if (!exercise) error(404, 'Aufgabe nicht gefunden');
	const profile = await directus.request(readItem('profiles', exercise.profile_id));

	const modeInstructions: Record<NachschaerpenMode, string> = {
		weak_areas: `Analysiere die Korrektur und identifiziere die Schwachstellen und Fehler des Schülers. Erstelle dann neue Übungsaufgaben, die gezielt diese schwachen Bereiche trainieren. Erkläre kurz am Anfang (1-2 Sätze), worauf die Aufgaben abzielen.`,
		easier: `Erstelle eine leichtere Version der Aufgaben – einfachere Zahlen, weniger Schritte, mehr Hilfestellung durch Teilaufgaben. Gleiche Thematik, aber zugänglicher.`,
		harder: `Erstelle eine anspruchsvollere Version der Aufgaben – komplexere Zahlen, mehr Schritte, kombinierte Anforderungen. Gleiche Thematik, aber herausfordernder.`
	};

	const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

	let generatedContent = '';
	let tokensUsed = 0;

	try {
		const stream = await anthropic.messages.stream({
			model: 'claude-opus-4-8',
			max_tokens: 4096,
			thinking: { type: 'adaptive' },
			system: `Du bist ein erfahrener Lehrer für ${exercise.subject} an einem ${profile?.school_type ?? 'Gymnasium'} in ${profile?.state ?? 'Bayern'}, Klasse ${profile?.grade ?? 8}. Erstelle Übungsaufgaben, die sich zum Ausdrucken eignen.`,
			messages: [
				{
					role: 'user',
					content: `Ursprüngliche Aufgaben:\n\n${exercise.generated_content}\n\n---\n\nKorrektur des Schülers:\n\n${correctionResult}\n\n---\n\n${modeInstructions[mode]}\n\nFormat: Jede Aufgabe beginnt mit "Aufgabe X (Y Punkte):" – vergib sinnvolle Punktzahlen. Am Ende eine Zeile: "Gesamt: Z Punkte". Darunter ausreichend Leerzeilen für handschriftliche Antworten. Keine Musterlösungen.`
				}
			]
		});

		const message = await stream.finalMessage();
		generatedContent = message.content.find((b) => b.type === 'text')?.text ?? '';
		tokensUsed = (message.usage.input_tokens ?? 0) + (message.usage.output_tokens ?? 0);
	} catch (e) {
		await logError('api/nachschaerfen', e, { exerciseId, mode });
		error(502, 'Fehler beim Generieren');
	}

	const newExercise = await directus.request(
		createItem('exercises', {
			profile_id: exercise.profile_id,
			subject: exercise.subject,
			topic: `${exercise.topic} (Nachschärfen: ${mode === 'weak_areas' ? 'Schwache Bereiche' : mode === 'easier' ? 'Leichter' : 'Schwerer'})`,
			teacher_notes: exercise.teacher_notes,
			generated_content: generatedContent,
			source_file: null,
			tokens_used: tokensUsed
		})
	);

	return json({ exerciseId: newExercise.id, content: generatedContent });
};
