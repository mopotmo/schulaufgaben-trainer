/**
 * Einwilligungen (Konzept §3.3, Spec §7).
 *
 * Das blockierende Consent-Gate im Hook kommt erst mit der Route `/einwilligung` — ohne
 * Zielseite würde es alle Familien aussperren. Die Abfrage steht hier schon bereit.
 */
import { readItems, createItem, updateItems } from '@directus/sdk';
import { getDirectus, type Consent } from '$lib/server/directus';
import { assertCan, currentGroupId, requireId, type Actor } from '../authz';
import { CONSENT_VERSION } from '$lib/legal';
import { deleteInsightsOfGroup } from './insights';

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

/**
 * Version der letzten nicht widerrufenen Datenschutz-Einwilligung der eigenen Gruppe, oder
 * `null`, wenn es keine gibt. Für die Einwilligungsseite: erstmalig oder geänderte Texte?
 */
export async function lastConsentVersion(actor: Actor): Promise<string | null> {
	assertCan(actor, 'consent:grant');
	const [row] = await getDirectus().request(
		readItems('consents', {
			filter: {
				group_id: { _eq: currentGroupId(actor) },
				type: { _eq: 'privacy' },
				revoked_at: { _null: true }
			},
			fields: ['version'],
			sort: ['-granted_at'],
			limit: 1
		})
	);
	return row?.version ?? null;
}

export type NewConsent = {
	granted_by_name: string;
	granted_by_email: string;
};

/**
 * Freiwilliges Opt-in für Lernerkenntnisse — getrennt von `privacy`/`terms`, weil der Dienst
 * ohne sie funktioniert (Art. 7 Abs. 4 DSGVO) und Kinder nicht selbst einwilligen können
 * (Art. 8). Ohne aktive Zeile wird nichts ausgewertet und nichts in die Generierung gegeben.
 *
 * Versionsunabhängig: Ein Sprung von `CONSENT_VERSION` fragt `privacy`/`terms` neu ab, das
 * Opt-in bleibt bis zum Widerruf bestehen.
 */
export async function hasInsightsConsent(groupId: string | null | undefined): Promise<boolean> {
	if (!groupId) return false;
	const rows = await getDirectus().request(
		readItems('consents', {
			filter: { group_id: { _eq: requireId(groupId) }, type: { _eq: 'insights' }, revoked_at: { _null: true } },
			fields: ['id'],
			limit: 1
		})
	);
	return rows.length > 0;
}

/** Wer wann eingewilligt hat — für die Anzeige unter Einstellungen. `null`: kein Opt-in. */
export async function getInsightsConsent(
	actor: Actor
): Promise<{ grantedAt: string; grantedBy: string } | null> {
	assertCan(actor, 'consent:grant');
	const [row] = await getDirectus().request(
		readItems('consents', {
			filter: { group_id: { _eq: currentGroupId(actor) }, type: { _eq: 'insights' }, revoked_at: { _null: true } },
			fields: ['granted_at', 'granted_by_name'],
			sort: ['-granted_at'],
			limit: 1
		})
	);
	return row ? { grantedAt: row.granted_at, grantedBy: row.granted_by_name } : null;
}

export async function grantInsightsConsent(actor: Actor, data: NewConsent): Promise<void> {
	assertCan(actor, 'consent:grant');
	if (await hasInsightsConsent(currentGroupId(actor))) return;
	await getDirectus().request(
		createItem('consents', {
			group_id: currentGroupId(actor),
			type: 'insights',
			version: CONSENT_VERSION,
			granted_at: new Date().toISOString(),
			granted_by_name: data.granted_by_name,
			granted_by_email: data.granted_by_email
		})
	);
}

/**
 * Widerruf: Opt-in beenden und alle Erkenntnisse der Familie löschen — mit dem Widerruf
 * entfällt die Rechtsgrundlage (Art. 17 Abs. 1 lit. b DSGVO, entschieden 27.09.2026).
 * Erst löschen, dann widerrufen: Scheitert das Löschen, bleibt das Opt-in sichtbar bestehen
 * und der Widerruf lässt sich wiederholen.
 */
export async function revokeInsightsConsent(actor: Actor): Promise<void> {
	assertCan(actor, 'consent:grant');
	await deleteInsightsOfGroup(actor);
	await getDirectus().request(
		updateItems(
			'consents',
			{ filter: { group_id: { _eq: currentGroupId(actor) }, type: { _eq: 'insights' }, revoked_at: { _null: true } } },
			{ revoked_at: new Date().toISOString() }
		)
	);
}

/**
 * Schreibt **zwei** Zeilen: die Datenschutz-Einwilligung und die Zustimmung zu den
 * Nutzungsbedingungen — mit `insights` eine dritte für das freiwillige Opt-in.
 *
 * Bewusst getrennt und nicht als ein Eintrag: Die Einwilligung nach Art. 6 Abs. 1 lit. a
 * DSGVO muss freiwillig und spezifisch sein und ist jederzeit widerrufbar. Die
 * Nutzungsbedingungen sind Vertragsbedingungen. Bündelt man beides, gerät die
 * Freiwilligkeit der Einwilligung unter Druck. Die Lebensläufe unterscheiden sich
 * ebenfalls: Ein Widerruf der Einwilligung bedeutet Löschung aller Daten, ein „Widerruf"
 * der Nutzungsbedingungen ergibt keinen Sinn.
 */
export async function grantConsent(
	actor: Actor,
	data: NewConsent,
	{ insights = false }: { insights?: boolean } = {}
): Promise<Consent[]> {
	assertCan(actor, 'consent:grant');
	// Das freiwillige Opt-in als eigene Zeile, nur wenn das Häkchen gesetzt war.
	if (insights) await grantInsightsConsent(actor, data);

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
