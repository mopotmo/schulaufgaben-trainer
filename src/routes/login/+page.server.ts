import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { setSession } from '$lib/session';
import { findGroupBySlug } from '$lib/server/repo/groups';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.actor) redirect(303, '/');
	return { weiter: url.searchParams.get('weiter') ?? '/' };
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const slug = ((form.get('slug') as string) ?? '').trim().toLowerCase();
		const password = ((form.get('password') as string) ?? '').trim();

		if (!slug || !password) return fail(400, { error: 'Bitte alle Felder ausfüllen.' });

		const group = await findGroupBySlug(slug);

		// Auch ohne Treffer wird gehasht: sonst verrät die Antwortzeit, ob es den Slug gibt.
		const hash = group?.password_hash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
		const valid = await bcrypt.compare(password, hash);

		// Eine Fehlermeldung für alle Fälle — vorher verriet der Text, ob die Familie existiert.
		if (!group || !group.password_hash || !valid) {
			return fail(401, { error: 'Familienname oder Passwort stimmt nicht.' });
		}

		setSession(cookies, group.id);

		const weiter = (form.get('weiter') as string) || '/';
		// Nur app-interne Ziele — sonst wird der Login zum offenen Redirect.
		redirect(303, weiter.startsWith('/') && !weiter.startsWith('//') ? weiter : '/');
	}
};
