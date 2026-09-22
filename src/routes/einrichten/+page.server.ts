import { fail, redirect, error } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { setSession } from '$lib/session';
import { findGroupByInviteToken, setPassword } from '$lib/server/repo/groups';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const token = url.searchParams.get('token');
	if (!token) error(400, 'Kein Token angegeben.');

	const group = await findGroupByInviteToken(token);
	if (!group) error(404, 'Ungültiger oder bereits verwendeter Link.');

	// isReset = die Gruppe hat schon ein Passwort, der Token dient dem Zurücksetzen.
	return { token, familyName: group.name, isReset: !!group.password_hash };
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const token = form.get('token') as string;
		const password = ((form.get('password') as string) ?? '').trim();
		const passwordConfirm = ((form.get('passwordConfirm') as string) ?? '').trim();

		if (password.length < 8) return fail(400, { error: 'Das Passwort muss mindestens 8 Zeichen lang sein.' });
		if (password !== passwordConfirm) return fail(400, { error: 'Die Passwörter stimmen nicht überein.' });

		const group = await findGroupByInviteToken(token);
		if (!group) return fail(400, { error: 'Ungültiger oder bereits verwendeter Token.' });

		await setPassword(group.id, await bcrypt.hash(password, 12));
		setSession(cookies, group.id);
		redirect(303, '/');
	}
};
