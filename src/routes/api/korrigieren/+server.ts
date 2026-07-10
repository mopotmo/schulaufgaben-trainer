import { getDirectus } from '$lib/directus';
import { readItem, createItem, uploadFiles } from '@directus/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { json, error } from '@sveltejs/kit';
import Anthropic from '@anthropic-ai/sdk';
import { logError } from '$lib/logger';
import { upsertInsight } from '$lib/learnerInsights';
import type { RequestHandler } from './$types';

const GRADE_SCALE = `
Notenschlüssel (bayerisches Gymnasium):
- Note 1 (sehr gut):       ≥ 87 %
- Note 2 (gut):            ≥ 75 %
- Note 3 (befriedigend):   ≥ 60 %
- Note 4 (ausreichend):    ≥ 45 %
- Note 5 (mangelhaft):     ≥ 20 %
- Note 6 (ungenügend):     < 20 %`;

export const POST: RequestHandler = async ({ request }) => {
	const form = await request.formData();
	const exerciseId = form.get('exerciseId') as string;
	const showGrade = form.get('showGrade') === 'true';
	const textAnswers = (form.get('textAnswers') as string | null)?.trim() ?? '';
	const solutionFiles = form.getAll('solutionFiles') as File[];
	const validFiles = solutionFiles.filter((f) => f && f.size > 0);

	// Structured per-exercise answers (browser solve mode: mixed typing + stylus).
	type AnswerMeta = { title: string; kind: 'text' | 'draw'; text?: string };
	let answersMeta: AnswerMeta[] | null = null;
	const answersMetaRaw = form.get('answersMeta') as string | null;
	if (answersMetaRaw) {
		try {
			const parsed = JSON.parse(answersMetaRaw);
			if (Array.isArray(parsed) && parsed.length > 0) answersMeta = parsed;
		} catch {
			// ignore malformed metadata, fall through to legacy handling
		}
	}

	const hasMeta = !!answersMeta;
	const hasText = textAnswers.length > 0;
	const hasFiles = validFiles.length > 0;

	if (!exerciseId || (!hasMeta && !hasText && !hasFiles)) {
		error(400, 'Aufgabe und Lösung (Text oder Datei) erforderlich');
	}

	const directus = getDirectus();
	const exercise = await directus.request(readItem('exercises', exerciseId));
	if (!exercise) error(404, 'Aufgabe nicht gefunden');

	const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

	const correctionInstruction = `Bitte korrigiere jede Aufgabe einzeln nach folgendem Format:

**Aufgabe X** (erreicht: Y / Z Punkte)
- Richtig / Teilweise richtig / Falsch
- Bei Fehlern: kurze Erklärung was falsch war und warum

Danach eine **Gesamtauswertung**:
- Erreichte Punkte gesamt: Y von Z
- Prozentsatz: X %
${showGrade ? `- Note: [Note berechnen nach folgendem Schlüssel]\n${GRADE_SCALE}` : ''}

Abschließend 1–2 konkrete **Verbesserungstipps**.

Sei konstruktiv und ermutigend.`;

	let userContent: Anthropic.MessageParam['content'];

	if (hasMeta) {
		// Browser mode: per-exercise answers, typed and/or handwritten (stylus).
		userContent = [
			{
				type: 'text',
				text: `Hier sind die Originalaufgaben:\n\n${exercise.generated_content}\n\nEs folgen die Antworten des Schülers, aufgabenweise. Handschriftliche (mit dem Stift geschriebene) Antworten sind jeweils als Bild angehängt.`
			}
		];

		let imgIdx = 0;
		for (const m of answersMeta!) {
			if (m.kind === 'draw') {
				const file = validFiles[imgIdx++];
				userContent.push({ type: 'text', text: `${m.title} (handschriftlich):` });
				if (file) {
					const mediaType = (file.type || 'image/png') as
						| 'image/jpeg'
						| 'image/png'
						| 'image/gif'
						| 'image/webp';
					const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
					userContent.push({
						type: 'image',
						source: { type: 'base64', media_type: mediaType, data: base64 }
					});
				}
			} else {
				userContent.push({ type: 'text', text: `${m.title}:\n${m.text ?? ''}` });
			}
		}

		userContent.push({ type: 'text', text: correctionInstruction });
	} else if (hasText) {
		// Browser mode: text answers (legacy / other pages)
		userContent = [
			{
				type: 'text',
				text: `Hier sind die Originalaufgaben:\n\n${exercise.generated_content}\n\nHier sind die Antworten des Schülers (im Browser eingegeben):\n\n${textAnswers}\n\n${correctionInstruction}`
			}
		];
	} else {
		// Scan mode: image upload
		userContent = [
			{
				type: 'text',
				text: `Hier sind die Originalaufgaben:\n\n${exercise.generated_content}\n\nEs folgen ${validFiles.length === 1 ? 'ein Bild' : `${validFiles.length} Bilder`} mit der handgeschriebenen Lösung des Schülers.`
			}
		];

		for (let i = 0; i < validFiles.length; i++) {
			const file = validFiles[i];
			const mediaType = (file.type || 'image/jpeg') as
				| 'image/jpeg'
				| 'image/png'
				| 'image/gif'
				| 'image/webp';
			if (!mediaType.startsWith('image/')) continue;
			const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
			if (validFiles.length > 1) userContent.push({ type: 'text', text: `Seite ${i + 1}:` });
			userContent.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } });
		}

		userContent.push({ type: 'text', text: correctionInstruction });
	}

	let result = '';
	let tokensUsed = 0;

	try {
		const stream = await anthropic.messages.stream({
			model: 'claude-opus-4-8',
			max_tokens: 4096,
			thinking: { type: 'adaptive' },
			system: 'Du bist ein korrigierender Lehrer. Sei konstruktiv, ermutigend, aber präzise bei Fehlern.',
			messages: [{ role: 'user', content: userContent }]
		});

		const message = await stream.finalMessage();
		result = message.content.find((b) => b.type === 'text')?.text ?? '';
		tokensUsed = (message.usage.input_tokens ?? 0) + (message.usage.output_tokens ?? 0);
	} catch (e) {
		await logError('api/korrigieren', e, {
			exerciseId,
			mode: hasMeta ? 'browser' : hasText ? 'text' : 'scan'
		});
		error(502, 'Fehler bei der Korrektur');
	}

	let solutionFileId: string | null = null;
	if (hasFiles) {
		try {
			const uploadForm = new FormData();
			uploadForm.append('file', validFiles[0]);
			const uploaded = await directus.request(uploadFiles(uploadForm));
			solutionFileId = (uploaded as any).id ?? null;
		} catch (e) {
			await logError('api/korrigieren/upload', e, { exerciseId });
		}
	}

	await directus.request(
		createItem('corrections', {
			exercise_id: exerciseId,
			solution_file: solutionFileId,
			correction_result: result,
			tokens_used: tokensUsed
		})
	);

	// Insights asynchron extrahieren — nicht auf Ergebnis warten
	const insightInput = `Korrektur der Aufgabe:\n${exercise.generated_content}\n\nKorrekturbericht:\n${result}`;
	upsertInsight(exercise.profile_id, exercise.subject, exercise.topic, insightInput).catch(() => {});

	return json({ result, tokensUsed });
};
