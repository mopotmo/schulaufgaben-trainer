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
 * Sucht den Datensatz zu Profil, Fach und Thema.
 *
 * Fach und Thema sind Freitext aus dem Generieren-Formular. Ein exakter Zeichenvergleich
 * in der Datenbank fand deshalb so gut wie nie etwas: `Mathe` / `Stochastik` und
 * `mathematik` / `stochastik` sind dasselbe Gebiet, aber nicht dieselbe Zeichenfolge.
 * Die Erkenntnisse wurden gesammelt und erreichten die Generierung trotzdem nicht.
 *
 * Gefiltert wird deshalb nur über das Profil — das sind wenige Zeilen — und der Vergleich
 * findet normalisiert im Code statt. Das erreicht auch Altdatensätze, ohne sie anzufassen.
 */
async function find(profileId: string, subject: string, topic: string): Promise<LearnerInsight | null> {
	if (!profileId || !tidy(subject) || !tidy(topic)) return null;

	const rows = await getDirectus()
		.request(readItems('learner_insights', { filter: { profile_id: { _eq: profileId } }, limit: -1 }))
		.catch(() => [] as LearnerInsight[]);

	const gesuchtesFach = key(subject);
	const gesuchtesThema = key(topic);
	return (
		rows.find((r) => key(r.subject ?? '') === gesuchtesFach && key(r.topic ?? '') === gesuchtesThema) ??
		null
	);
}

export async function getInsight(
	actor: Actor,
	profileId: string,
	subject: string,
	topic: string
): Promise<LearnerInsight | null> {
	assertCan(actor, 'insight:read');
	assertInScope(actor, await resolveProfileGroup(actor, profileId));
	return find(profileId, subject, topic);
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

	const existing = await find(profileId, subject, topic);
	const directus = getDirectus();

	if (existing) {
		await directus.request(
			updateItem('learner_insights', existing.id, { ...update, updated_at: new Date().toISOString() })
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
