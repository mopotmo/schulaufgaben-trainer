import { getDirectus } from '$lib/directus';
import { readItem, readItems } from '@directus/sdk';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const aufgabeId = url.searchParams.get('aufgabe');
	if (!aufgabeId) error(400, 'Keine Aufgaben-ID angegeben');

	const directus = getDirectus();
	const [exercise, corrections] = await Promise.all([
		directus.request(readItem('exercises', aufgabeId)),
		directus.request(readItems('corrections', {
			filter: { exercise_id: { _eq: aufgabeId } },
			limit: 1
		}))
	]);

	if (!exercise) error(404, 'Übung nicht gefunden');
	const profile = await directus.request(readItem('profiles', exercise.profile_id));
	if (!profile || profile.family_id !== locals.familyId) error(403, 'Kein Zugriff');
	if (corrections.length > 0) error(400, 'Diese Übung wurde bereits korrigiert');

	return {
		exercise: {
			id: aufgabeId,
			subject: exercise.subject ?? '',
			topic: exercise.topic ?? '',
			content: exercise.generated_content ?? ''
		},
		profile
	};
};
