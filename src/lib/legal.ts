/**
 * Version der Rechtstexte. Ein Bump zwingt alle Familien erneut durch das Consent-Gate —
 * genau so gewollt, wenn sich die Datenschutzerklärung ändert (Spec §7).
 *
 * **Bei jedem Bump einen Eintrag oben in `CONSENT_HISTORY` ergänzen.** Die Einwilligungsseite
 * zeigt daraus, was sich seit der Version geändert hat, der die Familie zuletzt zugestimmt hat.
 */
export const CONSENT_VERSION = '2026-09-v3';

export type LegalDocument = 'privacy' | 'terms';

export type ConsentVersion = {
	version: string;
	/** Welche Texte sich geändert haben — für den Satz über der Liste. */
	documents: LegalDocument[];
	/**
	 * Was neu ist, in Worten an die Eltern („du"). Festgeschrieben statt aus der Konfiguration
	 * gelesen: Der Eintrag hält fest, was zu dieser Version galt.
	 */
	changes: string[];
};

/** Neueste oben. Die erste Version hat keine Änderungen, sie steht nur als Anker da. */
export const CONSENT_HISTORY: ConsentVersion[] = [
	{
		version: '2026-09-v3',
		documents: ['privacy'],
		changes: [
			'Lernerkenntnisse sind jetzt freiwillig: Nur wenn du unten zustimmst, leitet der Trainer aus eingereichten Lösungen Stärken und Schwächen je Fach ab und stimmt neue Aufgaben darauf ab. Ohne Zustimmung wird nichts ausgewertet.',
			'Die Zustimmung lässt sich unter Einstellungen jederzeit zurücknehmen. Dabei wird alles Gesammelte sofort gelöscht.',
			'Beim Einreichen einer Lösung kann man zusätzlich abwählen, dass genau diese Lösung ausgewertet wird.'
		]
	},
	{
		version: '2026-09-v2',
		documents: ['privacy', 'terms'],
		changes: [
			'Deine E-Mail-Adresse wird über einen Bestätigungslink geprüft. Bestätigungs- und Passwort-Mails verschickt netcup (Deutschland) in unserem Auftrag.',
			'Aufgabenblätter und Lösungsfotos werden 30 Tage nach dem Hochladen gelöscht, Schulbücher nach 90 Tagen ohne Nutzung, spätestens am 31. August.',
			'Alle Daten werden täglich verschlüsselt gesichert. Die Sicherungen werden nach 30 Tagen gelöscht.',
			'Hochladen darfst du nur Schulbücher, die euch gehören. Sie sind nur für eure Familie sichtbar.'
		]
	},
	{ version: '2026-09-v1', documents: [], changes: [] }
];

/**
 * Alle Versionen nach `since`, neueste zuerst. Unbekannte Version (älter als die Historie):
 * alles zeigen, was es gibt.
 */
export function changesSince(since: string): ConsentVersion[] {
	const i = CONSENT_HISTORY.findIndex((v) => v.version === since);
	const newer = i === -1 ? CONSENT_HISTORY : CONSENT_HISTORY.slice(0, i);
	return newer.filter((v) => v.changes.length > 0);
}
