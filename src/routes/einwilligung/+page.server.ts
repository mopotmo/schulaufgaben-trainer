import { fail, redirect } from '@sveltejs/kit';
import { requireActor } from '$lib/server/actor';
import { assertCan } from '$lib/server/authz';
import { listProfiles } from '$lib/server/repo/profiles';
import { getOwnGroup } from '$lib/server/repo/groups';
import { grantConsent, hasValidConsent } from '$lib/server/repo/consents';
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
		email: group.email ?? '',
		children: profiles.map((p) => ({ name: p.name, grade: p.grade, avatar: p.avatar }))
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const actor = requireActor(locals);
		assertCan(actor, 'consent:grant');

		const form = await request.formData();
		const name = ((form.get('name') as string) ?? '').trim();
		const email = ((form.get('email') as string) ?? '').trim();
		const custody = form.get('custody') === 'on';
		const privacy = form.get('privacy') === 'on';
		const terms = form.get('terms') === 'on';

		// Alle drei Häkchen sind Pflicht und dürfen nicht vorangekreuzt sein (Konzept §3.3).
		if (!custody || !privacy || !terms) {
			return fail(400, { error: 'Bitte bestätige alle drei Punkte.', name, email });
		}
		if (!name) return fail(400, { error: 'Bitte gib deinen Namen an.', name, email });
		if (!email || !email.includes('@')) {
			return fail(400, { error: 'Bitte gib eine gültige E-Mail-Adresse an.', name, email });
		}

		await grantConsent(actor, { granted_by_name: name, granted_by_email: email });
		redirect(303, '/');
	}
};
