import { getDirectus } from '$lib/directus';
import { readItem, updateItem } from '@directus/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { json, error } from '@sveltejs/kit';
import Anthropic from '@anthropic-ai/sdk';
import { saveFeatureRequest } from '$lib/featureRequests';
import type { RequestHandler } from './$types';

export type ChatMessage = {
	role: 'user' | 'assistant';
	text: string;
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const {
		exerciseId,
		messages,
		correctionResult,
		profileId
	}: { exerciseId: string; messages: ChatMessage[]; correctionResult?: string; profileId?: string } = body;

	if (!exerciseId || !messages?.length) error(400, 'exerciseId und messages erforderlich');

	const directus = getDirectus();
	const exercise = await directus.request(readItem('exercises', exerciseId));
	if (!exercise) error(404, 'Aufgabe nicht gefunden');

	const profile = await directus.request(readItem('profiles', exercise.profile_id));
	const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

	const isCorrectionChat = !!correctionResult;

	let claudeMessages: Anthropic.MessageParam[];

	if (isCorrectionChat) {
		// Correction follow-up: inject exercises + correction as context
		claudeMessages = [
			{
				role: 'user',
				content: 'Zeig mir die Aufgaben und die Korrektur.'
			},
			{
				role: 'assistant',
				content: `**Originalaufgaben:**\n\n${exercise.generated_content}\n\n---\n\n**Korrektur:**\n\n${correctionResult}`
			},
			...messages.map((m) => ({ role: m.role, content: m.text }))
		];
	} else {
		// Generation follow-up: inject exercises only
		claudeMessages = [
			{
				role: 'user',
				content: 'Bitte zeig mir die generierten Aufgaben.'
			},
			{
				role: 'assistant',
				content: exercise.generated_content ?? ''
			},
			...messages.map((m) => ({ role: m.role, content: m.text }))
		];
	}

	let systemPrompt: string;

	const featureRequestInstruction = `\n\nWenn der Nutzer einen Verbesserungswunsch oder Feature-Wunsch für die App äußert (z.B. "Ich wünschte, man könnte...", "Es wäre toll wenn...", "Kann man auch...?"), erkenne das still und hänge am absoluten Ende deiner Antwort (nach einer Leerzeile) exakt diese Zeile an: <!--FR:{"title":"kurzer Titel","description":"ausführliche Beschreibung"}-->\nDiese Zeile wird nicht angezeigt. Wenn kein Feature-Wunsch erkannt wird, hänge nichts an.`;

	if (isCorrectionChat) {
		systemPrompt = `Du bist ein einfühlsamer, geduldiger Lehrer für ${exercise.subject} an einem ${profile?.school_type ?? 'Gymnasium'} in ${profile?.state ?? 'Bayern'}, Klasse ${profile?.grade ?? 8}.
Der Schüler hat gerade seine Korrektur erhalten. Er kann jetzt:
- Nachfragen, warum etwas falsch war
- Erklären, was er sich dabei gedacht hat
- Um eine andere Erklärung bitten
- Über bestimmte Fehler sprechen
Antworte verständnisvoll, ermutigend und auf dem richtigen Niveau für Klasse ${profile?.grade ?? 8}.${featureRequestInstruction}`;
	} else {
		const lastUserMessage = messages[messages.length - 1].text.toLowerCase();
		const isUpdateRequest =
			/änder|anpass|mach|überarbeit|einfacher|schwerer|leichter|andere|mehr|weniger|ersetze|neue/i.test(
				lastUserMessage
			);
		systemPrompt = isUpdateRequest
			? `Du bist ein erfahrener Lehrer für ${exercise.subject} an einem ${profile?.school_type ?? 'Gymnasium'} in ${profile?.state ?? 'Bayern'}, Klasse ${profile?.grade ?? 8}.
Die aktuellen Übungsaufgaben wurden bereits generiert. Wenn der Schüler Änderungen wünscht, gibst du eine VOLLSTÄNDIG überarbeitete Version aller Aufgaben aus – im gleichen Format wie zuvor (nummeriert, mit Leerzeilen für Antworten). Keine Musterlösungen.
Wenn es eine reine Frage ist, beantworte sie kurz und klar.${featureRequestInstruction}`
			: `Du bist ein hilfreicher, geduldiger Lehrer für ${exercise.subject}. Beantworte Fragen zu den Aufgaben klar und einfach, passend für Klasse ${profile?.grade ?? 8}. Wenn der Schüler Änderungen an den Aufgaben möchte, setze sie um.${featureRequestInstruction}`;
	}

	const stream = await anthropic.messages.stream({
		model: 'claude-opus-4-8',
		max_tokens: 4096,
		thinking: { type: 'adaptive' },
		system: systemPrompt,
		messages: claudeMessages
	});

	const message = await stream.finalMessage();
	const rawReply = message.content.find((b) => b.type === 'text')?.text ?? '';

	// Extract and strip hidden feature request marker
	const frMatch = rawReply.match(/<!--FR:(\{.*?\})-->/s);
	const replyText = rawReply.replace(/\n?<!--FR:.*?-->/s, '').trimEnd();

	if (frMatch) {
		try {
			const fr = JSON.parse(frMatch[1]);
			if (fr.title) {
				await saveFeatureRequest(getDirectus(), fr.title, fr.description ?? null, profileId ?? null, 'chat_auto');
			}
		} catch { /* ignore parse errors */ }
	}

	// Only update exercises in generation context
	if (!isCorrectionChat) {
		const lastUserMessage = messages[messages.length - 1].text.toLowerCase();
		const isUpdateRequest =
			/änder|anpass|mach|überarbeit|einfacher|schwerer|leichter|andere|mehr|weniger|ersetze|neue/i.test(
				lastUserMessage
			);
		const looksLikeExercises = /^(#{1,3}\s|\d+\.|Aufgabe\s+\d+)/m.test(replyText) && isUpdateRequest;
		if (looksLikeExercises) {
			await directus.request(updateItem('exercises', exerciseId, { generated_content: replyText }));
		}
		return json({ reply: replyText, exercisesUpdated: looksLikeExercises });
	}

	return json({ reply: replyText });
};
