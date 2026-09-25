/**
 * Einmalig: Löschfrist für Schulbücher vorbereiten (Konzept §3.6).
 *
 * 1. `books.last_used_at` anlegen — zuletzt Quelle einer Generierung
 * 2. Bestand: Bücher ohne Wert bekommen ihr `created_at`
 *
 * Idempotent. Muss vor dem Deploy des Codes laufen, der das Feld schreibt — `createBook` und
 * `markBookUsed` setzen es. `scripts/aufraeumen.ts` käme ohne das Feld aus (es rechnet dann
 * ab `created_at`), aber die Bücherliste zeigt das Löschdatum aus diesem Wert.
 *
 * Ausführen:
 *   node --experimental-strip-types --env-file=.env scripts/books-last-used.ts --dry
 *
 * Gegen die lokale Probeumgebung:
 *   node --experimental-strip-types --env-file=.env scripts/books-last-used.ts \
 *     --url=http://localhost:8055 --dry
 */
import {
	createDirectus,
	rest,
	staticToken,
	readItems,
	updateItem,
	readFieldsByCollection,
	createField
} from '@directus/sdk';

type Book = { id: string; created_at: string | null; last_used_at: string | null };
type Schema = { books: Book[] };

// ---------------------------------------------------------------- Argumente

const args = process.argv.slice(2);
const flag = (name: string): string | undefined =>
	args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

const DRY = args.includes('--dry');
const URL = flag('url') ?? process.env.DIRECTUS_URL;
const TOKEN = flag('token') ?? process.env.DIRECTUS_TOKEN;

if (!URL || !TOKEN) {
	console.error('DIRECTUS_URL und DIRECTUS_TOKEN fehlen (--env-file=.env oder --url= / --token=).');
	process.exit(1);
}

const directus = createDirectus<Schema>(URL).with(staticToken(TOKEN)).with(rest());

console.log(`Directus: ${URL}${DRY ? '\n\x1b[33mDry Run\x1b[0m' : ''}`);

// ------------------------------------------------------------------ Ausgabe

let changes = 0;

const log = {
	step: (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`),
	add: (s: string) => {
		changes++;
		console.log(`  ${DRY ? 'würde anlegen' : 'angelegt   '}  ${s}`);
	},
	set: (s: string) => {
		changes++;
		console.log(`  ${DRY ? 'würde setzen ' : 'gesetzt    '}  ${s}`);
	},
	keep: (s: string) => console.log(`  unverändert   ${s}`)
};

// ------------------------------------------------------------------- Schritte

let fieldExists = false;

async function addField() {
	log.step('1. books.last_used_at');
	const fields = await directus.request(readFieldsByCollection('books'));
	fieldExists = fields.some((f) => f.field === 'last_used_at');
	if (fieldExists) return log.keep('Feld vorhanden');

	log.add('Feld last_used_at (timestamp, nullable)');
	if (DRY) return;
	await directus.request(
		createField('books', {
			field: 'last_used_at',
			type: 'timestamp',
			meta: {
				interface: 'datetime',
				readonly: true,
				width: 'half',
				note: 'Zuletzt Quelle einer Generierung. 90 Tage danach, spätestens zum 31.08., löscht scripts/aufraeumen.ts das Buch samt PDF.'
			},
			schema: { is_nullable: true }
		})
	);
	fieldExists = true;
}

async function backfill() {
	log.step('2. Bestand: last_used_at = created_at');
	// Im Dry Run fehlt das Feld womöglich noch — dann gilt jedes Buch als ohne Wert.
	const books = await directus.request(
		readItems('books', { fields: fieldExists ? ['id', 'created_at', 'last_used_at'] : ['id', 'created_at'], limit: -1 })
	);
	const open = books.filter((b) => !b.last_used_at);
	if (open.length === 0) return log.keep(`${books.length} Bücher, alle gesetzt`);

	for (const b of open) {
		// Ohne created_at bleibt das Feld leer; das Aufräum-Skript rührt solche Bücher nicht an.
		if (!b.created_at) {
			console.log(`  \x1b[33m!!\x1b[0m            ${b.id} ohne created_at — übersprungen`);
			continue;
		}
		log.set(`${b.id} → ${b.created_at}`);
		if (!DRY) await directus.request(updateItem('books', b.id, { last_used_at: b.created_at }));
	}
}

async function main() {
	await addField();
	await backfill();

	console.log(`\n${DRY ? 'Würde' : 'Hat'} ${changes} Änderung(en) ${DRY ? 'vornehmen' : 'vorgenommen'}.`);
	if (DRY) console.log('\x1b[33mDry Run — nichts geschrieben. Ohne --dry erneut ausführen.\x1b[0m\n');
}

main().catch((e) => {
	console.error('\n\x1b[31mAbgebrochen:\x1b[0m', e?.errors ?? e);
	process.exit(1);
});
