/** Korrekturen. Scope läuft über die Aufgabe und von dort über das Profil. */
import { readItem, readItems, createItem } from '@directus/sdk';
import { error } from '@sveltejs/kit';
import { getDirectus, type Correction, type Exercise, type Profile } from '$lib/server/directus';
import { assertCan, type Actor } from '../authz';
import { requireUuid } from './profiles';
import { getExercise } from './exercises';

export async function getCorrection(
	actor: Actor,
	correctionId: unknown
): Promise<{ correction: Correction; exercise: Exercise; profile: Profile }> {
	assertCan(actor, 'correction:read');
	const id = requireUuid(correctionId, 'Korrektur-ID');

	const correction = await getDirectus().request(readItem('corrections', id)).catch(() => null);
	if (!correction) error(404, 'Korrektur nicht gefunden');

	const { exercise, profile } = await getExercise(actor, correction.exercise_id);
	return { correction, exercise, profile };
}

/** Korrekturen zu mehreren Aufgaben. Die IDs müssen vorher im Scope geprüft sein. */
export async function listCorrectionsForExercises(
	actor: Actor,
	exerciseIds: string[]
): Promise<Correction[]> {
	assertCan(actor, 'correction:read');
	if (exerciseIds.length === 0) return [];
	return getDirectus().request(
		readItems('corrections', {
			filter: { exercise_id: { _in: exerciseIds } },
			sort: ['-created_at'],
			limit: -1
		})
	);
}

/** Wurde diese Aufgabe schon korrigiert? */
export async function hasCorrection(actor: Actor, exerciseId: string): Promise<boolean> {
	const existing = await listCorrectionsForExercises(actor, [exerciseId]);
	return existing.length > 0;
}

export type NewCorrection = {
	solution_file: string | null;
	correction_result: string;
	tokens_used: number | null;
};

export async function createCorrection(
	actor: Actor,
	exerciseId: unknown,
	data: NewCorrection
): Promise<Correction> {
	assertCan(actor, 'correction:create');
	const { exercise } = await getExercise(actor, exerciseId);
	return getDirectus().request(createItem('corrections', { ...data, exercise_id: exercise.id }));
}
