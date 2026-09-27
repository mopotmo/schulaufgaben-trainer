import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { setSession } from '$lib/session';
import { findGroupBySlug } from '$lib/server/repo/groups';
import { clientIp, loginByIp, loginBySlug, minutes } from '$lib/server/rateLimit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.actor) redirect(303, '/');
	return {
		weiter: url.searchParams.get('weiter') ?? '/',
		bestaetigt: url.searchParams.has('bestaetigt')
	};
};

export const actions: Actions = {
	default: async (event) => {
		const { request, cookies } = event;
		const form = await request.formData();
		const slug = ((form.get('slug') as string) ?? '').trim().toLowerCase();
		const password = ((form.get('password') as string) ?? '').trim();

		if (!slug || !password) return fail(400, { error: 'Bitte alle Felder ausfüllen.' });

		// Vor dem Passwortvergleich: Während einer Sperre hilft auch das richtige Passwort nicht,
		// sonst ginge das Durchprobieren weiter. Dieselbe Meldung für IP und Familie — sie
		// verrät nicht, ob es den Familiennamen gibt.
		const ip = clientIp(event);
		const wait = Math.max(loginByIp.blockedFor(ip), loginBySlug.blockedFor(slug));
		if (wait > 0) {
			return fail(429, { error: `Zu viele Versuche. Bitte in ${minutes(wait)} erneut versuchen.` });
		}

		const group = await findGroupBySlug(slug);

		// Auch ohne Treffer wird gehasht: sonst verrät die Antwortzeit, ob es den Slug gibt.
		const hash = group?.password_hash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
		const valid = await bcrypt.compare(password, hash);

		// Eine Fehlermeldung für alle Fälle — vorher verriet der Text, ob die Familie existiert.
		if (!group || !group.password_hash || !valid) {
			loginByIp.fail(ip);
			loginBySlug.fail(slug);
			return fail(401, { error: 'Familienname oder Passwort stimmt nicht.' });
		}

		// Nur der Zähler der Familie wird geleert. Den der IP nicht: Sonst leerte jemand mit
		// eigenem Zugang ihn zwischen zwei Rateversuchen an fremden Familien immer wieder.
		loginBySlug.clear(slug);

		setSession(cookies, group.id, group.password_hash);

		const weiter = (form.get('weiter') as string) || '/';
		// Nur app-interne Ziele — sonst wird der Login zum offenen Redirect.
		redirect(303, weiter.startsWith('/') && !weiter.startsWith('//') ? weiter : '/');
	}
};
