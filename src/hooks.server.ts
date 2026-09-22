import { getSession, clearSession } from '$lib/session';
import { listGroupIdsForProfile } from '$lib/server/repo/groups';
import { hasValidConsent } from '$lib/server/repo/consents';
import type { Actor, Role } from '$lib/server/authz';
import { error, redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';

const PUBLIC_PATHS = [
	'/login',
	'/einrichten',
	'/logout',
	'/impressum',
	'/datenschutz',
	'/nutzungsbedingungen'
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
			// Stufe 1: Eltern haben kein eigenes Profil (Spec §10.1). Die Rolle `parent`
			// steht deshalb nicht in `memberships`, sondern wird hier abgeleitet — an
			// genau dieser einen Stelle.
			actor = {
				session: { kind: 'family', groupId: payload.groupId },
				groupIds: [payload.groupId],
				roles: ['parent' as Role]
			};
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

	// Consent-Gate (Spec §5 Schritt 4). Ohne gültige Einwilligung ist keine geschützte Seite
	// und keine API-Route erreichbar. Das Ergebnis wird pro Request einmal ermittelt.
	if (actor && !isPublic(path) && !CONSENT_EXEMPT.includes(path)) {
		if (!(await hasValidConsent(actor.session.groupId))) {
			if (path.startsWith('/api/')) error(403, 'Einwilligung erforderlich');
			redirect(303, '/einwilligung');
		}
	}

	return resolve(event);
};
