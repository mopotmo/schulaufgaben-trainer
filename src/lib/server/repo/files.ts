/**
 * Datei-Uploads nach Directus. Eigene Datei, weil mehrere Routen hochladen und `getDirectus()`
 * laut harter Regel 1 nur hier und in den übrigen Repos vorkommen darf.
 *
 * Die Dateien selbst tragen keine Gruppenzuordnung — sie hängen über `exercises_files` bzw.
 * `corrections_files` an einer Aufgabe oder Korrektur, deren Scope vor dem Hochladen geprüft
 * wird. Bis die Zuordnung steht, ist eine Datei verwaist; schlägt das Anlegen fehl, werden die
 * gerade hochgeladenen Dateien wieder gelöscht.
 */
import { uploadFiles, createItems, readItems, deleteFiles } from '@directus/sdk';
import { getDirectus, type ExerciseFileRole } from '../directus';
import type { Actor } from '../authz';
import { getExercise } from './exercises';
import { getCorrection } from './corrections';

/** Lädt die Dateien einzeln hoch und gibt die IDs in derselben Reihenfolge zurück. */
async function upload(files: File[]): Promise<string[]> {
	const directus = getDirectus();
	const ids: string[] = [];
	try {
		for (const file of files) {
			const form = new FormData();
			form.append('file', file);
			const uploaded = (await directus.request(uploadFiles(form))) as { id?: string };
			if (!uploaded.id) throw new Error('Upload ohne Datei-ID');
			ids.push(uploaded.id);
		}
	} catch (e) {
		if (ids.length) await directus.request(deleteFiles(ids)).catch(() => undefined);
		throw e;
	}
	return ids;
}

/**
 * Hängt alle Dateien in Reihenfolge an die Aufgabe (Aufgabenblatt, Buchseiten). `material` nur
 * bei fremden Aufgaben: Zusatz, der nicht abgeschrieben, aber bei der Korrektur mitgegeben wird.
 */
export async function attachExerciseFiles(
	actor: Actor,
	exerciseId: unknown,
	files: File[],
	role: ExerciseFileRole = 'task'
): Promise<string[]> {
	if (files.length === 0) return [];
	const { exercise } = await getExercise(actor, exerciseId);
	const ids = await upload(files);
	try {
		await getDirectus().request(
			createItems('exercises_files', ids.map((file, sort) => ({ exercise_id: exercise.id, file, sort, role })))
		);
	} catch (e) {
		await getDirectus().request(deleteFiles(ids)).catch(() => undefined);
		throw e;
	}
	return ids;
}

/** Hängt alle Dateien in Reihenfolge an die Korrektur (Lösungsfotos, Stift-Antworten). */
export async function attachCorrectionFiles(actor: Actor, correctionId: unknown, files: File[]): Promise<string[]> {
	if (files.length === 0) return [];
	const { correction } = await getCorrection(actor, correctionId);
	const ids = await upload(files);
	try {
		await getDirectus().request(
			createItems('corrections_files', ids.map((file, sort) => ({ correction_id: correction.id, file, sort })))
		);
	} catch (e) {
		await getDirectus().request(deleteFiles(ids)).catch(() => undefined);
		throw e;
	}
	return ids;
}

/**
 * Datei-IDs je Aufgabe bzw. Korrektur, in Reihenfolge. Die IDs müssen vorher im Scope geprüft
 * sein (wie `listCorrectionsForExercises`). Leere Listen ergeben keine Abfrage — harte Regel 3.
 */
export async function listFilesFor(
	exerciseIds: string[],
	correctionIds: string[]
): Promise<{ exercises: Map<string, string[]>; corrections: Map<string, string[]> }> {
	const directus = getDirectus();
	const [ex, co] = await Promise.all([
		exerciseIds.length
			? directus.request(
					readItems('exercises_files', {
						fields: ['exercise_id', 'file', 'sort'],
						filter: { exercise_id: { _in: exerciseIds } },
						sort: ['exercise_id', 'sort'],
						limit: -1
					})
				)
			: [],
		correctionIds.length
			? directus.request(
					readItems('corrections_files', {
						fields: ['correction_id', 'file', 'sort'],
						filter: { correction_id: { _in: correctionIds } },
						sort: ['correction_id', 'sort'],
						limit: -1
					})
				)
			: []
	]);
	const group = <T,>(rows: T[], key: (r: T) => string, file: (r: T) => string) => {
		const map = new Map<string, string[]>();
		for (const r of rows) map.set(key(r), [...(map.get(key(r)) ?? []), file(r)]);
		return map;
	};
	return {
		exercises: group(ex, (r) => r.exercise_id, (r) => r.file),
		corrections: group(co, (r) => r.correction_id, (r) => r.file)
	};
}
