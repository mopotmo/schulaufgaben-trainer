import { SESSION_SECRET } from '$env/static/private';
import type { Cookies } from '@sveltejs/kit';

const COOKIE_NAME = 'session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

async function hmac(data: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(SESSION_SECRET),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
	return Buffer.from(sig).toString('hex');
}

export async function setSession(cookies: Cookies, familyId: string) {
	const sig = await hmac(familyId);
	cookies.set(COOKIE_NAME, `${familyId}.${sig}`, {
		httpOnly: true,
		sameSite: 'lax',
		path: '/',
		maxAge: COOKIE_MAX_AGE,
		secure: process.env.NODE_ENV === 'production'
	});
}

export async function getSession(cookies: Cookies): Promise<string | null> {
	const value = cookies.get(COOKIE_NAME);
	if (!value) return null;
	const [familyId, sig] = value.split('.');
	if (!familyId || !sig) return null;
	const expected = await hmac(familyId);
	if (sig !== expected) return null;
	return familyId;
}

export function clearSession(cookies: Cookies) {
	cookies.delete(COOKIE_NAME, { path: '/' });
}
