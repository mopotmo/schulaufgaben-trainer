import { getDirectus } from '$lib/directus';
import { readItem } from '@directus/sdk';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const profilId = url.searchParams.get('profil');
	if (!profilId) error(400, 'Kein Profil angegeben');

	const directus = getDirectus();
	const profile = await directus.request(readItem('profiles', profilId));
	if (!profile) error(404, 'Profil nicht gefunden');
	if (profile.family_id !== locals.familyId) error(403, 'Kein Zugriff auf dieses Profil');

	return {
		profile,
		prefill: {
			subject: url.searchParams.get('subject') ?? '',
			topic: url.searchParams.get('topic') ?? ''
		}
	};
};
