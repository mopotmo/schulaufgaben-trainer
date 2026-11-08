/**
 * Aufgaben. Der Scope läuft über `profile_id` und die `group_id` des Profils (Spec §3.4).
 * `exercises.group_id` wird beim Anlegen mitgeschrieben, dient aber nur der
 * Nutzungsstatistik — für Berechtigungen zählt allein das Profil.
 */
import { readItem, readItems, createItem, updateItem, deleteItem } from '@directus/sdk';
import { error } from '@sveltejs/kit';
import { getDirectus, type Exercise, type ExerciseOrigin, type Profile, type TaskKind } from '$lib/server/directus';
import { assertCan, assertInScope, type Actor } from '../authz';
import { getProfile, requireUuid, resolveProfileGroup } from './profiles';

/** Lädt die Aufgabe und prüft den Scope über das zugehörige Profil. */
export async function getExercise(
	actor: Actor,
	exerciseId: unknown
): Promise<{ exercise: Exercise; profile: Profile }> {
	assertCan(actor, 'exercise:read');
	const id = requireUuid(exerciseId, 'Aufgaben-ID');

	const exercise = await getDirectus().request(readItem('exercises', id)).catch(() => null);
	if (!exercise) error(404, 'Aufgabe nicht gefunden');

	assertInScope(actor, await resolveProfileGroup(actor, exercise.profile_id));
	// getProfile prüft zusätzlich, dass ein angemeldetes Kind nur eigene Aufgaben sieht.
	const profile = await getProfile(actor, exercise.profile_id);
	return { exercise, profile };
}

export async function listExercises(
	actor: Actor,
	profileId: unknown,
	limit = 50
): Promise<Exercise[]> {
	assertCan(actor, 'exercise:read');
	const profile = await getProfile(actor, profileId);

	return getDirectus().request(
		readItems('exercises', {
			filter: { profile_id: { _eq: profile.id } },
			sort: ['-created_at'],
			limit
		})
	);
}

/**
 * Die Fächer, die für dieses Profil schon benutzt wurden — zuletzt benutzte zuerst.
 *
 * Fach und Thema sind Freitext. Dadurch stehen im Bestand `Mathe`, `Mathematik` und
 * `mathematik` nebeneinander, und die Lernerkenntnisse zu einem Fach verteilen sich auf
 * mehrere Datensätze. Eine Vorschlagsliste im Formular setzt an der Ursache an, statt die
 * Folgen hinterher zusammenzurechnen.
 */
export async function listSubjects(actor: Actor, profileId: unknown): Promise<string[]> {
	assertCan(actor, 'exercise:read');
	const profile = await getProfile(actor, profileId);

	const rows = await getDirectus()
		.request(
			readItems('exercises', {
				fields: ['subject'],
				filter: { profile_id: { _eq: profile.id } },
				sort: ['-created_at'],
				limit: 100
			})
		)
		.catch(() => [] as { subject: string | null }[]);

	// Groß-/Kleinschreibung entscheidet nicht über Doppelte — die zuletzt getippte Schreibweise
	// gewinnt, damit die Liste so aussieht, wie man es selbst geschrieben hat.
	const gesehen = new Set<string>();
	const faecher: string[] = [];
	for (const row of rows) {
		const fach = (row.subject ?? '').trim().replace(/\s+/g, ' ');
		if (!fach) continue;
		const schluessel = fach.toLowerCase();
		if (gesehen.has(schluessel)) continue;
		gesehen.add(schluessel);
		faecher.push(fach);
	}
	return faecher;
}

export type NewExercise = {
	subject: string;
	topic: string;
	teacher_notes: string;
	generated_content: string;
	tokens_used: number | null;
	/** Ohne Angabe setzt die Datenbank `generated` bzw. `structured`. */
	origin?: ExerciseOrigin;
	task_kind?: TaskKind;
};

export async function createExercise(
	actor: Actor,
	profileId: unknown,
	data: NewExercise
): Promise<Exercise> {
	assertCan(actor, 'exercise:create');
	const profile = await getProfile(actor, profileId);
	return getDirectus().request(
		createItem('exercises', { ...data, profile_id: profile.id, group_id: profile.group_id })
	);
}

export async function updateExerciseContent(
	actor: Actor,
	exerciseId: unknown,
	generatedContent: string
): Promise<void> {
	assertCan(actor, 'exercise:create');
	const { exercise } = await getExercise(actor, exerciseId);
	await getDirectus().request(
		updateItem('exercises', exercise.id, { generated_content: generatedContent })
	);
}

/**
 * Prüfansicht einer fremden Aufgabe (Konzept fremde Aufgaben §4, Schritt 3): Transkript, Fach,
 * Thema und Aufgabentyp nach dem Erfassen von Hand berichtigen. Nur für `origin = 'external'` —
 * generierte Aufgaben ändert allein der Chat über `updateExerciseContent`.
 */
export async function updateExternalExercise(
	actor: Actor,
	exerciseId: unknown,
	data: { generated_content: string; subject: string; topic: string; task_kind: TaskKind }
): Promise<void> {
	assertCan(actor, 'exercise:create');
	const { exercise } = await getExercise(actor, exerciseId);
	if (exercise.origin !== 'external') error(400, 'Nur eigene Aufgaben lassen sich so bearbeiten');
	await getDirectus().request(updateItem('exercises', exercise.id, data));
}

export async function deleteExercise(actor: Actor, exerciseId: unknown): Promise<void> {
	assertCan(actor, 'exercise:delete');
	const { exercise } = await getExercise(actor, exerciseId);
	await getDirectus().request(deleteItem('exercises', exercise.id));
}
