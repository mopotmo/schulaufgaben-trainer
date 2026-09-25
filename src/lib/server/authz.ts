/**
 * Berechtigungen an einer Stelle — Spec §4.1.
 *
 * Kein Route-Handler entscheidet selbst, wer was darf. Der `Actor` wird einmal pro Request
 * im Hook gebaut, jede Repo-Funktion nimmt ihn als erstes Argument.
 */
import { error } from '@sveltejs/kit';
import type { Role } from '$lib/server/directus';

export type { Role };

export type Session =
	| { kind: 'family'; groupId: string }
	| { kind: 'profile'; groupId: string; profileId: string };

/** Session plus aufgelöste Mitgliedschaften. Einmal pro Request gebaut. */
export type Actor = {
	session: Session;
	/** Alle group_ids, auf die der Actor zugreifen darf. In Stufe 1 immer genau eine. */
	groupIds: string[];
	roles: Role[];
};

export type Action =
	| 'profile:read'
	| 'profile:create'
	| 'profile:update'
	| 'profile:delete'
	| 'exercise:read'
	| 'exercise:create'
	| 'exercise:delete'
	| 'correction:read'
	| 'correction:create'
	| 'book:read'
	| 'book:create'
	| 'book:update'
	| 'book:delete'
	| 'insight:read'
	| 'group:manage'
	| 'consent:grant';

/**
 * Rollen-Matrix, Stufe 1.
 *
 * `teacher` steht hier, bekommt aber nichts — die Rolle wird nirgends vergeben und darf
 * laut CLAUDE.md Regel 7 keine Funktionen erhalten. `admin` läuft ausschließlich über
 * Directus und hat deshalb ebenfalls keinen Eintrag in der App.
 *
 * Die Matrix beantwortet nur „darf diese Rolle das grundsätzlich". *Welche* Zeilen jemand
 * sieht, entscheidet `assertInScope` über die Gruppe — `learner` erhält dadurch nur die
 * eigenen Daten, ohne dass die Matrix das gesondert ausdrücken muss.
 */
const MATRIX: Record<Role, Action[]> = {
	learner: ['profile:read', 'exercise:read', 'exercise:create', 'correction:read', 'correction:create', 'insight:read', 'book:read'],
	parent: [
		'profile:read', 'profile:create', 'profile:update', 'profile:delete',
		'exercise:read', 'exercise:create', 'exercise:delete',
		'correction:read', 'correction:create',
		'book:read', 'book:create', 'book:update', 'book:delete',
		'insight:read', 'group:manage', 'consent:grant'
	],
	owner: [
		'profile:read', 'profile:create', 'profile:update', 'profile:delete',
		'exercise:read', 'exercise:create', 'exercise:delete',
		'correction:read', 'correction:create',
		'book:read', 'book:create', 'book:update', 'book:delete',
		'insight:read', 'group:manage', 'consent:grant'
	],
	teacher: [],
	admin: []
};

/**
 * Eltern haben in Stufe 1 kein eigenes Profil (Spec §10.1). Die Rolle `parent` steht deshalb
 * nicht in `memberships`, sondern wird aus dem Session-Typ abgeleitet — nur hier.
 */
export function familyActor(groupId: string): Actor {
	return {
		session: { kind: 'family', groupId: requireId(groupId) },
		groupIds: [groupId],
		roles: ['parent']
	};
}

export function can(actor: Actor, action: Action): boolean {
	return actor.roles.some((role) => MATRIX[role]?.includes(action));
}

/** Wie `can`, wirft aber 403 statt `false` zurückzugeben. */
export function assertCan(actor: Actor, action: Action): void {
	if (!can(actor, action)) error(403, 'Keine Berechtigung');
}

/**
 * Harte Regel 3: Nie einen Directus-Filter aus einem möglicherweise null-wertigen Wert bauen.
 * `{ _eq: null }` matcht in Directus alle NULL-Zeilen statt keiner.
 */
export function requireId(id: string | null | undefined): string {
	if (!id || typeof id !== 'string') error(401, 'Keine gültige Sitzung');
	return id;
}

/** Wirft 403, wenn die Ressource nicht im Scope des Actors liegt. */
export function assertInScope(actor: Actor, resourceGroupId: string | null | undefined): void {
	if (!resourceGroupId) error(403, 'Kein Zugriff');
	if (!actor.groupIds.includes(resourceGroupId)) error(403, 'Kein Zugriff');
}

/**
 * Zusätzliche Einschränkung für `learner`: nur das eigene Profil. Eltern (Session-Typ
 * `family`) sehen alle Profile ihrer Gruppe, ein angemeldetes Kind nur sich selbst.
 */
export function assertOwnProfile(actor: Actor, profileId: string): void {
	if (actor.session.kind !== 'profile') return;
	if (actor.session.profileId !== profileId) error(403, 'Kein Zugriff auf dieses Profil');
}

/** Die Gruppe der laufenden Sitzung — für Schreibvorgänge, die eine Gruppe zuordnen müssen. */
export function currentGroupId(actor: Actor): string {
	return requireId(actor.session.groupId);
}
