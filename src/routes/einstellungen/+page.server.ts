import { fail } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { setSession } from '$lib/session';
import { requireActor } from '$lib/server/actor';
import { assertCan } from '$lib/server/authz';
import { getOwnGroup, changePassword } from '$lib/server/repo/groups';
import { getInsightsConsent, grantInsightsConsent, revokeInsightsConsent } from '$lib/server/repo/consents';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const actor = requireActor(locals);
	// Passwortverwaltung ist Elternsache. Ohne diese Prüfung sähe ein angemeldetes Kind
	// das Formular und käme bis zum bcrypt-Vergleich — ein Orakel fürs Familienpasswort.
	assertCan(actor, 'group:manage');

	const [group, insights] = await Promise.all([getOwnGroup(actor), getInsightsConsent(actor)]);
	return { familyName: group.name, slug: group.slug, insights };
};

export const actions: Actions = {
	/** Opt-in für Lernerkenntnisse — mit Namen als Nachweis, wer eingewilligt hat. */
	enableInsights: async ({ request, locals }) => {
		const actor = requireActor(locals);
		assertCan(actor, 'consent:grant');

		const form = await request.formData();
		const name = ((form.get('name') as string) ?? '').trim();
		if (form.get('insights') !== 'on') return fail(400, { insightsError: 'Bitte setze das Häkchen.' });
		if (!name) return fail(400, { insightsError: 'Bitte gib deinen Namen an.' });

		const group = await getOwnGroup(actor);
		if (!group.email) return fail(400, { insightsError: 'Keine bestätigte E-Mail-Adresse hinterlegt.' });

		await grantInsightsConsent(actor, { granted_by_name: name, granted_by_email: group.email });
		return { insightsChanged: 'on' as const };
	},

	/** Widerruf: Die gesammelten Erkenntnisse werden dabei gelöscht. */
	disableInsights: async ({ locals }) => {
		const actor = requireActor(locals);
		assertCan(actor, 'consent:grant');
		await revokeInsightsConsent(actor);
		return { insightsChanged: 'off' as const };
	},

	changePassword: async ({ request, locals, cookies }) => {
		const actor = requireActor(locals);
		// Vor jeder Verarbeitung, insbesondere vor dem Passwortvergleich.
		assertCan(actor, 'group:manage');

		const form = await request.formData();
		const current = ((form.get('current') as string) ?? '').trim();
		const next = ((form.get('next') as string) ?? '').trim();
		const confirm = ((form.get('confirm') as string) ?? '').trim();

		if (!current || !next || !confirm) return fail(400, { error: 'Bitte alle Felder ausfüllen.' });
		if (next.length < 8) return fail(400, { error: 'Das neue Passwort muss mindestens 8 Zeichen lang sein.' });
		if (next !== confirm) return fail(400, { error: 'Die neuen Passwörter stimmen nicht überein.' });

		const group = await getOwnGroup(actor);
		if (!(await bcrypt.compare(current, group.password_hash ?? ''))) {
			return fail(401, { error: 'Das aktuelle Passwort ist falsch.' });
		}

		// Der neue Hash meldet alle anderen Geräte ab (Fingerabdruck in der Sitzung).
		// Dieses bleibt angemeldet: `group:manage` gibt es nur in der Familiensitzung.
		const passwordHash = await bcrypt.hash(next, 12);
		await changePassword(actor, passwordHash);
		setSession(cookies, group.id, passwordHash);
		return { success: true };
	}
};
