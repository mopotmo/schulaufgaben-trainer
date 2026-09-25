import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { setSession } from '$lib/session';
import { getGroupContact, resetPassword } from '$lib/server/repo/groups';
import { consumeToken, findValidToken } from '$lib/server/repo/emailTokens';
import type { Actions, PageServerLoad } from './$types';

/** Ein Token gilt nur für die Adresse, an die es ging — ändert sich die Adresse, verfällt es. */
async function resolve(token: string | null) {
	const t = await findValidToken(token, 'reset');
	if (!t) return null;
	const group = await getGroupContact(t.group_id);
	if (!group || group.email !== t.email) return null;
	return { token: t, group };
}

export const load: PageServerLoad = async ({ url }) => {
	const token = url.searchParams.get('token');
	const found = await resolve(token);
	if (!found) return { valid: false as const };
	return { valid: true as const, token: token!, familyName: found.group.name, slug: found.group.slug };
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const password = ((form.get('password') as string) ?? '').trim();
		const passwordConfirm = ((form.get('passwordConfirm') as string) ?? '').trim();

		if (password.length < 8) return fail(400, { error: 'Das Passwort muss mindestens 8 Zeichen lang sein.' });
		if (password !== passwordConfirm) return fail(400, { error: 'Die Passwörter stimmen nicht überein.' });

		const found = await resolve(form.get('token') as string);
		if (!found) return fail(400, { error: 'Der Link ist abgelaufen oder wurde schon verwendet.' });

		await consumeToken(found.token.id);
		await resetPassword(found.token.group_id, await bcrypt.hash(password, 12));
		setSession(cookies, found.token.group_id);
		redirect(303, '/');
	}
};
