/**
 * Lernerkenntnisse. Der Inhalt fließt in den System-Prompt der Generierung — deshalb darf
 * hier nichts landen, das nicht aus dem Scope des Actors stammt.
 */
import { readItems, createItem, updateItem } from '@directus/sdk';
import { getDirectus, type LearnerInsight } from '$lib/server/directus';
import { assertCan, assertInScope, type Actor } from '../authz';
import { resolveProfileGroup } from './profiles';

/**
 * Fach und Thema, wie sie gespeichert werden: ohne führende und folgende Leerzeichen,
 * Zeilenumbrüche zu einfachen Leerzeichen. Der Bestand enthält Themen wie
 * `"Vokabeln bis Lektion 25 \r\nÜbersetzungstext und Grammatik \r\n"`.
 */
function tidy(value: string): string {
	return value.trim().replace(/\s+/g, ' ');
}

/** Dieselben Werte als Vergleichsschlüssel — zusätzlich ohne Groß-/Kleinschreibung. */
function key(value: string): string {
	return tidy(value).toLowerCase();
}

/**
 * Sucht den Datensatz zu Profil und Fach.
 *
 * Bewusst **ohne** Thema. Fach und Thema sind Freitext aus dem Generieren-Formular, und
 * das Thema schwankt am stärksten: `Stochastik`, `stochastik`, `Laplace-Experimente und
 * Stochastik` meinen dasselbe Gebiet. Je feiner der Schlüssel, desto seltener findet sich
 * etwas wieder — die Erkenntnisse wurden gesammelt und erreichten die Generierung nie.
 *
 * Ein Datensatz je Fach ist gröber, trifft dafür fast immer. Das zuletzt geübte Thema steht
 * weiterhin im Datensatz, es entscheidet nur nicht mehr über die Zuordnung.
 *
 * Gefiltert wird über das Profil — wenige Zeilen — und normalisiert im Code verglichen.
 */
async function find(profileId: string, subject: string): Promise<LearnerInsight | null> {
	if (!profileId || !tidy(subject)) return null;

	const rows = await getDirectus()
		.request(readItems('learner_insights', { filter: { profile_id: { _eq: profileId } }, limit: -1 }))
		.catch(() => [] as LearnerInsight[]);

	const gesuchtesFach = key(subject);
	return rows.find((r) => key(r.subject ?? '') === gesuchtesFach) ?? null;
}

export async function getInsight(
	actor: Actor,
	profileId: string,
	subject: string
): Promise<LearnerInsight | null> {
	assertCan(actor, 'insight:read');
	assertInScope(actor, await resolveProfileGroup(actor, profileId));
	return find(profileId, subject);
}

export type InsightUpdate = {
	strengths: string[];
	weaknesses: string[];
	style_notes: string | null;
	difficulty: 'leichter' | 'passend' | 'schwerer';
};

export async function upsertInsight(
	actor: Actor,
	profileId: string,
	subject: string,
	topic: string,
	update: InsightUpdate
): Promise<void> {
	assertCan(actor, 'insight:read');
	assertInScope(actor, await resolveProfileGroup(actor, profileId));

	const existing = await find(profileId, subject);
	const directus = getDirectus();

	if (existing) {
		// `topic` wird mitgeschrieben, aber als zuletzt geübtes Thema — nicht als Schlüssel.
		await directus.request(
			updateItem('learner_insights', existing.id, {
				...update,
				topic: tidy(topic),
				updated_at: new Date().toISOString()
			})
		);
	} else {
		// Aufgeräumt ablegen, damit in Directus nicht `Latein ` mit angehängtem Leerzeichen steht.
		await directus.request(
			createItem('learner_insights', {
				profile_id: profileId,
				subject: tidy(subject),
				topic: tidy(topic),
				...update
			})
		);
	}
}
