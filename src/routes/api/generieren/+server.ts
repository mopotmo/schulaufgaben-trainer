import { getDirectus } from '$lib/directus';
import { createItem, uploadFiles, readItem } from '@directus/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { json, error } from '@sveltejs/kit';
import Anthropic from '@anthropic-ai/sdk';
import { logError } from '$lib/logger';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const form = await request.formData();
	const profilId = form.get('profilId') as string;
	const subject = form.get('subject') as string;
	const topic = form.get('topic') as string;
	const teacherNotes = (form.get('teacherNotes') as string) ?? '';
	const count = parseInt(form.get('count') as string) || 5;
	const difficulty = (form.get('difficulty') as string) ?? 'mittel';
	const durationMinutes = parseInt(form.get('durationMinutes') as string) || 0;
	const sourceFiles = (form.getAll('sourceFiles') as File[]).filter((f) => f && f.size > 0);

	if (!profilId || !subject || !topic) error(400, 'Pflichtfelder fehlen');

	const directus = getDirectus();
	const profile = await directus.request(readItem('profiles', profilId));

	const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

	const userContentParts: Anthropic.MessageParam['content'] = [];

	if (sourceFiles.length > 0) {
		if (sourceFiles.length > 1) {
			userContentParts.push({
				type: 'text',
				text: `Hier sind ${sourceFiles.length} Seiten aus dem Schulbuch / Arbeitsblatt als Referenz:`
			});
		}
		for (let i = 0; i < sourceFiles.length; i++) {
			const file = sourceFiles[i];
			const mediaType = (file.type || 'image/jpeg') as
				| 'image/jpeg'
				| 'image/png'
				| 'image/gif'
				| 'image/webp';
			if (!mediaType.startsWith('image/')) continue;
			const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
			if (sourceFiles.length > 1) userContentParts.push({ type: 'text', text: `Seite ${i + 1}:` });
			userContentParts.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } });
		}
	}

	userContentParts.push({
		type: 'text',
		text: [
			`Thema: ${topic}`,
			teacherNotes ? `Hinweis vom Lehrer: ${teacherNotes}` : '',
			`Erstelle ${count} Übungsaufgaben, Schwierigkeitsgrad ${difficulty}.`,
			durationMinutes > 0
				? `Die Aufgaben sollen in ${durationMinutes} Minuten lösbar sein – passe Anzahl und Umfang der Aufgaben entsprechend an, auch wenn das von der gewünschten Anzahl abweicht.`
				: '',
			`Format: Jede Aufgabe beginnt mit "Aufgabe X (Y Punkte):" – vergib sinnvolle Punktzahlen passend zur Schwierigkeit und zum Umfang der Aufgabe (z.B. 2–6 Punkte pro Aufgabe). Am Ende eine Zeile: "Gesamt: Z Punkte"`,
			`Darunter ausreichend Leerzeilen für handschriftliche Antworten.`,
			`Wichtig: Nur die Aufgaben ausgeben, keine Musterlösungen.`
		]
			.filter(Boolean)
			.join('\n')
	});

	let generatedContent = '';
	let tokensUsed = 0;

	try {
		const stream = await anthropic.messages.stream({
			model: 'claude-opus-4-8',
			max_tokens: 4096,
			thinking: { type: 'adaptive' },
			system: `Du bist ein erfahrener Lehrer für ${subject} an einem ${profile.school_type} in ${profile.state}, Klasse ${profile.grade}. Erstelle Übungsaufgaben, die sich zum Ausdrucken eignen (klare Struktur, ausreichend Platz zum Schreiben).`,
			messages: [{ role: 'user', content: userContentParts }]
		});

		const message = await stream.finalMessage();
		generatedContent = message.content.find((b) => b.type === 'text')?.text ?? '';
		tokensUsed = (message.usage.input_tokens ?? 0) + (message.usage.output_tokens ?? 0);
	} catch (e) {
		await logError('api/generieren', e, { profilId, subject, topic });
		error(502, 'Fehler bei der Aufgabengenerierung');
	}

	let sourceFileId: string | null = null;
	if (sourceFiles.length > 0) {
		try {
			const uploadForm = new FormData();
			uploadForm.append('file', sourceFiles[0]);
			const uploaded = await directus.request(uploadFiles(uploadForm));
			sourceFileId = (uploaded as any).id ?? null;
		} catch (e) {
			await logError('api/generieren/upload', e, { profilId });
		}
	}

	const exercise = await directus.request(
		createItem('exercises', {
			profile_id: profilId,
			subject,
			topic,
			teacher_notes: teacherNotes,
			generated_content: generatedContent,
			source_file: sourceFileId,
			tokens_used: tokensUsed
		})
	);

	return json({ exerciseId: exercise.id, content: generatedContent, tokensUsed });
};
