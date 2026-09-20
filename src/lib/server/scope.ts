/**
 * Scope-Prüfungen für IDs aus Request-Daten.
 *
 * Vorstufe des in `docs/spec-gruppen-rollen-einwilligung.md` §4 beschriebenen
 * Repository-Layers: schließt die IDOR-Lücke, ohne das Datenmodell anzufassen.
 * Wenn `authz.ts` + `repo/*` stehen, geht dieses Modul dort auf.
 *
 * Regel: Jede ID aus Form, Query oder Params läuft durch eine der `assert*`-Funktionen,
 * bevor damit gearbeitet wird. Nie `readItem()` direkt auf eine übergebene ID.
 */
import { error } from '@sveltejs/kit';
import { readItem } from '@directus/sdk';
import { getDirectus, type Correction, type Exercise, type Profile } from '$lib/directus';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Die Familie der laufenden Sitzung. Wirft 401 statt `familyId!` durchzureichen —
 * damit kann kein null-wertiger Wert in einen Directus-Filter geraten.
 */
export function requireFamilyId(locals: App.Locals): string {
	const familyId = locals.familyId;
	if (!familyId || typeof familyId !== 'string') error(401, 'Keine gültige Sitzung');
	return familyId;
}

/** Validiert die Form einer übergebenen ID, bevor sie in eine Directus-Anfrage geht. */
export function requireUuid(value: unknown, label: string): string {
	if (typeof value !== 'string' || !UUID.test(value)) error(400, `${label} fehlt oder ist ungültig`);
	return value;
}

/** Lädt das Profil und stellt sicher, dass es zur Familie der Sitzung gehört. */
export async function assertProfileInFamily(profileId: unknown, familyId: string): Promise<Profile> {
	const id = requireUuid(profileId, 'Profil-ID');
	const directus = getDirectus();
	const profile = await directus.request(readItem('profiles', id)).catch(() => null);

	if (!profile) error(404, 'Profil nicht gefunden');
	if (!profile.family_id || profile.family_id !== familyId) error(403, 'Kein Zugriff auf dieses Profil');
	return profile;
}

/** Lädt die Aufgabe und stellt sicher, dass ihr Profil zur Familie der Sitzung gehört. */
export async function assertExerciseInFamily(
	exerciseId: unknown,
	familyId: string
): Promise<{ exercise: Exercise; profile: Profile }> {
	const id = requireUuid(exerciseId, 'Aufgaben-ID');
	const directus = getDirectus();
	const exercise = await directus.request(readItem('exercises', id)).catch(() => null);

	if (!exercise) error(404, 'Aufgabe nicht gefunden');
	const profile = await assertProfileInFamily(exercise.profile_id, familyId);
	return { exercise, profile };
}

/** Lädt die Korrektur samt zugehöriger Aufgabe und prüft den Scope über das Profil. */
export async function assertCorrectionInFamily(
	correctionId: unknown,
	familyId: string
): Promise<{ correction: Correction; exercise: Exercise; profile: Profile }> {
	const id = requireUuid(correctionId, 'Korrektur-ID');
	const directus = getDirectus();
	const correction = await directus.request(readItem('corrections', id)).catch(() => null);

	if (!correction) error(404, 'Korrektur nicht gefunden');
	const { exercise, profile } = await assertExerciseInFamily(correction.exercise_id, familyId);
	return { correction, exercise, profile };
}
