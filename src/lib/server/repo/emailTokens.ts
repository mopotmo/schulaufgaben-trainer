/**
 * Einmal-Links für E-Mail-Bestätigung und Passwort-Reset.
 *
 * Die App verschickt selbst keine Mails. Sie legt eine Zeile in `email_tokens` an, und ein
 * Directus-Flow verschickt daraufhin die passende Mail (`scripts/email-verification.ts`).
 *
 * Ohne Actor: Bestätigen und Zurücksetzen passieren oft auf einem anderen Gerät als dem, auf
 * dem die Sitzung läuft. Das Token selbst ist der Nachweis.
 */
import { createItem, readItems, updateItem } from '@directus/sdk';
import { getDirectus, type EmailToken, type EmailTokenPurpose } from '$lib/server/directus';
import { requireId } from '../authz';

const LIFETIME_MS: Record<EmailTokenPurpose, number> = {
	verify: 48 * 60 * 60 * 1000,
	reset: 60 * 60 * 1000
};

/** Höchstens eine Mail pro Familie und Zweck in diesem Abstand — gegen das Fluten fremder Postfächer. */
const COOLDOWN_MS = 2 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Legt ein Token an und löst damit den Versand aus. `false`, wenn für diese Familie und
 * diesen Zweck gerade erst eine Mail rausging.
 */
export async function issueToken(
	groupId: string,
	purpose: EmailTokenPurpose,
	email: string
): Promise<boolean> {
	const id = requireId(groupId);
	const directus = getDirectus();

	const [latest] = await directus.request(
		readItems('email_tokens', {
			filter: { group_id: { _eq: id }, purpose: { _eq: purpose } },
			fields: ['created_at'],
			sort: ['-created_at'],
			limit: 1
		})
	);
	if (latest && Date.now() - Date.parse(latest.created_at) < COOLDOWN_MS) return false;

	await directus.request(
		createItem('email_tokens', {
			group_id: id,
			purpose,
			token: crypto.randomUUID(),
			email,
			expires_at: new Date(Date.now() + LIFETIME_MS[purpose]).toISOString()
		})
	);
	return true;
}

/** Gültig = passender Zweck, nicht verbraucht, nicht abgelaufen. Verbraucht das Token nicht. */
export async function findValidToken(
	token: string | null | undefined,
	purpose: EmailTokenPurpose
): Promise<EmailToken | null> {
	// Harte Regel 3 — und Postgres wirft bei einer kaputten UUID, statt nichts zu finden.
	if (!token || !UUID.test(token)) return null;
	const [row] = await getDirectus().request(
		readItems('email_tokens', {
			filter: { token: { _eq: token }, purpose: { _eq: purpose }, used_at: { _null: true } },
			limit: 1
		})
	);
	if (!row || Date.parse(row.expires_at) <= Date.now()) return null;
	return row;
}

export async function consumeToken(tokenId: string): Promise<void> {
	await getDirectus().request(
		updateItem('email_tokens', requireId(tokenId), { used_at: new Date().toISOString() })
	);
}
