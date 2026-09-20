import { getDirectus } from '$lib/directus';
import { readItems } from '@directus/sdk';
import { error } from '@sveltejs/kit';
import { requireFamilyId, assertExerciseInFamily } from '$lib/server/scope';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const familyId = requireFamilyId(locals);
	const { exercise, profile } = await assertExerciseInFamily(
		url.searchParams.get('aufgabe'),
		familyId
	);

	const directus = getDirectus();
	const corrections = await directus.request(
		readItems('corrections', { filter: { exercise_id: { _eq: exercise.id } }, limit: 1 })
	);
	if (corrections.length > 0) error(400, 'Diese Übung wurde bereits korrigiert');

	return {
		exercise: {
			id: exercise.id,
			subject: exercise.subject ?? '',
			topic: exercise.topic ?? '',
			content: exercise.generated_content ?? ''
		},
		profile
	};
};
