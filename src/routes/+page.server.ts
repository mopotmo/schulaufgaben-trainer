import { getDirectus } from '$lib/directus';
import { readItems, readItem, createItem } from '@directus/sdk';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const directus = getDirectus();
	const [profiles, family] = await Promise.all([
		directus.request(
			readItems('profiles', {
				filter: { family_id: { _eq: locals.familyId! } },
				sort: ['name']
			})
		),
		directus.request(readItem('families', locals.familyId!))
	]);
	return { profiles, family };
};

export const actions: Actions = {
	addProfile: async ({ request, locals }) => {
		const form = await request.formData();
		const name = (form.get('name') as string ?? '').trim();
		const school_type = (form.get('school_type') as string ?? '').trim();
		const grade = parseInt(form.get('grade') as string);
		const state = (form.get('state') as string ?? '').trim();
		const avatar = (form.get('avatar') as string ?? '🎓').trim();

		if (!name || !school_type || !grade || !state) {
			return fail(400, { error: 'Bitte alle Felder ausfüllen.' });
		}

		const directus = getDirectus();
		await directus.request(
			createItem('profiles', {
				name,
				school_type,
				grade,
				state,
				avatar,
				family_id: locals.familyId!
			})
		);
	}
};
