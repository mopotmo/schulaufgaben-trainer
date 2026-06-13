import { getDirectus } from '$lib/directus';
import { readItems, updateItem } from '@directus/sdk';
import { setSession } from '$lib/session';
import { fail, redirect, error } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const token = url.searchParams.get('token');
	if (!token) error(400, 'Kein Token angegeben.');

	const directus = getDirectus();
	const results = await directus.request(
		readItems('families', { filter: { invite_token: { _eq: token } }, limit: 1 })
	);
	const family = results[0];

	if (!family) error(404, 'Ungültiger oder bereits verwendeter Link.');

	// isReset = family already has a password (token used for reset, not initial setup)
	const isReset = !!family.password_hash;
	return { token, familyName: family.name, isReset };
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const token = form.get('token') as string;
		const password = (form.get('password') as string ?? '').trim();
		const passwordConfirm = (form.get('passwordConfirm') as string ?? '').trim();

		if (password.length < 8) return fail(400, { error: 'Das Passwort muss mindestens 8 Zeichen lang sein.' });
		if (password !== passwordConfirm) return fail(400, { error: 'Die Passwörter stimmen nicht überein.' });

		const directus = getDirectus();
		const results = await directus.request(
			readItems('families', { filter: { invite_token: { _eq: token } }, limit: 1 })
		);
		const family = results[0];
		if (!family) return fail(400, { error: 'Ungültiger oder bereits verwendeter Token.' });

		const hash = await bcrypt.hash(password, 12);
		await directus.request(
			updateItem('families', family.id, { password_hash: hash, invite_token: null })
		);

		await setSession(cookies, family.id);
		redirect(303, '/');
	}
};
