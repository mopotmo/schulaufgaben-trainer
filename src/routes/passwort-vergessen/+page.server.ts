import { fail, redirect } from '@sveltejs/kit';
import { findVerifiedFamiliesByEmail } from '$lib/server/repo/groups';
import { issueToken } from '$lib/server/repo/emailTokens';
import { readEmail } from '$lib/server/consentForm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.actor) redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ request }) => {
		const email = readEmail(await request.formData());
		if (!email) return fail(400, { error: 'Bitte gib eine gültige E-Mail-Adresse an.' });

		// Eine Adresse kann in seltenen Fällen zu mehreren Familien gehören — dann bekommt
		// jede ihren eigenen Link. Fehler beim Versand verschweigen wir wie den Fall „unbekannt".
		const groups = await findVerifiedFamiliesByEmail(email);
		await Promise.all(groups.map((g) => issueToken(g.id, 'reset', email).catch(() => false)));

		// Immer dieselbe Antwort: Sonst ließe sich abfragen, welche Adressen registriert sind.
		return { sent: true, email };
	}
};
