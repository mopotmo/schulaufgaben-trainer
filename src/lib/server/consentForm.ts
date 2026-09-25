/**
 * Formularprüfung für die Einwilligung — gemeinsam für `/einrichten` (neue Familien) und
 * `/einwilligung` (bestehende Familien, etwa nach einem Versions-Bump).
 */

export type ConsentInput = { name: string };

export function readConsent(form: FormData): { ok: true; value: ConsentInput } | { ok: false; error: string; name: string } {
	const name = ((form.get('name') as string) ?? '').trim();
	const custody = form.get('custody') === 'on';
	const privacy = form.get('privacy') === 'on';
	const terms = form.get('terms') === 'on';

	// Alle drei Häkchen sind Pflicht und dürfen nicht vorangekreuzt sein (Konzept §3.3).
	if (!custody || !privacy || !terms) return { ok: false, error: 'Bitte bestätige alle drei Punkte.', name };
	if (!name) return { ok: false, error: 'Bitte gib deinen Namen an.', name };
	return { ok: true, value: { name } };
}

/** Kleingeschrieben und getrimmt, damit „Passwort vergessen" die Adresse wiederfindet. */
export function readEmail(form: FormData): string | null {
	const email = ((form.get('email') as string) ?? '').trim().toLowerCase();
	if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
	return email;
}
