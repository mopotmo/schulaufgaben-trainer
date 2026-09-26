import { fail, redirect, error } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { setSession } from '$lib/session';
import { familyActor } from '$lib/server/authz';
import { findGroupByInviteToken, setPassword, setupFamily } from '$lib/server/repo/groups';
import { grantConsent } from '$lib/server/repo/consents';
import { issueToken } from '$lib/server/repo/emailTokens';
import { readConsent, readEmail } from '$lib/server/consentForm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const token = url.searchParams.get('token');
	if (!token) error(400, 'Kein Token angegeben.');

	const group = await findGroupByInviteToken(token);
	if (!group) error(404, 'Ungültiger oder bereits verwendeter Link.');

	// isReset = die Gruppe hat schon ein Passwort, der Token dient dem Zurücksetzen.
	return { token, familyName: group.name, isReset: !!group.password_hash, email: group.email ?? '' };
};

function readPassword(form: FormData): { ok: true; password: string } | { ok: false; error: string } {
	const password = ((form.get('password') as string) ?? '').trim();
	const passwordConfirm = ((form.get('passwordConfirm') as string) ?? '').trim();
	if (password.length < 8) return { ok: false, error: 'Das Passwort muss mindestens 8 Zeichen lang sein.' };
	if (password !== passwordConfirm) return { ok: false, error: 'Die Passwörter stimmen nicht überein.' };
	return { ok: true, password };
}

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const token = form.get('token') as string;

		const consent = readConsent(form);
		const email = readEmail(form);
		// Bei einem Fehler bleiben Name und Adresse im Formular stehen.
		const keep: { name: string; email: string } = {
			name: consent.ok ? consent.value.name : consent.name,
			email: ((form.get('email') as string) ?? '').trim()
		};

		const group = await findGroupByInviteToken(token);
		if (!group) return fail(400, { error: 'Ungültiger oder bereits verwendeter Link.', ...keep });

		const pw = readPassword(form);

		// Bestehende Familie, von Hand in Directus zurückgesetzt: nur das Passwort.
		if (group.password_hash) {
			if (!pw.ok) return fail(400, { error: pw.error, ...keep });
			const passwordHash = await bcrypt.hash(pw.password, 12);
			await setPassword(group.id, passwordHash);
			setSession(cookies, group.id, passwordHash);
			redirect(303, '/');
		}

		// Neue Familie: Passwort, Adresse und Einwilligung in einem Schritt.

		if (!pw.ok) return fail(400, { error: pw.error, ...keep });
		if (!email) return fail(400, { error: 'Bitte gib eine gültige E-Mail-Adresse an.', ...keep });
		if (!consent.ok) return fail(400, { error: consent.error, ...keep });

		// Einwilligung zuerst: Schlägt danach etwas fehl, ist der Einladungslink noch gültig und
		// ein zweiter Versuch schreibt höchstens eine doppelte Einwilligung — kein halber Zugang.
		await grantConsent(familyActor(group.id), { granted_by_name: consent.value.name, granted_by_email: email });
		const passwordHash = await bcrypt.hash(pw.password, 12);
		await setupFamily(group.id, { passwordHash, email });
		setSession(cookies, group.id, passwordHash);

		// Geht der Versand schief, bietet `/email-bestaetigen` „erneut senden" an.
		await issueToken(group.id, 'verify', email).catch(() => false);
		redirect(303, '/email-bestaetigen');
	}
};
