/**
 * Sitzungs-Cookie — Spec §5.
 *
 * Gegenüber der Vorgängerfassung, die nur die Familien-ID signierte:
 * - Der **vollständige Payload** wird signiert, nicht nur die ID.
 * - `iat` und `MAX_AGE` begrenzen die Gültigkeit. Vorher war ein einmal ausgestelltes
 *   Cookie unbegrenzt gültig und nicht widerrufbar.
 * - `v` erlaubt, mit einem Bump alle bestehenden Cookies auf einen Schlag zu entwerten.
 * - Der Signaturvergleich ist konstantzeitig.
 */
import { SESSION_SECRET } from '$env/static/private';
import { timingSafeEqual, createHmac } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';

const COOKIE_NAME = 'session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 Tage

export type SessionPayload = {
	v: 1;
	kind: 'family' | 'profile';
	groupId: string;
	profileId?: string;
	/** Unix-Sekunden */
	iat: number;
};

function sign(data: string): string {
	return createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
	const bufA = Buffer.from(a);
	const bufB = Buffer.from(b);
	// timingSafeEqual wirft bei unterschiedlicher Länge — die Längenprüfung muss davor.
	if (bufA.length !== bufB.length) return false;
	return timingSafeEqual(bufA, bufB);
}

function encode(payload: SessionPayload): string {
	return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function write(cookies: Cookies, payload: SessionPayload) {
	const body = encode(payload);
	cookies.set(COOKIE_NAME, `${body}.${sign(body)}`, {
		httpOnly: true,
		sameSite: 'lax',
		path: '/',
		maxAge: MAX_AGE,
		secure: process.env.NODE_ENV === 'production'
	});
}

/** Anmeldung als Familie (Eltern). */
export function setSession(cookies: Cookies, groupId: string) {
	write(cookies, { v: 1, kind: 'family', groupId, iat: Math.floor(Date.now() / 1000) });
}

/** Wechsel von der Familien- auf eine Profilsitzung. */
export function switchProfile(cookies: Cookies, groupId: string, profileId: string) {
	write(cookies, {
		v: 1,
		kind: 'profile',
		groupId,
		profileId,
		iat: Math.floor(Date.now() / 1000)
	});
}

export function getSession(cookies: Cookies): SessionPayload | null {
	const value = cookies.get(COOKIE_NAME);
	if (!value) return null;

	// Genau eine Trennstelle: alles vor dem letzten Punkt ist der Payload.
	const cut = value.lastIndexOf('.');
	if (cut <= 0) return null;
	const body = value.slice(0, cut);
	const signature = value.slice(cut + 1);

	if (!safeEqual(signature, sign(body))) return null;

	let payload: SessionPayload;
	try {
		payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
	} catch {
		return null;
	}

	if (payload?.v !== 1) return null;
	if (payload.kind !== 'family' && payload.kind !== 'profile') return null;
	if (typeof payload.groupId !== 'string' || !payload.groupId) return null;
	if (payload.kind === 'profile' && (typeof payload.profileId !== 'string' || !payload.profileId)) {
		return null;
	}
	if (typeof payload.iat !== 'number' || !Number.isFinite(payload.iat)) return null;
	if (Math.floor(Date.now() / 1000) - payload.iat > MAX_AGE) return null;

	return payload;
}

export function clearSession(cookies: Cookies) {
	cookies.delete(COOKIE_NAME, { path: '/' });
}
