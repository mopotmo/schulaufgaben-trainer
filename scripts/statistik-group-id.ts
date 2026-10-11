/**
 * Einmalig: `group_id` an `exercises` und `corrections` für den Bestand nachtragen.
 *
 * Das Feld dient nur der Nutzungsstatistik (Insights-Dashboard, `scripts/statistik.ts`) —
 * Directus kann in Aggregaten nicht über eine Relation gruppieren. Neue Zeilen schreibt die
 * App selbst (`createExercise`, `createCorrection`). Die Felder kommen über den Snapshot.
 *
 * Idempotent: setzt nur Zeilen ohne Wert. Läuft nach `schema:apply`, vor oder nach dem
 * Deploy — der Code schreibt das Feld nur für neue Zeilen.
 *
 * Ausführen:
 *   node --experimental-strip-types --env-file=.env scripts/statistik-group-id.ts --dry
 *
 * Gegen die lokale Probeumgebung:
 *   node --experimental-strip-types --env-file=.env scripts/statistik-group-id.ts \
 *     --url=http://localhost:8055 --dry
 */
import { createDirectus, rest, staticToken, readItems, updateItem, readFieldsByCollection } from '@directus/sdk';
import { DRY, target, log, run } from './lib/cli.ts';

type Profile = { id: string; group_id: string };
type Exercise = { id: string; group_id: string | null; profile_id: Profile | null };
type Correction = { id: string; group_id: string | null; exercise_id: Exercise | null };
type Schema = { profiles: Profile[]; exercises: Exercise[]; corrections: Correction[] };

const { url, token } = target();
const directus = createDirectus<Schema>(url).with(staticToken(token)).with(rest());

console.log(`Directus: ${url}${DRY ? '\n\x1b[33mDry Run\x1b[0m' : ''}`);

async function hasField(collection: 'exercises' | 'corrections'): Promise<boolean> {
	const fields = await directus.request(readFieldsByCollection(collection));
	return fields.some((f) => f.field === 'group_id');
}

async function exercises() {
	log.step('1. exercises.group_id aus dem Profil');
	if (!(await hasField('exercises'))) {
		return log.warn('Feld fehlt — erst `schema:apply`, dann dieses Skript.');
	}
	const rows = await directus.request(
		readItems('exercises', {
			fields: ['id', 'group_id', { profile_id: ['group_id'] }],
			filter: { group_id: { _null: true } },
			limit: -1
		})
	);
	if (rows.length === 0) return log.keep('alle gesetzt');

	for (const row of rows) {
		const groupId = row.profile_id?.group_id;
		// Ohne Profil keine Familie — harte Regel 3: nie mit null weiterarbeiten.
		if (!groupId) {
			log.warn(`${row.id} ohne Profil oder Familie — übersprungen`);
			continue;
		}
		log.set(`${row.id} → ${groupId}`);
		if (!DRY) await directus.request(updateItem('exercises', row.id, { group_id: groupId }));
	}
}

async function corrections() {
	log.step('2. corrections.group_id aus Aufgabe → Profil');
	if (!(await hasField('corrections'))) {
		return log.warn('Feld fehlt — erst `schema:apply`, dann dieses Skript.');
	}
	const rows = await directus.request(
		readItems('corrections', {
			fields: ['id', 'group_id', { exercise_id: [{ profile_id: ['group_id'] }] }],
			filter: { group_id: { _null: true } },
			limit: -1
		})
	);
	if (rows.length === 0) return log.keep('alle gesetzt');

	for (const row of rows) {
		const groupId = row.exercise_id?.profile_id?.group_id;
		if (!groupId) {
			log.warn(`${row.id} ohne Aufgabe, Profil oder Familie — übersprungen`);
			continue;
		}
		log.set(`${row.id} → ${groupId}`);
		if (!DRY) await directus.request(updateItem('corrections', row.id, { group_id: groupId }));
	}
}

run(async () => {
	await exercises();
	await corrections();
});
