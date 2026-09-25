import { error, fail, redirect } from '@sveltejs/kit';
import { requireActor } from '$lib/server/actor';
import { assertCan } from '$lib/server/authz';
import { listProfiles } from '$lib/server/repo/profiles';
import { getOwnGroup } from '$lib/server/repo/groups';
import { grantConsent, hasValidConsent } from '$lib/server/repo/consents';
import { readConsent } from '$lib/server/consentForm';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const actor = requireActor(locals);
	// Nur Eltern können einwilligen — ein angemeldetes Kind darf das nicht (Art. 8 DSGVO).
	assertCan(actor, 'consent:grant');

	// Schon erteilt? Dann hat hier niemand mehr etwas zu suchen.
	if (await hasValidConsent(actor.session.groupId)) redirect(303, '/');

	const [group, profiles] = await Promise.all([getOwnGroup(actor), listProfiles(actor)]);

	return {
		familyName: group.name,
		email: group.email,
		children: profiles.map((p) => ({ name: p.name, grade: p.grade, avatar: p.avatar }))
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const actor = requireActor(locals);
		assertCan(actor, 'consent:grant');

		const consent = readConsent(await request.formData());
		if (!consent.ok) return fail(400, { error: consent.error, name: consent.name });

		// Das Verifikations-Gate im Hook läuft vor dieser Seite — die Adresse ist bestätigt.
		const group = await getOwnGroup(actor);
		if (!group.email || !group.email_verified_at) error(403, 'E-Mail-Adresse nicht bestätigt');

		await grantConsent(actor, { granted_by_name: consent.value.name, granted_by_email: group.email });
		redirect(303, '/');
	}
};
