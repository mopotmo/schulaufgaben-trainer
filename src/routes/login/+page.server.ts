import { getDirectus } from '$lib/directus';
import { readItems } from '@directus/sdk';
import { setSession } from '$lib/session';
import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.familyId) redirect(303, '/');
	return { weiter: url.searchParams.get('weiter') ?? '/' };
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const slug = (form.get('slug') as string ?? '').trim().toLowerCase();
		const password = (form.get('password') as string ?? '').trim();

		if (!slug || !password) return fail(400, { error: 'Bitte alle Felder ausfüllen.' });

		const directus = getDirectus();
		const results = await directus.request(
			readItems('families', { filter: { slug: { _eq: slug } }, limit: 1 })
		);
		const family = results[0];

		if (!family || !family.password_hash) {
			return fail(401, { error: 'Unbekannte Familie oder Passwort noch nicht gesetzt.' });
		}

		const valid = await bcrypt.compare(password, family.password_hash);
		if (!valid) return fail(401, { error: 'Falsches Passwort.' });

		await setSession(cookies, family.id);

		const weiter = form.get('weiter') as string || '/';
		redirect(303, weiter);
	}
};
