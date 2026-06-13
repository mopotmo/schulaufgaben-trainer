import { getDirectus } from '$lib/directus';
import { readItem, readItems } from '@directus/sdk';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const aufgabeId = url.searchParams.get('aufgabe');
	const profilId = url.searchParams.get('profil');

	const directus = getDirectus();

	if (aufgabeId) {
		const exercise = await directus.request(readItem('exercises', aufgabeId));
		if (!exercise) error(404, 'Aufgabe nicht gefunden');
		// Verify family owns the profile
		const profile = await directus.request(readItem('profiles', exercise.profile_id));
		if (profile?.family_id !== locals.familyId) error(403, 'Kein Zugriff');
		return { exercise, exercises: null };
	}

	if (profilId) {
		const profile = await directus.request(readItem('profiles', profilId));
		if (!profile || profile.family_id !== locals.familyId) error(403, 'Kein Zugriff');
		const exercises = await directus.request(
			readItems('exercises', {
				filter: { profile_id: { _eq: profilId } },
				sort: ['-created_at'],
				limit: 20
			})
		);
		return { exercise: null, exercises };
	}

	error(400, 'Aufgabe oder Profil angeben');
};
