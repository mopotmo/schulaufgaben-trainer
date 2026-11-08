import { ANTHROPIC_API_KEY } from '$env/static/private';
import { json, error } from '@sveltejs/kit';
import Anthropic from '@anthropic-ai/sdk';
import { logError } from '$lib/server/logger';
import { requireActor } from '$lib/server/actor';
import { getProfile } from '$lib/server/repo/profiles';
import { createExercise, listSubjects } from '$lib/server/repo/exercises';
import { attachExerciseFiles } from '$lib/server/repo/files';
import { MAX_FILES, IMAGE_TYPES, transcribe, type Erfasst, type ImageType } from '$lib/server/aufgabeErfassen';
import type { RequestHandler } from './$types';

/**
 * Fremde Aufgabe erfassen (Konzept fremde Aufgaben §4.1): Fotos oder PDF eines Arbeitsblatts,
 * einer Hausaufgabe oder einer Buchseite abschreiben lassen und als Aufgabe mit
 * `origin = 'external'` anlegen. Die Prüfansicht auf `/eigene-aufgabe` zeigt das Ergebnis
 * zum Berichtigen.
 */

export const POST: RequestHandler = async ({ request, locals }) => {
	const actor = requireActor(locals);
	const form = await request.formData();
	const profile = await getProfile(actor, form.get('profileId'));

	const text = ((form.get('text') as string | null) ?? '').trim();
	const pick = (name: string) => (form.getAll(name) as File[]).filter((f) => f instanceof File && f.size > 0);
	const files = pick('files');
	// Zusatzmaterial (Bild zur Bildbeschreibung, Lösungen aus dem Buch) wird nicht abgeschrieben,
	// nur gespeichert — die Korrektur bekommt es mit.
	const material = pick('material');
	if (files.length === 0 && !text) error(400, 'Bitte ein Foto hochladen oder die Aufgabe eintippen');
	if (files.length + material.length > MAX_FILES) error(400, `Höchstens ${MAX_FILES} Dateien`);
	for (const f of [...files, ...material]) {
		if (!IMAGE_TYPES.includes(f.type as ImageType) && f.type !== 'application/pdf') {
			error(400, `Dateityp nicht unterstützt: ${f.name}`);
		}
	}

	const subjects = await listSubjects(actor, profile.id);

	const uploads = await Promise.all(
		files.map(async (f) => ({ type: f.type, data: Buffer.from(await f.arrayBuffer()).toString('base64') }))
	);

	let erfasst: Erfasst;
	let tokensUsed = 0;
	try {
		const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
		({ erfasst, tokensUsed } = await transcribe(anthropic, {
			uploads,
			text,
			subjects,
			schoolType: profile.school_type,
			grade: profile.grade
		}));
	} catch (e) {
		await logError('api/aufgabe-erfassen', e, { files: files.length, text: text.length > 0 });
		error(502, 'Die Aufgabe konnte nicht gelesen werden');
	}

	if (!erfasst.content) error(422, 'Auf den Fotos war keine Aufgabe zu erkennen');

	const exercise = await createExercise(actor, profile.id, {
		origin: 'external',
		task_kind: erfasst.taskKind,
		subject: erfasst.subject || 'Unbekannt',
		topic: erfasst.topic || 'Eigene Aufgabe',
		teacher_notes: '',
		generated_content: erfasst.content,
		tokens_used: tokensUsed
	});

	// Nicht fatal — die Aufgabe ist schon gespeichert. Ohne die Fotos fehlt später aber die
	// Lösung, wenn sie mit auf dem Blatt steht; das meldet die Antwort.
	let filesSaved = true;
	try {
		await attachExerciseFiles(actor, exercise.id, files);
		await attachExerciseFiles(actor, exercise.id, material, 'material');
	} catch (e) {
		filesSaved = false;
		await logError('api/aufgabe-erfassen/upload', e, { files: files.length, material: material.length });
	}

	return json({
		...erfasst,
		exerciseId: exercise.id,
		subject: exercise.subject,
		topic: exercise.topic,
		filesSaved
	});
};
