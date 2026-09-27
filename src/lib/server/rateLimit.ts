/**
 * Begrenzt Fehlversuche an Login, Passwort-Reset und Einrichten (Konzept §6 Stufe 0 Nr. 8).
 *
 * Bewusst im Speicher des Node-Prozesses (entschieden 27.09.2026): Es läuft genau eine
 * Instanz, eine Collection in Directus kostete einen Platz im Core-Tarif und einen
 * Schreibvorgang pro Versuch. Ein Deploy setzt die Zähler zurück — hinnehmbar.
 *
 * Die Client-IP kommt über `ADDRESS_HEADER`/`XFF_DEPTH` aus dem Eintrag, den Traefik anhängt
 * (`nixpacks.toml`). Ohne diese Einstellung sähe die App nur die IP des Proxys, und ein
 * Limit pro IP sperrte alle Familien gemeinsam.
 */
import type { RequestEvent } from '@sveltejs/kit';

type Entry = { count: number; windowEnd: number; blockedUntil: number };

export class Limiter {
	private entries = new Map<string, Entry>();
	private readonly max: number;
	private readonly windowMs: number;
	private readonly blockMs: number;
	private readonly now: () => number;

	/**
	 * @param max Fehlversuche im Fenster, ab denen gesperrt wird
	 * @param windowMs Länge des Zählfensters
	 * @param blockMs Dauer der Sperre, sobald `max` erreicht ist
	 * @param now Uhr — austauschbar für Tests
	 */
	constructor(max: number, windowMs: number, blockMs: number, now: () => number = Date.now) {
		this.max = max;
		this.windowMs = windowMs;
		this.blockMs = blockMs;
		this.now = now;
	}

	/** Millisekunden bis zum Ende der Sperre, `0` wenn nicht gesperrt. */
	blockedFor(key: string): number {
		const e = this.entries.get(key);
		if (!e) return 0;
		return Math.max(0, e.blockedUntil - this.now());
	}

	/** Einen Fehlversuch zählen. Mit dem `max`-ten beginnt die Sperre. */
	fail(key: string): void {
		const now = this.now();
		this.prune(now);
		let e = this.entries.get(key);
		if (!e || now >= e.windowEnd) {
			e = { count: 0, windowEnd: now + this.windowMs, blockedUntil: e?.blockedUntil ?? 0 };
			this.entries.set(key, e);
		}
		e.count++;
		if (e.count >= this.max) e.blockedUntil = now + this.blockMs;
	}

	/** Nach einem Erfolg — nur für Schlüssel, die ein Angreifer nicht selbst leeren kann. */
	clear(key: string): void {
		this.entries.delete(key);
	}

	/** Abgelaufene Einträge weg, damit der Speicher bei vielen IPs nicht wächst. */
	private prune(now: number): void {
		if (this.entries.size < 1000) return;
		for (const [k, e] of this.entries) if (now >= e.windowEnd && now >= e.blockedUntil) this.entries.delete(k);
	}
}

const MINUTE = 60_000;

/** Login pro IP: 10 Fehlversuche in 15 Minuten, dann 15 Minuten Sperre. */
export const loginByIp = new Limiter(10, 15 * MINUTE, 15 * MINUTE);

/**
 * Login pro Familie, über alle IPs: fängt verteilte Versuche ab. Großzügiger als pro IP,
 * weil ein Angreifer sonst gezielt eine Familie aussperren könnte.
 */
export const loginBySlug = new Limiter(20, 15 * MINUTE, 15 * MINUTE);

/**
 * Mails und Einmal-Tokens: 5 pro IP und Stunde. Bei „Passwort vergessen" zählt jede Anfrage —
 * auch eine erfolgreiche verschickt eine Mail, und das Limit pro Familie greift nicht über
 * viele Adressen hinweg. Bei Einrichten und Zurücksetzen zählen nur ungültige Tokens.
 */
export const tokenByIp = new Limiter(5, 60 * MINUTE, 60 * MINUTE);

/** Client-IP des Aufrufers. Fehlt der Header (etwa bei direktem Zugriff auf den Container), eine feste Kennung. */
export function clientIp(event: Pick<RequestEvent, 'getClientAddress'>): string {
	try {
		return event.getClientAddress();
	} catch {
		return 'unbekannt';
	}
}

/** „15 Minuten" statt Millisekunden — für die Meldung an Nutzer. */
export function minutes(ms: number): string {
	const m = Math.max(1, Math.ceil(ms / MINUTE));
	return m === 1 ? '1 Minute' : `${m} Minuten`;
}
