import { error, redirect } from '@sveltejs/kit';
import { requireActor } from '$lib/server/actor';
import { getProfile } from '$lib/server/repo/profiles';
import { getExercise, listExercises, deleteExercise } from '$lib/server/repo/exercises';
import { listCorrectionsForExercises, hasCorrection } from '$lib/server/repo/corrections';
import type { Actor } from '$lib/server/authz';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const actor = requireActor(locals);
	const profilId = url.searchParams.get('profil');

	const profile = await getProfile(actor, profilId);
	const exercises = await listExercises(actor, profile.id, 50);
	const corrections = await listCorrectionsForExercises(actor, exercises.map((e) => e.id));

	// Pro Aufgabe nur die neueste Korrektur.
	const latest = new Map(corrections.map((c) => [c.exercise_id, c]));

	return {
		profile,
		exercises: exercises.map((ex) => ({ ...ex, correction: latest.get(ex.id) ?? null }))
	};
};

/** Löschen und Ersetzen nur, solange die Übung noch nicht korrigiert wurde. */
async function guardUncorrected(actor: Actor, exerciseId: unknown) {
	const { exercise } = await getExercise(actor, exerciseId);
	if (await hasCorrection(actor, exercise.id)) error(400, 'Übung wurde bereits bearbeitet');
	return exercise;
}

export const actions: Actions = {
	delete: async ({ request, locals }) => {
		const actor = requireActor(locals);
		const data = await request.formData();
		const profilId = data.get('profilId') as string;

		const exercise = await guardUncorrected(actor, data.get('exerciseId'));
		await deleteExercise(actor, exercise.id);

		redirect(303, `/historie?profil=${encodeURIComponent(profilId)}`);
	},

	replace: async ({ request, locals }) => {
		const actor = requireActor(locals);
		const data = await request.formData();
		const profilId = data.get('profilId') as string;
		const subject = data.get('subject') as string;
		const topic = data.get('topic') as string;

		const exercise = await guardUncorrected(actor, data.get('exerciseId'));
		await deleteExercise(actor, exercise.id);

		const params = new URLSearchParams({ profil: profilId });
		if (subject) params.set('subject', subject);
		if (topic) params.set('topic', topic);
		redirect(303, `/generieren?${params}`);
	}
};
