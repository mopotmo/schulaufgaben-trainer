import { ANTHROPIC_API_KEY } from '$env/static/private';
import { json, error } from '@sveltejs/kit';
import Anthropic from '@anthropic-ai/sdk';
import { logError } from '$lib/server/logger';
import { upsertInsight } from '$lib/server/learnerInsights';
import { requireActor } from '$lib/server/actor';
import { getExercise } from '$lib/server/repo/exercises';
import { createCorrection, latestCorrection } from '$lib/server/repo/corrections';
import { attachCorrectionFiles, readExerciseFiles, type StoredFile } from '$lib/server/repo/files';
import { HINTS_ONLY_CHAT, HINTS_TOOL, hintsInstruction, markdownInstruction, renderHints, type Mode } from '$lib/server/korrektur';
import type { ImageType } from '$lib/server/aufgabeErfassen';
import type { RequestHandler } from './$types';
import { finalText } from '$lib/server/anthropic';

export const POST: RequestHandler = async ({ request, locals }) => {
	const form = await request.formData();
	const exerciseId = form.get('exerciseId') as string;
	// „Diese Lösung nicht auswerten" — schränkt nur ein; ob überhaupt ausgewertet wird,
	// entscheidet das Opt-in der Eltern in `upsertInsight`.
	const evaluate = form.get('evaluate') !== 'false';
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
	// Fremde Aufgabe, deren Lösung schon auf den Aufgabenfotos steht (Konzept §4.1): die
	// gespeicherten Fotos sind die Lösung, nichts wird neu hochgeladen.
	const useSheet = form.get('useSheet') === 'true';

	if (!exerciseId || (!hasMeta && !hasText && !hasFiles && !useSheet)) {
		error(400, 'Aufgabe und Lösung (Text oder Datei) erforderlich');
	}

	const actor = requireActor(locals);
	const { exercise, profile } = await getExercise(actor, exerciseId);
	if (useSheet && exercise.origin !== 'external') error(400, 'Nur bei eigenen Aufgaben');

	// „Nur Hinweise" kommt aus dem Profil der Aufgabe, nie aus dem Formular (§4.7).
	const mode: Mode = { origin: exercise.origin, taskKind: exercise.task_kind, hintsOnly: profile.hints_only };

	let stored: StoredFile[] = [];
	if (exercise.origin === 'external') {
		try {
			stored = await readExerciseFiles(actor, exercise.id);
		} catch (e) {
			await logError('api/korrigieren/dateien', e, { exerciseId });
			if (useSheet) error(502, 'Die gespeicherten Fotos konnten nicht geladen werden');
		}
	}
	const sheet = useSheet ? stored.filter((f) => f.role === 'task') : [];
	const material = stored.filter((f) => f.role === 'material');
	if (useSheet && sheet.length === 0) error(400, 'Zu dieser Aufgabe sind keine Fotos gespeichert');

	const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

	const block = (type: string, data: string): Anthropic.ContentBlockParam =>
		type === 'application/pdf'
			? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
			: { type: 'image', source: { type: 'base64', media_type: type as ImageType, data } };

	const userContent: Anthropic.ContentBlockParam[] = [
		{ type: 'text', text: `Hier sind die Originalaufgaben:\n\n${exercise.generated_content}` }
	];

	if (material.length) {
		userContent.push({
			type: 'text',
			text: 'Material zur Aufgabe (z. B. Bild, Text oder Lösungen aus dem Buch). Sind es Lösungen, prüfe gegen sie:'
		});
		for (const f of material) userContent.push(block(f.type, f.data));
	}

	if (useSheet) {
		userContent.push({ type: 'text', text: 'Die Lösung des Schülers steht auf diesen Fotos, zusammen mit der Aufgabe:' });
		for (const f of sheet) userContent.push(block(f.type, f.data));
		if (hasText) {
			userContent.push({
				type: 'text',
				text: `So wurde der Text des Schülers abgeschrieben; Lesefehler hat er berichtigt. Bewerte diesen Text, die Fotos dienen nur zur Kontrolle:\n\n${textAnswers}`
			});
		}
	} else if (hasMeta) {
		// Browser mode: per-exercise answers, typed and/or handwritten (stylus).
		userContent.push({
			type: 'text',
			text: 'Es folgen die Antworten des Schülers, aufgabenweise. Handschriftliche (mit dem Stift geschriebene) Antworten sind jeweils als Bild angehängt.'
		});
		let imgIdx = 0;
		for (const m of answersMeta!) {
			if (m.kind === 'draw') {
				const file = validFiles[imgIdx++];
				userContent.push({ type: 'text', text: `${m.title} (handschriftlich):` });
				if (file) {
					const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
					userContent.push(block(file.type || 'image/png', base64));
				}
			} else {
				userContent.push({ type: 'text', text: `${m.title}:\n${m.text ?? ''}` });
			}
		}
	} else if (hasText) {
		// Browser mode: text answers (legacy / other pages)
		userContent.push({
			type: 'text',
			text: `Hier sind die Antworten des Schülers (im Browser eingegeben):\n\n${textAnswers}`
		});
	} else {
		// Scan mode: image upload
		userContent.push({
			type: 'text',
			text: `Es folgen ${validFiles.length === 1 ? 'ein Bild' : `${validFiles.length} Bilder`} mit der handgeschriebenen Lösung des Schülers.`
		});
		for (let i = 0; i < validFiles.length; i++) {
			const file = validFiles[i];
			const type = file.type || 'image/jpeg';
			if (!type.startsWith('image/') && type !== 'application/pdf') continue;
			const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
			if (validFiles.length > 1) userContent.push({ type: 'text', text: `Seite ${i + 1}:` });
			userContent.push(block(type, base64));
		}
	}

	// Nachbessern (§4.4): Die vorige Korrektur geht mit, damit der nächste Durchgang darauf
	// aufbaut, statt von vorn anzufangen.
	const previous = await latestCorrection(actor, exercise.id);
	if (previous) {
		userContent.push({
			type: 'text',
			text: `Das ist eine überarbeitete Lösung. So lautete die vorige Korrektur:\n\n${previous.correction_result}\n\nBewerte die überarbeitete Lösung vollständig neu. Sag bei Teilaufgaben, die vorher falsch waren, ob sie jetzt stimmen, und lobe Verbesserungen ausdrücklich.`
		});
	}

	userContent.push({ type: 'text', text: mode.hintsOnly ? hintsInstruction(mode) : markdownInstruction(mode) });

	let result = '';
	let tokensUsed = 0;

	const system = [
		'Du bist ein korrigierender Lehrer. Sei konstruktiv, ermutigend, aber präzise bei Fehlern.',
		mode.hintsOnly ? HINTS_ONLY_CHAT : ''
	]
		.filter(Boolean)
		.join('\n\n');
	const usage = (m: Anthropic.Message) => (m.usage.input_tokens ?? 0) + (m.usage.output_tokens ?? 0);
	const logContext = {
		exerciseId,
		mode: useSheet ? 'sheet' : hasMeta ? 'browser' : hasText ? 'text' : 'scan',
		hintsOnly: mode.hintsOnly
	};

	try {
		const message = await anthropic.messages
			.stream({
				model: 'claude-opus-4-8',
				// Mit Thinking geht ein Teil des Budgets ans Nachdenken; reicht der Rest nicht, bricht
				// der Werkzeugaufruf ab und kommt leer an.
				max_tokens: mode.hintsOnly ? 16000 : mode.taskKind === 'free_text' ? 8192 : 4096,
				thinking: { type: 'adaptive' },
				// Erzwungene Werkzeugwahl verträgt sich nicht mit Thinking — deshalb `auto` und die
				// Anweisung, das Werkzeug zu benutzen.
				...(mode.hintsOnly ? { tools: [HINTS_TOOL], tool_choice: { type: 'auto' as const } } : {}),
				system,
				messages: [{ role: 'user', content: userContent }]
			})
			.finalMessage();
		tokensUsed = usage(message);

		if (!mode.hintsOnly) {
			result = finalText(message);
		} else {
			const call = message.content.find((b) => b.type === 'tool_use');
			try {
				result = renderHints(call?.input);
			} catch (e) {
				// Zweiter Versuch: Werkzeug erzwungen, ohne Thinking. Lieber etwas weniger gründlich
				// als gar keine Korrektur.
				await logError('api/korrigieren/hinweise', e, {
					...logContext,
					stopReason: message.stop_reason,
					input: JSON.stringify(call?.input ?? null).slice(0, 500)
				});
				const retry = await anthropic.messages
					.stream({
						model: 'claude-opus-4-8',
						max_tokens: 8192,
						tools: [HINTS_TOOL],
						tool_choice: { type: 'tool', name: HINTS_TOOL.name },
						system,
						messages: [{ role: 'user', content: userContent }]
					})
					.finalMessage();
				tokensUsed += usage(retry);
				result = renderHints(retry.content.find((b) => b.type === 'tool_use')?.input);
			}
		}
	} catch (e) {
		await logError('api/korrigieren', e, logContext);
		error(502, 'Fehler bei der Korrektur');
	}

	const correction = await createCorrection(actor, exercise.id, {
		correction_result: result,
		tokens_used: tokensUsed
	});

	// Alle Seiten bzw. Stift-Antworten, nicht nur die erste. Nicht fatal — der Korrekturtext ist
	// schon gespeichert.
	try {
		await attachCorrectionFiles(actor, correction.id, validFiles);
	} catch (e) {
		await logError('api/korrigieren/upload', e, { exerciseId, files: validFiles.length });
	}

	// Insights asynchron extrahieren — nicht auf Ergebnis warten
	if (evaluate) {
		const insightInput = `Korrektur der Aufgabe:\n${exercise.generated_content}\n\nKorrekturbericht:\n${result}`;
		upsertInsight(actor, exercise.profile_id, exercise.subject, exercise.topic, insightInput).catch(() => {});
	}

	return json({ result, tokensUsed, correctionId: correction.id });
};
