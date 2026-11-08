/**
 * Einmalig: `exercises.source_file` und `corrections.solution_file` in die Junctions
 * `exercises_files` / `corrections_files` übernehmen (Konzept fremde Aufgaben §4.5, §6a).
 *
 * Bisher wurde nur die erste hochgeladene Datei gespeichert. Seit der Umstellung schreibt und
 * liest die App nur noch die Junctions; die Altfelder bleiben stehen, bis sie in Directus
 * gelöscht werden — erst nach dem Deploy und einem zweiten Lauf dieses Skripts.
 *
 * Idempotent: legt nur Zeilen an, die es für (Aufgabe bzw. Korrektur, Datei) noch nicht gibt.
 * Läuft nach `schema:apply` vor dem Deploy und noch einmal danach — dazwischen kann der alte
 * Code weitere Altfelder geschrieben haben.
 *
 * Die Altfelder haben keinen Fremdschlüssel. Zeigt eins auf eine Datei, die es nicht mehr gibt,
 * wird es nur gemeldet (die Junction verlangt eine existierende Datei).
 *
 * Ausführen:
 *   node --experimental-strip-types --env-file=.env scripts/dateien-junctions.ts --dry
 *
 * Gegen die lokale Probeumgebung:
 *   node --experimental-strip-types --env-file=.env scripts/dateien-junctions.ts \
 *     --url=http://localhost:8055 --dry
 */
import { createDirectus, rest, staticToken, readItems, createItems, readFiles, readFieldsByCollection } from '@directus/sdk';
import { DRY, target, log, run } from './lib/cli.ts';

type Schema = {
	exercises: { id: string; source_file: string | null }[];
	corrections: { id: string; solution_file: string | null }[];
	exercises_files: { id: string; exercise_id: string; file: string; sort: number | null }[];
	corrections_files: { id: string; correction_id: string; file: string; sort: number | null }[];
};

const { url, token } = target();
const directus = createDirectus<Schema>(url).with(staticToken(token)).with(rest());

console.log(`Directus: ${url}${DRY ? '\n\x1b[33mDry Run\x1b[0m' : ''}`);

async function hasField(collection: 'exercises' | 'corrections', field: string): Promise<boolean> {
	const fields = await directus.request(readFieldsByCollection(collection));
	return fields.some((f) => f.field === field);
}

async function existingFiles(ids: string[]): Promise<Set<string>> {
	if (ids.length === 0) return new Set();
	const files = await directus.request(readFiles({ fields: ['id'], filter: { id: { _in: ids } }, limit: -1 }));
	return new Set(files.map((f) => f.id));
}

async function exercises() {
	log.step('1. exercises.source_file → exercises_files');
	if (!(await hasField('exercises', 'source_file'))) return log.keep('Altfeld gibt es nicht mehr');

	const rows = await directus.request(
		readItems('exercises', { fields: ['id', 'source_file'], filter: { source_file: { _nnull: true } }, limit: -1 })
	);
	const done = new Set(
		(await directus.request(readItems('exercises_files', { fields: ['exercise_id', 'file'], limit: -1 }))).map(
			(r) => `${r.exercise_id}:${r.file}`
		)
	);
	const files = await existingFiles(rows.map((r) => r.source_file!));

	const todo = [];
	for (const r of rows) {
		const file = r.source_file!;
		if (done.has(`${r.id}:${file}`)) continue;
		if (!files.has(file)) {
			log.warn(`${r.id}: Datei ${file} gibt es nicht mehr — übersprungen`);
			continue;
		}
		log.add(`${r.id} ← ${file}`);
		todo.push({ exercise_id: r.id, file, sort: 0 });
	}
	if (todo.length === 0) return log.keep(`alle ${rows.length} übernommen`);
	if (!DRY) await directus.request(createItems('exercises_files', todo));
}

async function corrections() {
	log.step('2. corrections.solution_file → corrections_files');
	if (!(await hasField('corrections', 'solution_file'))) return log.keep('Altfeld gibt es nicht mehr');

	const rows = await directus.request(
		readItems('corrections', { fields: ['id', 'solution_file'], filter: { solution_file: { _nnull: true } }, limit: -1 })
	);
	const done = new Set(
		(await directus.request(readItems('corrections_files', { fields: ['correction_id', 'file'], limit: -1 }))).map(
			(r) => `${r.correction_id}:${r.file}`
		)
	);
	const files = await existingFiles(rows.map((r) => r.solution_file!));

	const todo = [];
	for (const r of rows) {
		const file = r.solution_file!;
		if (done.has(`${r.id}:${file}`)) continue;
		if (!files.has(file)) {
			log.warn(`${r.id}: Datei ${file} gibt es nicht mehr — übersprungen`);
			continue;
		}
		log.add(`${r.id} ← ${file}`);
		todo.push({ correction_id: r.id, file, sort: 0 });
	}
	if (todo.length === 0) return log.keep(`alle ${rows.length} übernommen`);
	if (!DRY) await directus.request(createItems('corrections_files', todo));
}

run(async () => {
	await exercises();
	await corrections();
});
