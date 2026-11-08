import { error, redirect } from '@sveltejs/kit';
import { requireActor } from '$lib/server/actor';
import { getProfile } from '$lib/server/repo/profiles';
import { getExercise, listExercises, deleteExercise } from '$lib/server/repo/exercises';
import { listCorrectionsForExercises, hasCorrection, canResubmit } from '$lib/server/repo/corrections';
import type { Correction } from '$lib/server/directus';
import type { Actor } from '$lib/server/authz';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const actor = requireActor(locals);
	const profilId = url.searchParams.get('profil');

	const profile = await getProfile(actor, profilId);
	const exercises = await listExercises(actor, profile.id, 50);
	const corrections = await listCorrectionsForExercises(actor, exercises.map((e) => e.id));

	// Alle Durchgänge je Aufgabe, neueste zuerst (`listCorrectionsForExercises` sortiert so).
	// Früher stand hier `new Map(entries)` — dabei gewinnt der letzte Eintrag, also die älteste
	// Korrektur. Mit nur einer Korrektur je Aufgabe fiel das nicht auf.
	const byExercise = new Map<string, Correction[]>();
	for (const c of corrections) byExercise.set(c.exercise_id, [...(byExercise.get(c.exercise_id) ?? []), c]);

	return {
		profile,
		exercises: exercises.map((ex) => {
			const all = byExercise.get(ex.id) ?? [];
			return { ...ex, correction: all[0] ?? null, corrections: all, canResubmit: canResubmit(ex, profile) };
		})
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
