import { getDirectus } from '$lib/directus';
import { readItems, deleteItem } from '@directus/sdk';
import { error, redirect } from '@sveltejs/kit';
import { requireFamilyId, assertProfileInFamily, assertExerciseInFamily } from '$lib/server/scope';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const familyId = requireFamilyId(locals);
	// Erst den Scope prüfen, dann laden — nicht umgekehrt.
	const profile = await assertProfileInFamily(url.searchParams.get('profil'), familyId);

	const directus = getDirectus();
	const exercises = await directus.request(
		readItems('exercises', {
			filter: { profile_id: { _eq: profile.id } },
			sort: ['-created_at'],
			limit: 50
		})
	);

	// Load corrections for all exercises
	const exerciseIds = exercises.map((e) => e.id);
	const corrections =
		exerciseIds.length > 0
			? await directus.request(
					readItems('corrections', {
						filter: { exercise_id: { _in: exerciseIds } },
						sort: ['-created_at']
					})
				)
			: [];

	// Group corrections by exercise_id (keep only latest per exercise)
	const correctionByExercise = new Map(
		corrections.map((c) => [c.exercise_id, c])
	);

	return {
		profile,
		exercises: exercises.map((ex) => ({
			...ex,
			correction: correctionByExercise.get(ex.id) ?? null
		}))
	};
};

async function guardExercise(exerciseId: unknown, familyId: string) {
	const { exercise } = await assertExerciseInFamily(exerciseId, familyId);

	const directus = getDirectus();
	const corrections = await directus.request(
		readItems('corrections', { filter: { exercise_id: { _eq: exercise.id } }, limit: 1 })
	);
	if (corrections.length > 0) error(400, 'Übung wurde bereits bearbeitet');
	return { directus, exercise };
}

export const actions: Actions = {
	delete: async ({ request, locals }) => {
		const data = await request.formData();
		const exerciseId = data.get('exerciseId') as string;
		const profilId = data.get('profilId') as string;
		if (!exerciseId || !profilId) error(400, 'Fehlende Parameter');

		const { directus, exercise } = await guardExercise(exerciseId, requireFamilyId(locals));
		await directus.request(deleteItem('exercises', exercise.id));

		redirect(303, `/historie?profil=${encodeURIComponent(profilId)}`);
	},

	replace: async ({ request, locals }) => {
		const data = await request.formData();
		const exerciseId = data.get('exerciseId') as string;
		const profilId = data.get('profilId') as string;
		const subject = data.get('subject') as string;
		const topic = data.get('topic') as string;
		if (!exerciseId || !profilId) error(400, 'Fehlende Parameter');

		const { directus, exercise } = await guardExercise(exerciseId, requireFamilyId(locals));
		await directus.request(deleteItem('exercises', exercise.id));

		const params = new URLSearchParams({ profil: profilId });
		if (subject) params.set('subject', subject);
		if (topic) params.set('topic', topic);
		redirect(303, `/generieren?${params}`);
	}
};
