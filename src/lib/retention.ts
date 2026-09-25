/**
 * Löschfristen an einer Stelle — für die Anzeige in der App und für `scripts/aufraeumen.ts`.
 *
 * Bewusst ohne Imports: Das Aufräum-Skript läuft außerhalb von SvelteKit direkt mit Node und
 * importiert diese Datei über einen relativen Pfad. So können Anzeige und Löschung nicht
 * auseinanderlaufen.
 *
 * Gerechnet wird in UTC. Auf einen Tag genau reicht — die Löschung läuft einmal nachts.
 */

/** Hochgeladene Aufgabenblätter und Lösungsfotos (Konzept §3.5). */
export const UPLOAD_RETENTION_DAYS = 30;

/** Schulbücher ohne Nutzung als Quelle einer Generierung (Konzept §3.6). */
export const BOOK_IDLE_DAYS = 90;

/** Verbrauchte oder abgelaufene Einmal-Links aus `email_tokens`. */
export const EMAIL_TOKEN_RETENTION_DAYS = 7;

const DAY = 24 * 60 * 60 * 1000;

export function daysAgo(days: number, now = new Date()): Date {
	return new Date(now.getTime() - days * DAY);
}

/** Ende des Schuljahres, in das `date` fällt: der nächste 31.08., 00:00 UTC. */
export function schoolYearEnd(date: Date): Date {
	const end = new Date(Date.UTC(date.getUTCFullYear(), 7, 31));
	return date < end ? end : new Date(Date.UTC(date.getUTCFullYear() + 1, 7, 31));
}

type BookDates = { created_at: string; last_used_at: string | null };

/**
 * Wann ein Buch gelöscht wird: 90 Tage nach der letzten Nutzung, spätestens zum Ende des
 * Schuljahres, in dem es hochgeladen wurde. Ohne `last_used_at` zählt das Hochladen.
 */
export function bookDeletionDate(book: BookDates): Date {
	const created = new Date(book.created_at);
	const lastUsed = new Date(book.last_used_at ?? book.created_at);
	const idle = new Date(lastUsed.getTime() + BOOK_IDLE_DAYS * DAY);
	const yearEnd = schoolYearEnd(created);
	return idle < yearEnd ? idle : yearEnd;
}

export function isBookExpired(book: BookDates, now = new Date()): boolean {
	return bookDeletionDate(book) <= now;
}
