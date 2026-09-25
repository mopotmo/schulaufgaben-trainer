/**
 * Einmalig: Altlasten der families → groups-Migration entfernen (Spec §6 Schritt 6).
 *
 * 1. Prüfen, ob alte und neue Felder übereinstimmen — sonst Abbruch, bevor etwas gelöscht wird
 * 2. `profiles.group_id` auf NOT NULL
 * 3. `profiles.family_id` löschen
 * 4. `books.owner_family` löschen (samt Relation zu `families`)
 * 5. Collection `families` löschen
 *
 * Idempotent. Schritte 3–5 sind ohne Backup nicht umkehrbar — vorher DB-Backup
 * (docs/backup-und-restore.md) und erst gegen eine wiederhergestellte Kopie laufen lassen.
 *
 * Ausführen:
 *   node --experimental-strip-types --env-file=.env scripts/cleanup-families.ts --dry
 *
 * Gegen die lokale Probeumgebung:
 *   node --experimental-strip-types --env-file=.env scripts/cleanup-families.ts \
 *     --url=http://localhost:8055 --dry
 */
import {
	createDirectus,
	rest,
	staticToken,
	readItems,
	readFieldsByCollection,
	readCollections,
	readRelations,
	updateField,
	deleteField,
	deleteRelation,
	deleteCollection
} from '@directus/sdk';

type Schema = {
	families: { id: string; name: string }[];
	groups: { id: string }[];
	profiles: { id: string; name: string; family_id: string | null; group_id: string | null }[];
	books: { id: string; title: string; owner_family: string | null; owner_group: string | null }[];
};

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
	del: (s: string) => {
		changes++;
		console.log(`  ${DRY ? 'würde löschen' : 'gelöscht    '}  ${s}`);
	},
	set: (s: string) => {
		changes++;
		console.log(`  ${DRY ? 'würde setzen ' : 'gesetzt     '}  ${s}`);
	},
	keep: (s: string) => console.log(`  unverändert   ${s}`),
	ok: (s: string) => console.log(`  \x1b[32mok\x1b[0m            ${s}`),
	fail: (s: string) => console.log(`  \x1b[31mABWEICHUNG\x1b[0m    ${s}`)
};

// ------------------------------------------------------------------- Schritte

async function hasField(collection: string, field: string): Promise<boolean> {
	const fields = await directus.request(readFieldsByCollection(collection));
	return fields.some((f) => f.field === field);
}

/**
 * Die alten Felder werden erst gelöscht, wenn nachweislich nichts verloren geht: jede Familie
 * als Gruppe mit gleicher id, jedes Profil und Buch mit identischem Verweis in alt und neu.
 */
async function verify(): Promise<boolean> {
	log.step('1. Abgleich alt ↔ neu');
	const collections = (await directus.request(readCollections())).map((c) => c.collection);
	let ok = true;

	const groupIds = new Set(
		(await directus.request(readItems('groups', { fields: ['id'], limit: -1 }))).map((g) => g.id)
	);

	if (collections.includes('families')) {
		const families = await directus.request(readItems('families', { fields: ['id', 'name'], limit: -1 }));
		const missing = families.filter((f) => !groupIds.has(f.id));
		if (missing.length) {
			ok = false;
			missing.forEach((f) => log.fail(`Familie ${f.name} (${f.id}) hat keine Gruppe`));
		} else log.ok(`${families.length} families → alle als groups vorhanden`);
	} else log.keep('families bereits gelöscht');

	const profileFields = ['id', 'name', 'group_id'];
	const withFamilyId = await hasField('profiles', 'family_id');
	if (withFamilyId) profileFields.push('family_id');
	const profiles = await directus.request(
		readItems('profiles', { fields: profileFields as ['id'], limit: -1 })
	) as Schema['profiles'];
	const badProfiles = profiles.filter(
		(p) => !p.group_id || !groupIds.has(p.group_id) || (withFamilyId && p.family_id && p.family_id !== p.group_id)
	);
	if (badProfiles.length) {
		ok = false;
		badProfiles.forEach((p) => log.fail(`Profil ${p.name}: family_id=${p.family_id} group_id=${p.group_id}`));
	} else log.ok(`${profiles.length} profiles → group_id gesetzt${withFamilyId ? ' und gleich family_id' : ''}`);

	const bookFields = ['id', 'title', 'owner_group'];
	const withOwnerFamily = await hasField('books', 'owner_family');
	if (withOwnerFamily) bookFields.push('owner_family');
	const books = await directus.request(
		readItems('books', { fields: bookFields as ['id'], limit: -1 })
	) as Schema['books'];
	const badBooks = books.filter(
		(b) => !b.owner_group || (withOwnerFamily && b.owner_family && b.owner_family !== b.owner_group)
	);
	if (badBooks.length) {
		ok = false;
		badBooks.forEach((b) => log.fail(`Buch ${b.title}: owner_family=${b.owner_family} owner_group=${b.owner_group}`));
	} else log.ok(`${books.length} books → owner_group gesetzt${withOwnerFamily ? ' und gleich owner_family' : ''}`);

	return ok;
}

async function groupIdNotNull() {
	log.step('2. profiles.group_id NOT NULL');
	const fields = await directus.request(readFieldsByCollection('profiles'));
	const field = fields.find((f) => f.field === 'group_id');
	if (!field) throw new Error('Feld profiles.group_id fehlt');
	if (field.schema?.is_nullable === false) return log.keep('bereits NOT NULL');

	log.set('is_nullable = false');
	if (DRY) return;
	await directus.request(
		updateField('profiles', 'group_id', { schema: { is_nullable: false }, meta: { required: true } })
	);
}

async function dropFamilyId() {
	log.step('3. profiles.family_id');
	if (!(await hasField('profiles', 'family_id'))) return log.keep('bereits gelöscht');
	log.del('Feld profiles.family_id');
	if (!DRY) await directus.request(deleteField('profiles', 'family_id'));
}

async function dropOwnerFamily() {
	log.step('4. books.owner_family');
	const relations = await directus.request(readRelations());
	if (relations.some((r) => r.collection === 'books' && r.field === 'owner_family')) {
		log.del('Relation books.owner_family → families');
		if (!DRY) await directus.request(deleteRelation('books', 'owner_family'));
	}
	if (!(await hasField('books', 'owner_family'))) return log.keep('Feld bereits gelöscht');
	log.del('Feld books.owner_family');
	if (!DRY) await directus.request(deleteField('books', 'owner_family'));
}

async function dropFamilies() {
	log.step('5. Collection families');
	const collections = await directus.request(readCollections());
	if (!collections.some((c) => c.collection === 'families')) return log.keep('bereits gelöscht');

	// Nach Schritt 4 darf nichts mehr auf families zeigen — sonst würde das Löschen Verweise
	// kappen, die dieses Skript nicht kennt.
	const relations = await directus.request(readRelations());
	const refs = relations.filter((r) => r.related_collection === 'families' && r.collection !== 'families');
	if (refs.length && !DRY) {
		throw new Error(`Noch Verweise auf families: ${refs.map((r) => `${r.collection}.${r.field}`).join(', ')}`);
	}

	log.del('Collection families');
	if (!DRY) await directus.request(deleteCollection('families'));
}

async function main() {
	if (!(await verify())) {
		console.log('\n\x1b[31mAbgebrochen — Abweichungen oben. Es wurde nichts verändert.\x1b[0m\n');
		process.exit(1);
	}
	await groupIdNotNull();
	await dropFamilyId();
	await dropOwnerFamily();
	await dropFamilies();

	console.log(`\n${DRY ? 'Würde' : 'Hat'} ${changes} Änderung(en) ${DRY ? 'vornehmen' : 'vorgenommen'}.`);
	if (DRY) console.log('\x1b[33mDry Run — nichts geschrieben. Ohne --dry erneut ausführen.\x1b[0m\n');
}

main().catch((e) => {
	console.error('\n\x1b[31mAbgebrochen:\x1b[0m', e?.errors ?? e);
	process.exit(1);
});
