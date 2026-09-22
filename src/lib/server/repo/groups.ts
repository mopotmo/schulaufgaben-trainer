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
import { assertCan, assertInScope, currentGroupId, type Actor } from '../authz';

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
