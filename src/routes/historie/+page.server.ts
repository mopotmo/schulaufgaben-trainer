import { getDirectus } from '$lib/directus';
import { readItems, readItem } from '@directus/sdk';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

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
