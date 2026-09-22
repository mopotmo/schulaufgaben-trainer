/**
 * Projektname, Kontakt und Impressumsdaten an einer Stelle.
 *
 * Vorkehrung 4 aus Konzept §5: nichts davon steht in den Rechtsseiten hartkodiert, damit
 * ein zweiter Mandant später nur diese Datei braucht.
 *
 * ⚠️ AUSFÜLLEN VOR DEM AUSROLLEN. Die mit `AUSFÜLLEN` markierten Felder enthalten
 * Platzhalter. Ein Impressum mit Platzhaltern ist schlechter als gar keines — nach § 5 DDG
 * muss eine ladungsfähige Anschrift dort stehen, keine leere Hülle.
 */
export const PROJECT = {
	name: 'Schulaufgaben Trainer',
	/** Kurzbeschreibung für Impressum und Nutzungsbedingungen. */
	description: 'Privates, kostenloses Übungsangebot für Schulaufgaben'
} as const;

export const OPERATOR = {
	/** Vor- und Nachname der verantwortlichen Privatperson. */
	name: 'AUSFÜLLEN: Vor- und Nachname',
	/** Ladungsfähige Anschrift — kein Postfach, keine reine c/o-Adresse (Konzept §3.1). */
	street: 'AUSFÜLLEN: Straße und Hausnummer',
	city: 'AUSFÜLLEN: PLZ und Ort',
	country: 'Deutschland',
	/** Kontakt für Auskunft, Löschung und Widerruf der Einwilligung. */
	email: 'AUSFÜLLEN: kontakt@example.org'
} as const;

/** Auftragsverarbeiter, in der Datenschutzerklärung namentlich zu nennen (Konzept §3.2). */
export const PROCESSORS = {
	ai: { name: 'Anthropic PBC', purpose: 'KI-Generierung und -Korrektur', country: 'USA' },
	hosting: { name: 'Hetzner Online GmbH', purpose: 'Hosting', country: 'Deutschland (Nürnberg)' }
} as const;

/** Zuständige Aufsichtsbehörde, nicht-öffentlicher Bereich Bayern. */
export const SUPERVISORY_AUTHORITY = {
	name: 'Bayerisches Landesamt für Datenschutzaufsicht (BayLDA)',
	city: 'Ansbach',
	url: 'https://www.lda.bayern.de'
} as const;

/** Aufbewahrungsdauer hochgeladener Dateien in Tagen (Konzept §3.5). */
export const UPLOAD_RETENTION_DAYS = 30;

/** Sind die Pflichtfelder gefüllt? Wird beim Rendern der Rechtsseiten geprüft. */
export function operatorDataComplete(): boolean {
	return !Object.values(OPERATOR).some((v) => v.startsWith('AUSFÜLLEN'));
}
