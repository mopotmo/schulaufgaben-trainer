/**
 * Einwilligungen (Konzept §3.3, Spec §7).
 *
 * Das blockierende Consent-Gate im Hook kommt erst mit der Route `/einwilligung` — ohne
 * Zielseite würde es alle Familien aussperren. Die Abfrage steht hier schon bereit.
 */
import { readItems, createItem } from '@directus/sdk';
import { getDirectus, type Consent } from '$lib/server/directus';
import { assertCan, currentGroupId, requireId, type Actor } from '../authz';
import { CONSENT_VERSION } from '$lib/legal';

/** Gültige Einwilligung für diese Gruppe in der aktuellen Textversion? */
export async function hasValidConsent(groupId: string | null | undefined): Promise<boolean> {
	const id = requireId(groupId);
	const rows = await getDirectus().request(
		readItems('consents', {
			filter: {
				group_id: { _eq: id },
				type: { _eq: 'privacy' },
				version: { _eq: CONSENT_VERSION },
				revoked_at: { _null: true }
			},
			limit: 1
		})
	);
	return rows.length > 0;
}

export type NewConsent = {
	granted_by_name: string;
	granted_by_email: string;
};

/**
 * Schreibt **zwei** Zeilen: die Datenschutz-Einwilligung und die Zustimmung zu den
 * Nutzungsbedingungen.
 *
 * Bewusst getrennt und nicht als ein Eintrag: Die Einwilligung nach Art. 6 Abs. 1 lit. a
 * DSGVO muss freiwillig und spezifisch sein und ist jederzeit widerrufbar. Die
 * Nutzungsbedingungen sind Vertragsbedingungen. Bündelt man beides, gerät die
 * Freiwilligkeit der Einwilligung unter Druck. Die Lebensläufe unterscheiden sich
 * ebenfalls: Ein Widerruf der Einwilligung bedeutet Löschung aller Daten, ein „Widerruf"
 * der Nutzungsbedingungen ergibt keinen Sinn.
 */
export async function grantConsent(actor: Actor, data: NewConsent): Promise<Consent[]> {
	assertCan(actor, 'consent:grant');

	const base = {
		group_id: currentGroupId(actor),
		version: CONSENT_VERSION,
		granted_at: new Date().toISOString(),
		granted_by_name: data.granted_by_name,
		granted_by_email: data.granted_by_email
	};

	const directus = getDirectus();
	return Promise.all([
		directus.request(createItem('consents', { ...base, type: 'privacy' })),
		directus.request(createItem('consents', { ...base, type: 'terms' }))
	]);
}
