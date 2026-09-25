/**
 * Gruppen. In Stufe 1 ausschließlich Familien (`type: 'family'`).
 *
 * `findGroupBySlug` und `findGroupByInviteToken` laufen bewusst *ohne* Actor: Sie werden
 * beim Login und beim Einrichten gebraucht, also bevor eine Sitzung existiert. Beide geben
 * nur die Gruppe zurück, die exakt zum übergebenen Wert passt.
 */
import { readItem, readItems, updateItem } from '@directus/sdk';
import { error } from '@sveltejs/kit';
import { getDirectus, type Group } from '$lib/server/directus';
import { assertCan, assertInScope, currentGroupId, requireId, type Actor } from '../authz';

/** Login. Kein Actor — es gibt noch keine Sitzung. */
export async function findGroupBySlug(slug: string): Promise<Group | null> {
	if (!slug) return null;
	const results = await getDirectus().request(
		readItems('groups', {
			filter: { slug: { _eq: slug }, type: { _eq: 'family' }, status: { _eq: 'active' } },
			limit: 1
		})
	);
	return results[0] ?? null;
}

/** Einrichtungslink. Kein Actor — es gibt noch keine Sitzung. */
export async function findGroupByInviteToken(token: string): Promise<Group | null> {
	// Harte Regel 3: erst validieren, dann filtern. `{ _eq: null }` matcht sonst alle Zeilen
	// mit leerem Token — und das sind nach dem Einrichten alle.
	if (!token) return null;
	const results = await getDirectus().request(
		readItems('groups', { filter: { invite_token: { _eq: token } }, limit: 1 })
	);
	return results[0] ?? null;
}

export async function setPassword(groupId: string, passwordHash: string): Promise<void> {
	await getDirectus().request(
		updateItem('groups', groupId, { password_hash: passwordHash, invite_token: null })
	);
}

/**
 * Ersteinrichtung über den Einladungslink. Kein Actor — die Sitzung entsteht erst danach.
 * Die Adresse gilt bis zum Klick auf den Bestätigungslink als unbestätigt.
 */
export async function setupFamily(
	groupId: string,
	data: { passwordHash: string; email: string }
): Promise<void> {
	await getDirectus().request(
		updateItem('groups', requireId(groupId), {
			password_hash: data.passwordHash,
			email: data.email,
			email_verified_at: null,
			invite_token: null
		})
	);
}

/** Vom Hook gebraucht — deshalb nur die eine Spalte. */
export async function isEmailVerified(groupId: string): Promise<boolean> {
	const group = await getDirectus()
		.request(readItem('groups', requireId(groupId), { fields: ['email_verified_at'] }))
		.catch(() => null);
	return !!group?.email_verified_at;
}

export async function markEmailVerified(groupId: string): Promise<void> {
	await getDirectus().request(
		updateItem('groups', requireId(groupId), { email_verified_at: new Date().toISOString() })
	);
}

/**
 * „Passwort vergessen". Kein Actor. Nur bestätigte Adressen: Ein Reset-Link an eine nie
 * bestätigte Adresse wäre ein Umweg, die Bestätigung auszuhebeln.
 */
export async function findVerifiedFamiliesByEmail(email: string): Promise<Group[]> {
	if (!email) return [];
	return getDirectus().request(
		readItems('groups', {
			filter: {
				email: { _eq: email },
				email_verified_at: { _nnull: true },
				password_hash: { _nnull: true },
				type: { _eq: 'family' },
				status: { _eq: 'active' }
			},
			limit: -1
		})
	);
}

/** Reset-Link, vom Token bereits geprüft. Kein Actor. */
export async function resetPassword(groupId: string, passwordHash: string): Promise<void> {
	await getDirectus().request(
		updateItem('groups', requireId(groupId), { password_hash: passwordHash })
	);
}

/**
 * Für Token-Seiten ohne Sitzung. Nur Name und aktuelle Adresse — das Token hat die Gruppe
 * bereits bestimmt, hier wird nichts aus Request-Daten aufgelöst.
 */
export async function getGroupContact(
	groupId: string
): Promise<{ name: string; slug: string; email: string | null } | null> {
	const group = await getDirectus()
		.request(readItem('groups', requireId(groupId), { fields: ['name', 'slug', 'email'] }))
		.catch(() => null);
	return group ? { name: group.name, slug: group.slug, email: group.email } : null;
}

/** Die eigene Gruppe der laufenden Sitzung. */
export async function getOwnGroup(actor: Actor): Promise<Group> {
	const group = await getDirectus()
		.request(readItem('groups', currentGroupId(actor)))
		.catch(() => null);
	if (!group) error(404, 'Gruppe nicht gefunden');
	assertInScope(actor, group.id);
	return group;
}

export async function changePassword(actor: Actor, passwordHash: string): Promise<void> {
	assertCan(actor, 'group:manage');
	await getDirectus().request(
		updateItem('groups', currentGroupId(actor), { password_hash: passwordHash })
	);
}

/** Mitgliedschaften einer Gruppe — vom Hook gebraucht, um den Actor zu bauen. */
export async function listGroupIdsForProfile(profileId: string): Promise<string[]> {
	const memberships = await getDirectus().request(
		readItems('memberships', {
			filter: { profile_id: { _eq: profileId }, status: { _eq: 'active' } },
			fields: ['group_id'],
			limit: -1
		})
	);
	return memberships.map((m) => m.group_id).filter((id): id is string => !!id);
}
