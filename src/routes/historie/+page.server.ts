import { getDirectus } from '$lib/directus';
import { readItems, readItem, deleteItem } from '@directus/sdk';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const profilId = url.searchParams.get('profil');
	if (!profilId) error(400, 'Kein Profil angegeben');

	const directus = getDirectus();

	const [profile, exercises] = await Promise.all([
		directus.request(readItem('profiles', profilId)),
		directus.request(
			readItems('exercises', {
				filter: { profile_id: { _eq: profilId } },
				sort: ['-created_at'],
				limit: 50
			})
		)
	]);

	if (!profile) error(404, 'Profil nicht gefunden');
	if (profile.family_id !== locals.familyId) error(403, 'Kein Zugriff');

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

async function guardExercise(exerciseId: string, familyId: string) {
	const directus = getDirectus();
	const [exercise, corrections] = await Promise.all([
		directus.request(readItem('exercises', exerciseId)),
		directus.request(
			readItems('corrections', { filter: { exercise_id: { _eq: exerciseId } }, limit: 1 })
		)
	]);
	if (!exercise) error(404, 'Übung nicht gefunden');
	const profile = await directus.request(readItem('profiles', exercise.profile_id));
	if (!profile || profile.family_id !== familyId) error(403, 'Kein Zugriff');
	if (corrections.length > 0) error(400, 'Übung wurde bereits bearbeitet');
	return { directus, exercise };
}

export const actions: Actions = {
	delete: async ({ request, locals }) => {
		const data = await request.formData();
		const exerciseId = data.get('exerciseId') as string;
		const profilId = data.get('profilId') as string;
		if (!exerciseId || !profilId) error(400, 'Fehlende Parameter');

		const { directus } = await guardExercise(exerciseId, locals.familyId);
		await directus.request(deleteItem('exercises', exerciseId));

		redirect(303, `/historie?profil=${profilId}`);
	},

	replace: async ({ request, locals }) => {
		const data = await request.formData();
		const exerciseId = data.get('exerciseId') as string;
		const profilId = data.get('profilId') as string;
		const subject = data.get('subject') as string;
		const topic = data.get('topic') as string;
		if (!exerciseId || !profilId) error(400, 'Fehlende Parameter');

		const { directus } = await guardExercise(exerciseId, locals.familyId);
		await directus.request(deleteItem('exercises', exerciseId));

		const params = new URLSearchParams({ profil: profilId });
		if (subject) params.set('subject', subject);
		if (topic) params.set('topic', topic);
		redirect(303, `/generieren?${params}`);
	}
};
