import { fail, redirect } from '@sveltejs/kit';
import { findVerifiedFamiliesByEmail } from '$lib/server/repo/groups';
import { issueToken } from '$lib/server/repo/emailTokens';
import { readEmail } from '$lib/server/consentForm';
import { clientIp, minutes, tokenByIp } from '$lib/server/rateLimit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.actor) redirect(303, '/');
};

export const actions: Actions = {
	default: async (event) => {
		const ip = clientIp(event);
		const wait = tokenByIp.blockedFor(ip);
		if (wait > 0) return fail(429, { error: `Zu viele Anfragen. Bitte in ${minutes(wait)} erneut versuchen.` });
		tokenByIp.fail(ip);

		const email = readEmail(await event.request.formData());
		if (!email) return fail(400, { error: 'Bitte gib eine gültige E-Mail-Adresse an.' });

		// Eine Adresse kann in seltenen Fällen zu mehreren Familien gehören — dann bekommt
		// jede ihren eigenen Link. Fehler beim Versand verschweigen wir wie den Fall „unbekannt".
		const groups = await findVerifiedFamiliesByEmail(email);
		await Promise.all(groups.map((g) => issueToken(g.id, 'reset', email).catch(() => false)));

		// Immer dieselbe Antwort: Sonst ließe sich abfragen, welche Adressen registriert sind.
		return { sent: true, email };
	}
};
