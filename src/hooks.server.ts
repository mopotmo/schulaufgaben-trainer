import { getSession, clearSession, matchesPassword } from '$lib/session';
import { getSessionState, listGroupIdsForProfile } from '$lib/server/repo/groups';
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
	let emailVerified = false;

	// Cookie aus der Zeit vor der letzten Passwortänderung (oder Gruppe weg): entwerten.
	// Läuft auch auf öffentlichen Pfaden — sonst leitet etwa `/login` mit einer alten Sitzung
	// noch auf die Startseite weiter.
	const state = payload ? await getSessionState(payload.groupId) : null;
	if (payload && (!state || !matchesPassword(payload, state.passwordHash))) {
		clearSession(event.cookies);
	} else if (payload && state) {
		emailVerified = state.emailVerified;
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
		// Der Bestätigungsstatus kam schon mit der Sitzungsprüfung oben — hier kein Roundtrip mehr.
		const consented = CONSENT_EXEMPT.includes(path) || (await hasValidConsent(actor.session.groupId));

		// Verifikations-Gate: Ohne bestätigte Adresse ist die Einwilligung nicht belegbar
		// (Konzept §3.3, Double-Opt-In). Kommt deshalb vor dem Consent-Gate.
		if (!emailVerified) {
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
