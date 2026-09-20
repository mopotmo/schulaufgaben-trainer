import { getDirectus } from '$lib/directus';
import { readItems } from '@directus/sdk';
import { error } from '@sveltejs/kit';
import { requireFamilyId, assertProfileInFamily, assertExerciseInFamily } from '$lib/server/scope';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const familyId = requireFamilyId(locals);
	const aufgabeId = url.searchParams.get('aufgabe');
	const profilId = url.searchParams.get('profil');

	if (aufgabeId) {
		const { exercise } = await assertExerciseInFamily(aufgabeId, familyId);
		return { exercise, exercises: null };
	}

	if (profilId) {
		const profile = await assertProfileInFamily(profilId, familyId);
		const exercises = await getDirectus().request(
			readItems('exercises', {
				filter: { profile_id: { _eq: profile.id } },
				sort: ['-created_at'],
				limit: 20
			})
		);
		return { exercise: null, exercises };
	}

	error(400, 'Aufgabe oder Profil angeben');
};
