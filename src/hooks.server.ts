import { getSession, clearSession } from '$lib/session';
import { isEmailVerified, listGroupIdsForProfile } from '$lib/server/repo/groups';
import { hasValidConsent } from '$lib/server/repo/consents';
import { familyActor, type Actor, type Role } from '$lib/server/authz';
import { error, redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';

const PUBLIC_PATHS = [
	'/login',
	'/einrichten',
	'/logout',
	'/impressum',
	'/datenschutz',
	'/nutzungsbedingungen',
	// Ohne Sitzung erreichbar, weil der Mail-Link oft auf einem anderen Gerät geöffnet wird.
	// Die Seite zeigt ohne Token und ohne Sitzung nichts an.
	'/email-bestaetigen',
	'/passwort-vergessen',
	'/passwort-zuruecksetzen'
];

/** Pfade, die mit Sitzung, aber ohne erteilte Einwilligung erreichbar bleiben müssen. */
const CONSENT_EXEMPT = ['/einwilligung'];

/** Exakter Treffer oder echter Unterpfad — `startsWith` allein ließe auch `/loginxyz` durch. */
function isPublic(path: string): boolean {
	return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	const payload = getSession(event.cookies);

	// Ungültiges oder abgelaufenes Cookie: wegräumen und als anonym weiterlaufen.
	if (!payload && event.cookies.get('session')) clearSession(event.cookies);

	let actor: Actor | null = null;

	if (payload) {
		if (payload.kind === 'family') {
			actor = familyActor(payload.groupId);
		} else {
			// Profilsitzung: Gruppen kommen aus den Mitgliedschaften. In Stufe 1 ist das
			// genau eine; das Array trägt den späteren Klassenbeitritt schon mit.
			const groupIds = await listGroupIdsForProfile(payload.profileId!);
			if (groupIds.includes(payload.groupId)) {
				actor = {
					session: { kind: 'profile', groupId: payload.groupId, profileId: payload.profileId! },
					groupIds,
					roles: ['learner' as Role]
				};
			} else {
				// Mitgliedschaft entzogen — Cookie entwerten.
				clearSession(event.cookies);
			}
		}
	}

	event.locals.actor = actor;

	if (!isPublic(path) && !actor) {
		if (path.startsWith('/api/')) error(401, 'Keine gültige Sitzung');
		redirect(303, `/login?weiter=${encodeURIComponent(path)}`);
	}

	if (actor && !isPublic(path)) {
		// Beide Prüfungen parallel, damit das zweite Gate keinen weiteren Roundtrip kostet.
		const [verified, consented] = await Promise.all([
			isEmailVerified(actor.session.groupId),
			CONSENT_EXEMPT.includes(path) ? true : hasValidConsent(actor.session.groupId)
		]);

		// Verifikations-Gate: Ohne bestätigte Adresse ist die Einwilligung nicht belegbar
		// (Konzept §3.3, Double-Opt-In). Kommt deshalb vor dem Consent-Gate.
		if (!verified) {
			if (path.startsWith('/api/')) error(403, 'E-Mail-Adresse nicht bestätigt');
			redirect(303, '/email-bestaetigen');
		}

		// Consent-Gate (Spec §5 Schritt 4). Ohne gültige Einwilligung ist keine geschützte
		// Seite und keine API-Route erreichbar.
		if (!consented) {
			if (path.startsWith('/api/')) error(403, 'Einwilligung erforderlich');
			redirect(303, '/einwilligung');
		}
	}

	return resolve(event);
};
