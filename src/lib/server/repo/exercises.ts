/**
 * Aufgaben. `exercises` trägt nur `profile_id` — der Scope läuft also über das Profil
 * und dessen `group_id` (Spec §3.4).
 */
import { readItem, readItems, createItem, updateItem, deleteItem } from '@directus/sdk';
import { error } from '@sveltejs/kit';
import { getDirectus, type Exercise, type Profile } from '$lib/server/directus';
import { assertCan, assertInScope, type Actor } from '../authz';
import { getProfile, requireUuid, resolveProfileGroup } from './profiles';

/** Lädt die Aufgabe und prüft den Scope über das zugehörige Profil. */
export async function getExercise(
	actor: Actor,
	exerciseId: unknown
): Promise<{ exercise: Exercise; profile: Profile }> {
	assertCan(actor, 'exercise:read');
	const id = requireUuid(exerciseId, 'Aufgaben-ID');

	const exercise = await getDirectus().request(readItem('exercises', id)).catch(() => null);
	if (!exercise) error(404, 'Aufgabe nicht gefunden');

	assertInScope(actor, await resolveProfileGroup(actor, exercise.profile_id));
	// getProfile prüft zusätzlich, dass ein angemeldetes Kind nur eigene Aufgaben sieht.
	const profile = await getProfile(actor, exercise.profile_id);
	return { exercise, profile };
}

export async function listExercises(
	actor: Actor,
	profileId: unknown,
	limit = 50
): Promise<Exercise[]> {
	assertCan(actor, 'exercise:read');
	const profile = await getProfile(actor, profileId);

	return getDirectus().request(
		readItems('exercises', {
			filter: { profile_id: { _eq: profile.id } },
			sort: ['-created_at'],
			limit
		})
	);
}

export type NewExercise = {
	subject: string;
	topic: string;
	teacher_notes: string;
	generated_content: string;
	source_file: string | null;
	tokens_used: number | null;
};

export async function createExercise(
	actor: Actor,
	profileId: unknown,
	data: NewExercise
): Promise<Exercise> {
	assertCan(actor, 'exercise:create');
	const profile = await getProfile(actor, profileId);
	return getDirectus().request(createItem('exercises', { ...data, profile_id: profile.id }));
}

export async function updateExerciseContent(
	actor: Actor,
	exerciseId: unknown,
	generatedContent: string
): Promise<void> {
	assertCan(actor, 'exercise:create');
	const { exercise } = await getExercise(actor, exerciseId);
	await getDirectus().request(
		updateItem('exercises', exercise.id, { generated_content: generatedContent })
	);
}

export async function deleteExercise(actor: Actor, exerciseId: unknown): Promise<void> {
	assertCan(actor, 'exercise:delete');
	const { exercise } = await getExercise(actor, exerciseId);
	await getDirectus().request(deleteItem('exercises', exercise.id));
}
