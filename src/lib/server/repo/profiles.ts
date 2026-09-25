/**
 * Profile. Einzige Stelle, an der `profiles` gelesen oder geschrieben wird.
 *
 * `resolveProfileGroup` wird von den anderen Repos gebraucht, um Ressourcen, die nur
 * `profile_id` tragen (exercises, corrections, insights, feedback), einer Gruppe zuzuordnen.
 * Pro Request gecacht — sonst läuft jede Aufgabe in eine eigene Abfrage.
 */
import { readItem, readItems, createItem, updateItem, deleteItem } from '@directus/sdk';
import { error } from '@sveltejs/kit';
import { getDirectus, type Profile } from '$lib/server/directus';
import { assertCan, assertInScope, assertOwnProfile, currentGroupId, type Actor } from '../authz';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validiert die Form einer übergebenen ID, bevor sie in eine Directus-Anfrage geht. */
export function requireUuid(value: unknown, label: string): string {
	if (typeof value !== 'string' || !UUID.test(value)) error(400, `${label} fehlt oder ist ungültig`);
	return value;
}

const groupCache = new WeakMap<Actor, Map<string, string | null>>();

/** Gruppe eines Profils, pro Request gecacht. Kein Scope-Check — das macht der Aufrufer. */
export async function resolveProfileGroup(actor: Actor, profileId: string): Promise<string | null> {
	let cache = groupCache.get(actor);
	if (!cache) {
		cache = new Map();
		groupCache.set(actor, cache);
	}
	if (cache.has(profileId)) return cache.get(profileId) ?? null;

	const profile = await getDirectus()
		.request(readItem('profiles', profileId, { fields: ['group_id'] }))
		.catch(() => null);
	const groupId = profile?.group_id ?? null;
	cache.set(profileId, groupId);
	return groupId;
}

export async function listProfiles(actor: Actor): Promise<Profile[]> {
	assertCan(actor, 'profile:read');
	const profiles = await getDirectus().request(
		readItems('profiles', {
			filter: { group_id: { _in: actor.groupIds } },
			sort: ['name'],
			limit: -1
		})
	);
	// Ein angemeldetes Kind sieht nur sich selbst.
	if (actor.session.kind === 'profile') {
		const own = actor.session.profileId;
		return profiles.filter((p) => p.id === own);
	}
	return profiles;
}

export async function getProfile(actor: Actor, profileId: unknown): Promise<Profile> {
	assertCan(actor, 'profile:read');
	const id = requireUuid(profileId, 'Profil-ID');

	const profile = await getDirectus().request(readItem('profiles', id)).catch(() => null);
	if (!profile) error(404, 'Profil nicht gefunden');

	assertInScope(actor, profile.group_id);
	assertOwnProfile(actor, profile.id);
	return profile;
}

export type NewProfile = {
	name: string;
	school_type: string;
	grade: number;
	state: string;
	avatar: string;
};

/**
 * Legt Profil und `learner`-Mitgliedschaft an (Spec §3.2, §10.1). Ohne die Mitgliedschaft
 * verwirft der Hook jede Profilsitzung sofort.
 *
 * Directus-REST kennt keine Transaktion über zwei Collections. Scheitert die Mitgliedschaft,
 * wird das Profil wieder gelöscht, damit kein Profil ohne Zugang zurückbleibt.
 */
export async function createProfile(actor: Actor, data: NewProfile): Promise<Profile> {
	assertCan(actor, 'profile:create');
	const groupId = currentGroupId(actor);
	const directus = getDirectus();

	const profile = await directus.request(
		createItem('profiles', { ...data, kind: 'learner', group_id: groupId })
	);
	try {
		await directus.request(
			createItem('memberships', {
				profile_id: profile.id,
				group_id: groupId,
				role: 'learner',
				status: 'active'
			})
		);
	} catch (e) {
		await directus.request(deleteItem('profiles', profile.id)).catch(() => {});
		throw e;
	}
	return profile;
}

export async function updateProfile(
	actor: Actor,
	profileId: unknown,
	data: Partial<NewProfile>
): Promise<Profile> {
	assertCan(actor, 'profile:update');
	const profile = await getProfile(actor, profileId);
	return getDirectus().request(updateItem('profiles', profile.id, data));
}

export async function deleteProfile(actor: Actor, profileId: unknown): Promise<void> {
	assertCan(actor, 'profile:delete');
	const profile = await getProfile(actor, profileId);
	// Mitgliedschaften räumt die Datenbank weg: `memberships.profile_id` ist ON DELETE CASCADE.
	await getDirectus().request(deleteItem('profiles', profile.id));
}
