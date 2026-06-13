import { getDirectus } from '$lib/directus';
import { readItem } from '@directus/sdk';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const profilId = url.searchParams.get('profil');
	const aufgabeId = url.searchParams.get('aufgabe');

	const directus = getDirectus();

	// Load existing exercise if aufgabe param given
	if (aufgabeId) {
		const exercise = await directus.request(readItem('exercises', aufgabeId));
		if (!exercise) error(404, 'Übung nicht gefunden');
		const profile = await directus.request(readItem('profiles', exercise.profile_id));
		if (!profile || profile.family_id !== locals.familyId) error(403, 'Kein Zugriff');
		return {
			profile,
			prefill: { subject: exercise.subject ?? '', topic: exercise.topic ?? '' },
			existingExercise: { id: aufgabeId, content: exercise.generated_content ?? '' }
		};
	}

	if (!profilId) error(400, 'Kein Profil angegeben');
	const profile = await directus.request(readItem('profiles', profilId));
	if (!profile) error(404, 'Profil nicht gefunden');
	if (profile.family_id !== locals.familyId) error(403, 'Kein Zugriff auf dieses Profil');

	return {
		profile,
		prefill: {
			subject: url.searchParams.get('subject') ?? '',
			topic: url.searchParams.get('topic') ?? ''
		},
		existingExercise: null
	};
};
