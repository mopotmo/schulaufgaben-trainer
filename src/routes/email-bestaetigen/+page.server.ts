/**
 * Drei Zustände:
 * - mit `?token=` → Bestätigen-Button. Der bloße Aufruf verbraucht das Token nicht, weil
 *   Mailscanner Links vorab öffnen und die Adresse sonst ungefragt bestätigen würden.
 * - ohne Token, mit Sitzung → „Schau in dein Postfach", erneut senden
 * - ohne beides → Login
 */
import { fail, redirect } from '@sveltejs/kit';
import { requireActor } from '$lib/server/actor';
import { getGroupContact, getOwnGroup, markEmailVerified } from '$lib/server/repo/groups';
import { consumeToken, findValidToken, issueToken } from '$lib/server/repo/emailTokens';
import type { EmailToken } from '$lib/server/directus';
import type { Actions, PageServerLoad } from './$types';

/** Ein Token gilt nur für die Adresse, an die es ging — ändert sich die Adresse, verfällt es. */
async function resolve(token: string | null) {
	const t: EmailToken | null = await findValidToken(token, 'verify');
	if (!t) return null;
	const group = await getGroupContact(t.group_id);
	if (!group || group.email !== t.email) return null;
	return { token: t, group };
}

export const load: PageServerLoad = async ({ url, locals }) => {
	const token = url.searchParams.get('token');

	if (token) {
		const found = await resolve(token);
		if (!found) return { state: 'invalid' as const };
		return { state: 'confirm' as const, token, familyName: found.group.name, email: found.token.email };
	}

	if (!locals.actor) redirect(303, '/login');
	const group = await getOwnGroup(locals.actor);
	if (group.email_verified_at) redirect(303, '/');
	return { state: 'waiting' as const, familyName: group.name, email: group.email };
};

export const actions: Actions = {
	confirm: async ({ request, locals }) => {
		const form = await request.formData();
		const found = await resolve(form.get('token') as string);
		if (!found) return fail(400, { error: 'Der Link ist abgelaufen oder wurde schon verwendet.' });

		await consumeToken(found.token.id);
		await markEmailVerified(found.token.group_id);

		// Gleiches Gerät mit laufender Sitzung: direkt weiter. Sonst über den Login.
		if (locals.actor?.session.groupId === found.token.group_id) redirect(303, '/');
		redirect(303, '/login?bestaetigt=1');
	},

	resend: async ({ locals }) => {
		const actor = requireActor(locals);
		const group = await getOwnGroup(actor);
		if (group.email_verified_at) redirect(303, '/');
		if (!group.email) return fail(400, { error: `Für euren Zugang ist keine Adresse hinterlegt.` });

		const sent = await issueToken(group.id, 'verify', group.email);
		return sent
			? { resent: true }
			: fail(429, { error: 'Gerade eben ging schon eine Mail raus. Bitte warte zwei Minuten.' });
	}
};
