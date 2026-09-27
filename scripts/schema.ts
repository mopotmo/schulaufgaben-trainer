/**
 * Datenmodell als Datei: `schema/snapshot.json` ist die Quelle, Directus folgt ihr.
 *
 * Ablauf einer Schemaänderung (CLAUDE.md, docs/migrationen.md):
 * 1. Probe aufsetzen (`scripts/backup.sh --probe`), dort in der Directus-Oberfläche ändern
 * 2. `pull` gegen die Probe — der Snapshot im Repo zeigt die Änderung als Diff
 * 3. Commit, Review
 * 4. Backup, dann `apply --produktion --dry` und `apply --produktion`
 *
 * Unterbefehle:
 *   pull    Snapshot der Ziel-Instanz nach schema/snapshot.json schreiben
 *   check   Ziel-Instanz gegen schema/snapshot.json vergleichen; Exit 1 bei Abweichung
 *   apply   Ziel-Instanz an schema/snapshot.json angleichen
 *
 * `apply` löscht nie von sich aus: Ohne `--mit-loeschen` rechnet Directus einen Diff ohne
 * Löschungen (`mode=merge`). Felder, die im Snapshot fehlen, bleiben stehen und werden nur
 * gemeldet — so bleibt die Reihenfolge „erst den Code, der das Feld nicht mehr liest, dann
 * löschen" (CLAUDE.md) eine bewusste Entscheidung. Gegen alles außer localhost verlangt
 * `apply` zusätzlich `--produktion`.
 *
 * Nicht im Snapshot: Flows, Berechtigungen, Daten. Dafür bleiben Skripte (Muster:
 * `scripts/lib/cli.ts`).
 *
 * Ausführen:
 *   node --experimental-strip-types --env-file=.env scripts/schema.ts check
 *   node --experimental-strip-types --env-file=.env scripts/schema.ts pull --url=http://localhost:8055
 *   node --experimental-strip-types --env-file=.env scripts/schema.ts apply --url=http://localhost:8055 --dry
 *   node --experimental-strip-types --env-file=.env scripts/schema.ts apply --produktion --dry
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { command, DRY, has, target, log, color, run } from './lib/cli.ts';

const FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../schema/snapshot.json');

type Snapshot = {
	version: number;
	directus: string;
	vendor: string;
	collections: { collection: string }[];
	fields: { collection: string; field: string }[];
	systemFields: { collection: string; field: string }[];
	relations: { collection: string; field: string }[];
};

type DiffEntry = { kind: 'N' | 'D' | 'E' | 'A'; path?: (string | number)[]; lhs?: unknown; rhs?: unknown };
type Diff = {
	collections: { collection: string; diff: DiffEntry[] }[];
	fields: { collection: string; field: string; diff: DiffEntry[] }[];
	systemFields: { collection: string; field: string; diff: DiffEntry[] }[];
	relations: { collection: string; field: string; related_collection?: string | null; diff: DiffEntry[] }[];
};

const { url, token, local } = target();

async function api<T>(path: string, init?: RequestInit): Promise<T | null> {
	const res = await fetch(`${url}${path}`, {
		...init,
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers }
	});
	if (res.status === 204) return null;
	const body = await res.json().catch(() => null);
	if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path}: ${res.status} ${JSON.stringify(body?.errors ?? body)}`);
	return body?.data ?? body;
}

// ------------------------------------------------------------------ Snapshot

/**
 * Schlüssel und Listen sortiert — sonst erzeugt jede Abfrage einen anderen Git-Diff, obwohl
 * sich nichts geändert hat.
 */
function stable(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stable);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.map((k) => [k, stable((value as Record<string, unknown>)[k])])
		);
	}
	return value;
}

const byKey = <T extends { collection: string; field?: string }>(a: T, b: T) =>
	`${a.collection}.${a.field ?? ''}`.localeCompare(`${b.collection}.${b.field ?? ''}`);

function normalize(s: Snapshot): Snapshot {
	return stable({
		...s,
		collections: [...s.collections].sort(byKey),
		fields: [...s.fields].sort(byKey),
		systemFields: [...s.systemFields].sort(byKey),
		relations: [...s.relations].sort(byKey)
	}) as Snapshot;
}

function readFile(): Snapshot {
	try {
		return JSON.parse(readFileSync(FILE, 'utf8'));
	} catch {
		throw new Error(`${FILE} fehlt oder ist kein JSON — zuerst \`pull\`.`);
	}
}

// ------------------------------------------------------------------ Diff lesbar machen

const short = (v: unknown) => {
	const s = JSON.stringify(v) ?? 'undefined';
	return s.length > 60 ? `${s.slice(0, 57)}…` : s;
};

/** Ein Eintrag ohne Pfad betrifft das ganze Objekt — neu oder gelöscht. */
function describe(name: string, entries: DiffEntry[]) {
	const whole = entries.find((e) => !e.path?.length);
	if (whole?.kind === 'N') return log.add(name);
	if (whole?.kind === 'D') return log.remove(name);
	for (const e of entries) {
		const path = e.path?.join('.') ?? '';
		if (e.kind === 'N') log.set(`${name}  ${path}: ${short(e.rhs)}`);
		else if (e.kind === 'D') log.set(`${name}  ${path}: ${short(e.lhs)} → (entfernt)`);
		else if (e.kind === 'A') log.set(`${name}  ${path}: Listeneintrag geändert`);
		else log.set(`${name}  ${path}: ${short(e.lhs)} → ${short(e.rhs)}`);
	}
}

function describeAll(diff: Diff) {
	log.step('Collections');
	if (!diff.collections.length) log.keep('keine Änderung');
	for (const c of diff.collections) describe(c.collection, c.diff);

	log.step('Felder');
	if (!diff.fields.length && !diff.systemFields.length) log.keep('keine Änderung');
	for (const f of [...diff.fields, ...diff.systemFields]) describe(`${f.collection}.${f.field}`, f.diff);

	log.step('Relationen');
	if (!diff.relations.length) log.keep('keine Änderung');
	for (const r of diff.relations) describe(`${r.collection}.${r.field} → ${r.related_collection ?? '?'}`, r.diff);
}

/** Wie viele Objekte würde ein vollständiger Abgleich löschen? */
function deletions(diff: Diff | null): string[] {
	if (!diff) return [];
	const gone = (d: DiffEntry[]) => d.some((e) => e.kind === 'D' && !e.path?.length);
	return [
		...diff.collections.filter((c) => gone(c.diff)).map((c) => c.collection),
		...[...diff.fields, ...diff.systemFields].filter((f) => gone(f.diff)).map((f) => `${f.collection}.${f.field}`),
		...diff.relations.filter((r) => gone(r.diff)).map((r) => `Relation ${r.collection}.${r.field}`)
	];
}

async function diffAgainst(snapshot: Snapshot, mode: 'mirror' | 'merge') {
	return api<{ hash: string; diff: Diff }>(`/schema/diff?mode=${mode}`, {
		method: 'POST',
		body: JSON.stringify(snapshot)
	});
}

// ------------------------------------------------------------------ Befehle

async function pull() {
	const snapshot = await api<Snapshot>('/schema/snapshot');
	if (!snapshot) throw new Error('Leerer Snapshot');
	const next = JSON.stringify(normalize(snapshot), null, '\t') + '\n';

	let current = '';
	try {
		current = readFileSync(FILE, 'utf8');
	} catch {}

	log.step(`Snapshot von ${url}`);
	console.log(`  Directus ${snapshot.directus} · ${snapshot.collections.length} Collections · ${snapshot.fields.length} Felder · ${snapshot.relations.length} Relationen`);
	if (current === next) return log.keep('schema/snapshot.json');

	log.set('schema/snapshot.json — Änderungen mit `git diff schema/` ansehen');
	if (DRY) return;
	mkdirSync(dirname(FILE), { recursive: true });
	writeFileSync(FILE, next);
}

async function check() {
	const snapshot = readFile();
	log.step(`${url} gegen schema/snapshot.json`);
	const result = await diffAgainst(snapshot, 'mirror');
	if (!result) return log.keep('Datenmodell stimmt überein');

	describeAll(result.diff);
	console.log(`\n${color.yellow('Abweichung.')} Soll der Snapshot gelten: \`apply\`. Ist die Instanz richtig: \`pull\`.`);
	process.exitCode = 1;
}

async function apply() {
	if (!local && !has('produktion')) {
		throw new Error(`${url} ist nicht die Probe. Erst gegen localhost, dann mit --produktion (nach dem Backup).`);
	}
	const snapshot = readFile();
	const withDeletes = has('mit-loeschen');

	log.step(`${url} an schema/snapshot.json angleichen${withDeletes ? ' — mit Löschungen' : ''}`);
	const result = await diffAgainst(snapshot, withDeletes ? 'mirror' : 'merge');

	// Was ein vollständiger Abgleich löschen würde, auch wenn wir es jetzt nicht tun.
	const pending = withDeletes ? [] : deletions((await diffAgainst(snapshot, 'mirror'))?.diff ?? null);
	for (const name of pending) log.warn(`${name} fehlt im Snapshot, bleibt stehen (löschen nur mit --mit-loeschen)`);

	if (!result) return log.keep('nichts anzulegen oder zu ändern');
	describeAll(result.diff);
	if (DRY) return;

	await api('/schema/apply', { method: 'POST', body: JSON.stringify(result) });
	const after = await diffAgainst(snapshot, withDeletes ? 'mirror' : 'merge');
	if (after) console.log(color.red('\nNach dem Abgleich bleibt eine Abweichung — `check` ausführen.'));
	else if (pending.length) console.log(color.yellow(`\nAngeglichen bis auf ${pending.length} Löschung(en), siehe !! oben.`));
	else console.log(color.green('\nAngeglichen.'));
	if (after) process.exitCode = 1;
}

const commands: Record<string, () => Promise<void>> = { pull, check, apply };

if (!command || !commands[command]) {
	console.error('Unterbefehl fehlt: pull | check | apply');
	process.exit(1);
}
run(commands[command], { report: command === 'check' });
