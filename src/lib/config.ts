/**
 * Projektname, Kontakt und Impressumsdaten an einer Stelle.
 *
 * Vorkehrung 4 aus Konzept §5: nichts davon steht in den Rechtsseiten hartkodiert, damit
 * ein zweiter Mandant später nur diese Datei braucht.
 *
 */
export const PROJECT = {
	name: 'Schulaufgaben Check',
	/** Kurzbeschreibung für Impressum und Nutzungsbedingungen. */
	description: 'Privates, kostenloses Übungsangebot für Schulaufgaben'
} as const;

export const OPERATOR = {
	/** Vor- und Nachname der verantwortlichen Privatperson. */
	name: 'Manuel Robledo',
	/** Ladungsfähige Anschrift — kein Postfach, keine reine c/o-Adresse (Konzept §3.1). */
	street: 'Greimersdorfer Str. 15',
	city: '90556 Cadolzburg',
	country: 'Deutschland',
	/** Kontakt für Auskunft, Löschung und Widerruf der Einwilligung. */
	email: 'mail@schulaufgaben-check.de'
} as const;

/** Auftragsverarbeiter, in der Datenschutzerklärung namentlich zu nennen (Konzept §3.2). */
export const PROCESSORS = {
	ai: { name: 'Anthropic PBC', purpose: 'KI-Generierung und -Korrektur', country: 'USA' },
	hosting: { name: 'Hetzner Online GmbH', purpose: 'Hosting', country: 'Deutschland (Nürnberg)' },
	mail: { name: 'netcup GmbH', purpose: 'E-Mail-Versand', country: 'Deutschland (Karlsruhe)' }
} as const;

/** Zuständige Aufsichtsbehörde, nicht-öffentlicher Bereich Bayern. */
export const SUPERVISORY_AUTHORITY = {
	name: 'Bayerisches Landesamt für Datenschutzaufsicht (BayLDA)',
	city: 'Ansbach',
	url: 'https://www.lda.bayern.de'
} as const;

/** Aufbewahrungsdauer hochgeladener Dateien in Tagen (Konzept §3.5). */
export const UPLOAD_RETENTION_DAYS = 30;

/** Aufbewahrung der Sicherungskopien in Tagen — muss zu KEEP_DAYS in `scripts/backup-cron.sh` passen. */
export const BACKUP_RETENTION_DAYS = 30;

/** Sind die Pflichtfelder gefüllt? Wird beim Rendern der Rechtsseiten geprüft. */
export function operatorDataComplete(): boolean {
	return !Object.values(OPERATOR).some((v) => v.startsWith('AUSFÜLLEN'));
}
