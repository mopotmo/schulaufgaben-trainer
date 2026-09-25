/**
 * Tägliche Löschung nach den zugesagten Fristen — läuft als Cronjob auf dem Server.
 * Fristen und Regeln stehen in `src/lib/retention.ts`, dieselbe Datei zeigt die Bücherliste an.
 *
 * 1. Schulbücher: 90 Tage ohne Nutzung, spätestens zum Ende des Schuljahres (Konzept §3.6)
 * 2. Aufgabenblätter und Lösungsfotos: 30 Tage nach dem Upload (Konzept §3.5).
 *    Die Verweise in `exercises` / `corrections` werden geleert, Aufgaben und Korrekturtexte bleiben.
 * 3. Verwaiste Dateien: 30 Tage nach dem Upload, wenn nichts auf sie verweist
 * 4. `email_tokens`: verbraucht oder abgelaufen, älter als 7 Tage
 *
 * Warum ein Skript und kein Directus-Flow: Die Flow-Operation „Delete Data" löscht in
 * `directus_files` nur die Zeile, nicht die Datei auf der Platte (sie nutzt den ItemsService,
 * nicht den FilesService — geprüft an Directus 11). Nur `DELETE /files` über die REST-API
 * entfernt beides.
 *
 * Bewusst `fetch` statt `@directus/sdk`: Auf dem Server läuft das Skript in einem schlichten
 * Node-Container ohne `node_modules` (docs/backup-und-restore.md, „Aufräumen").
 *
 * Ausführen:
 *   node --experimental-strip-types --env-file=.env scripts/aufraeumen.ts --dry
 *
 * Gegen die lokale Probeumgebung:
 *   node --experimental-strip-types --env-file=.env scripts/aufraeumen.ts --url=http://localhost:8055 --dry
 *
 * Umgebung: DIRECTUS_URL, DIRECTUS_TOKEN (Admin), optional PUSH_URL (Uptime Kuma, ohne Parameter).
 * Ausgegeben werden nur IDs und Zahlen — keine Dateinamen, keine Buchtitel.
 */
import {
	EMAIL_TOKEN_RETENTION_DAYS,
	UPLOAD_RETENTION_DAYS,
	daysAgo,
	isBookExpired
} from '../src/lib/retention.ts';

// ---------------------------------------------------------------- Argumente

const args = process.argv.slice(2);
const flag = (name: string): string | undefined =>
	args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

const DRY = args.includes('--dry');
const URL = (flag('url') ?? process.env.DIRECTUS_URL)?.replace(/\/+$/, '');
const TOKEN = flag('token') ?? process.env.DIRECTUS_TOKEN;
const PUSH_URL = process.env.PUSH_URL;

if (!URL || !TOKEN) {
	console.error('DIRECTUS_URL und DIRECTUS_TOKEN fehlen (--env-file=.env oder --url= / --token=).');
	process.exit(1);
}

const now = new Date();
const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const log = (s: string) => console.log(`${stamp()}  ${s}`);

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
	const res = await fetch(`${URL}${path}`, {
		method,
		headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
		body: body ? JSON.stringify(body) : undefined
	});
	if (!res.ok) throw new Error(`${method} ${path.split('?')[0]} → ${res.status} ${await res.text()}`);
	if (res.status === 204) return undefined as T;
	return ((await res.json()) as { data: T }).data;
}

const q = (params: Record<string, unknown>) =>
	'?' +
	Object.entries(params)
		.map(([k, v]) => `${k}=${encodeURIComponent(typeof v === 'string' ? v : JSON.stringify(v))}`)
		.join('&');

/** System-Collections haben eigene Endpunkte: directus_users → /users. */
const endpoint = (collection: string) =>
	collection.startsWith('directus_') ? `/${collection.slice('directus_'.length)}` : `/items/${collection}`;

// ------------------------------------------------------------------ Verweise

type Ref = { collection: string; field: string };
const key = (r: Ref) => `${r.collection}.${r.field}`;

const UPLOAD_REFS: Ref[] = [
	{ collection: 'exercises', field: 'source_file' },
	{ collection: 'corrections', field: 'solution_file' }
];
const BOOK_REF: Ref = { collection: 'books', field: 'file' };

/**
 * Wer auf eine Datei verweist, bestimmt, welche Frist gilt. Gelesen wird jede Relation auf
 * `directus_files` — auch solche, die es heute noch nicht gibt. Eine Datei mit einem
 * unbekannten Verweis wird nie gelöscht.
 */
async function collectRefs(): Promise<Map<string, { ref: Ref; id: string }[]>> {
	const relations = await api<{ collection: string; field: string; related_collection: string | null }[]>(
		'GET',
		'/relations'
	);
	const refs = new Map<string, Ref>();
	for (const r of [...UPLOAD_REFS, BOOK_REF, { collection: 'directus_users', field: 'avatar' }]) refs.set(key(r), r);
	for (const r of relations) if (r.related_collection === 'directus_files') refs.set(key(r), r);

	const byFile = new Map<string, { ref: Ref; id: string }[]>();
	for (const ref of refs.values()) {
		const rows =
			ref.collection === 'directus_settings'
				? [await api<Record<string, string | null>>('GET', `/settings${q({ fields: ref.field })}`)]
				: await api<Record<string, string | null>[]>(
						'GET',
						`${endpoint(ref.collection)}${q({ fields: `id,${ref.field}`, filter: { [ref.field]: { _nnull: true } }, limit: -1 })}`
					);
		for (const row of rows) {
			const fileId = row[ref.field];
			if (!fileId) continue;
			const list = byFile.get(fileId) ?? [];
			list.push({ ref, id: String(row.id ?? 'settings') });
			byFile.set(fileId, list);
		}
	}
	return byFile;
}

// ------------------------------------------------------------------- Schritte

let deleted = 0;

async function deleteFiles(ids: string[]) {
	if (ids.length === 0 || DRY) return;
	await api('DELETE', '/files', ids);
}

async function books(): Promise<Set<string>> {
	const list = await api<{ id: string; file: string | null; created_at: string | null; last_used_at: string | null }[]>(
		'GET',
		`/items/books${q({ fields: 'id,file,created_at,last_used_at', limit: -1 })}`
	);
	// Ohne created_at lässt sich keine Frist berechnen — lieber stehen lassen als sofort löschen.
	const expired = list.filter((b) => b.created_at && isBookExpired({ created_at: b.created_at, last_used_at: b.last_used_at }, now));
	const files = expired.map((b) => b.file).filter((f): f is string => !!f);
	log(`Bücher: ${list.length}, abgelaufen ${expired.length}${expired.length ? ` (${expired.map((b) => b.id).join(', ')})` : ''}`);
	if (expired.length && !DRY) {
		await api('DELETE', '/items/books', expired.map((b) => b.id));
		await deleteFiles(files);
	}
	deleted += expired.length;
	return new Set(files);
}

async function uploads(handled: Set<string>) {
	const cutoff = daysAgo(UPLOAD_RETENTION_DAYS, now);
	// Die Dateien gerade gelöschter Bücher fehlen im echten Lauf schon, im Dry Run noch nicht.
	const files = (
		await api<{ id: string; uploaded_on: string | null }[]>('GET', `/files${q({ fields: 'id,uploaded_on', limit: -1 })}`)
	).filter((f) => !handled.has(f.id));
	const refs = await collectRefs();

	const expiredUploads: string[] = [];
	const orphans: string[] = [];
	let kept = 0;
	for (const f of files) {
		// Ohne Upload-Datum keine Frist — stehen lassen.
		if (!f.uploaded_on || new Date(f.uploaded_on) >= cutoff) {
			kept++;
			continue;
		}
		const fileRefs = refs.get(f.id) ?? [];
		if (fileRefs.length === 0) orphans.push(f.id);
		else if (fileRefs.every((r) => UPLOAD_REFS.some((u) => key(u) === key(r.ref)))) expiredUploads.push(f.id);
		else kept++;
	}

	log(`Dateien: ${files.length}, davon Aufgabenblätter/Lösungen älter als ${UPLOAD_RETENTION_DAYS} Tage ${expiredUploads.length}, verwaist ${orphans.length}, bleiben ${kept}`);
	if (expiredUploads.length) log(`  Uploads: ${expiredUploads.join(', ')}`);
	if (orphans.length) log(`  verwaist: ${orphans.join(', ')}`);

	if (!DRY) {
		// Erst die Verweise leeren, dann die Dateien — unabhängig davon, wie die Relation beim
		// Löschen eingestellt ist. Aufgabe und Korrekturtext bleiben erhalten.
		for (const u of UPLOAD_REFS) {
			const rows = expiredUploads.flatMap((id) => (refs.get(id) ?? []).filter((r) => key(r.ref) === key(u)).map((r) => r.id));
			if (rows.length) await api('PATCH', `/items/${u.collection}`, { keys: rows, data: { [u.field]: null } });
		}
		await deleteFiles([...expiredUploads, ...orphans]);
	}
	deleted += expiredUploads.length + orphans.length;
}

async function emailTokens() {
	const cutoff = daysAgo(EMAIL_TOKEN_RETENTION_DAYS, now).toISOString();
	const tokens = await api<{ id: string }[]>(
		'GET',
		`/items/email_tokens${q({
			fields: 'id',
			filter: {
				_and: [
					{ created_at: { _lt: cutoff } },
					{ _or: [{ used_at: { _nnull: true } }, { expires_at: { _lt: now.toISOString() } }] }
				]
			},
			limit: -1
		})}`
	);
	log(`email_tokens: verbraucht oder abgelaufen, älter als ${EMAIL_TOKEN_RETENTION_DAYS} Tage: ${tokens.length}`);
	if (tokens.length && !DRY) await api('DELETE', '/items/email_tokens', tokens.map((t) => t.id));
	deleted += tokens.length;
}

async function push(status: 'up' | 'down', msg: string) {
	if (!PUSH_URL || DRY) return;
	await fetch(`${PUSH_URL}${q({ status, msg: msg.slice(0, 200) })}`).catch(() => undefined);
}

async function main() {
	log(`${URL}${DRY ? ' — Dry Run, nichts wird gelöscht' : ''}`);
	const bookFiles = await books();
	await uploads(bookFiles);
	await emailTokens();
	const summary = `${DRY ? 'würde löschen' : 'gelöscht'}: ${deleted}`;
	log(summary);
	await push('up', summary);
}

main().catch(async (e) => {
	log(`FEHLER: ${e instanceof Error ? e.message : e}`);
	await push('down', e instanceof Error ? e.message : String(e));
	process.exit(1);
});
