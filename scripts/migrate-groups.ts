/**
 * Einmalige Migration: families → groups, plus memberships (Spec §6).
 *
 * Historisch: Gelaufen im September 2026. Seit `scripts/cleanup-families.ts` gibt es
 * `families`, `profiles.family_id` und `books.owner_family` nicht mehr — das Skript lässt
 * sich nicht mehr ausführen und bleibt nur als Nachweis, wie migriert wurde.
 *
 * Idempotent — mehrfaches Ausführen ändert nichts mehr. Die IDs bleiben erhalten,
 * eine Familie wird also zur Gruppe mit derselben id. Deshalb müssen keine
 * Fremdschlüssel repariert werden.
 *
 * Ausführen:
 *   node --experimental-strip-types --env-file=.env scripts/migrate-groups.ts --dry
 *   node --experimental-strip-types --env-file=.env scripts/migrate-groups.ts
 *
 * Gegen eine andere Instanz (Probelauf!):
 *   node --experimental-strip-types scripts/migrate-groups.ts --dry \
 *     --url=http://localhost:8055 --token=…
 *
 * Erst --dry gegen eine wiederhergestellte Backup-Kopie, dann erst Produktion.
 */
import { createDirectus, rest, staticToken, readItems, createItem, updateItem } from '@directus/sdk';

/**
 * Bewusst lokal definiert statt aus `src/lib/directus.ts` importiert: Diese Datei hängt an
 * `$env/static/private` und lässt sich außerhalb von SvelteKit nicht auflösen. Das Skript
 * braucht ohnehin nur die Felder, die es anfasst.
 */
type Family = {
	id: string;
	name: string;
	slug: string;
	email: string | null;
	password_hash: string | null;
	invite_token: string | null;
};
type Group = {
	id: string;
	type: string;
	name: string;
	slug: string;
	tenant: string;
	status: string;
	email: string | null;
	password_hash: string | null;
	invite_token: string | null;
};
type Membership = {
	id: string;
	profile_id: string;
	group_id: string;
	role: string;
	status: string;
};
type Profile = {
	id: string;
	name: string;
	family_id: string | null;
	group_id: string | null;
	kind: string;
};
type Book = {
	id: string;
	title: string;
	owner_family: string | null;
	owner_group: string | null;
	visibility: string;
};

type Schema = {
	families: Family[];
	groups: Group[];
	memberships: Membership[];
	profiles: Profile[];
	books: Book[];
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

// ------------------------------------------------------------------ Ausgabe

let created = 0;
let updated = 0;
let skipped = 0;

const log = {
	step: (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`),
	add: (s: string) => {
		created++;
		console.log(`  ${DRY ? 'würde anlegen' : 'angelegt   '}  ${s}`);
	},
	set: (s: string) => {
		updated++;
		console.log(`  ${DRY ? 'würde setzen ' : 'gesetzt    '}  ${s}`);
	},
	keep: (s: string) => {
		skipped++;
		console.log(`  unverändert   ${s}`);
	}
};

// ------------------------------------------------------------------- Schritte

async function migrateGroups(families: Family[], groups: Group[]) {
	log.step(`1. families → groups (${families.length})`);
	const byId = new Map(groups.map((g) => [g.id, g]));

	for (const family of families) {
		if (byId.has(family.id)) {
			log.keep(`${family.name} (${family.slug})`);
			continue;
		}
		log.add(`${family.name} (${family.slug}) → id ${family.id}`);
		if (DRY) continue;

		await directus.request(
			createItem('groups', {
				// Identische id — dadurch bleiben alle Verweise gültig.
				id: family.id,
				type: 'family',
				name: family.name,
				slug: family.slug,
				tenant: 'default',
				status: 'active',
				email: family.email,
				password_hash: family.password_hash,
				invite_token: family.invite_token
			})
		);
	}
}

async function migrateProfiles(profiles: Profile[]) {
	log.step(`2. profiles.group_id aus family_id befüllen (${profiles.length})`);

	for (const profile of profiles) {
		if (profile.group_id) {
			log.keep(`${profile.name} → bereits ${profile.group_id}`);
			continue;
		}
		if (!profile.family_id) {
			// Darf nicht vorkommen; wäre ein verwaistes Profil ohne Zuordnung.
			console.warn(`  \x1b[33mÜBERSPRUNGEN\x1b[0m  ${profile.name} (${profile.id}) hat keine family_id`);
			skipped++;
			continue;
		}
		log.set(`${profile.name} → group_id ${profile.family_id}`);
		if (DRY) continue;

		await directus.request(
			updateItem('profiles', profile.id, { group_id: profile.family_id, kind: 'learner' })
		);
	}
}

async function migrateMemberships(profiles: Profile[], memberships: Membership[]) {
	log.step(`3. memberships anlegen (role='learner')`);
	const existing = new Set(
		memberships.map((m) => `${m.profile_id}|${m.group_id}|${m.role}`)
	);

	for (const profile of profiles) {
		const groupId = profile.group_id ?? profile.family_id;
		if (!groupId) continue;

		if (existing.has(`${profile.id}|${groupId}|learner`)) {
			log.keep(`${profile.name} ist bereits learner in ${groupId}`);
			continue;
		}
		log.add(`${profile.name} als learner in ${groupId}`);
		if (DRY) continue;

		await directus.request(
			createItem('memberships', {
				profile_id: profile.id,
				group_id: groupId,
				role: 'learner',
				status: 'active'
			})
		);
	}
}

async function migrateBooks(books: Book[]) {
	log.step(`4. books.owner_group aus owner_family befüllen (${books.length})`);
	if (books.length === 0) {
		console.log('  keine Bücher vorhanden');
		return;
	}

	for (const book of books) {
		if (book.owner_group) {
			log.keep(`${book.title} → bereits ${book.owner_group}`);
			continue;
		}
		if (!book.owner_family) {
			log.keep(`${book.title} → kein Eigentümer (visibility='${book.visibility}')`);
			continue;
		}
		log.set(`${book.title} → owner_group ${book.owner_family}`);
		if (DRY) continue;

		await directus.request(updateItem('books', book.id, { owner_group: book.owner_family }));
	}
}

// ---------------------------------------------------------------- Verifikation

async function verify() {
	log.step('5. Verifikation');

	const [families, groups, profiles, memberships, books] = await Promise.all([
		directus.request(readItems('families', { limit: -1, fields: ['id'] })),
		directus.request(readItems('groups', { limit: -1, fields: ['id', 'type'] })),
		directus.request(readItems('profiles', { limit: -1, fields: ['id', 'name', 'group_id'] })),
		directus.request(readItems('memberships', { limit: -1, fields: ['id', 'profile_id', 'role'] })),
		directus.request(readItems('books', { limit: -1, fields: ['id', 'title', 'owner_group', 'owner_family'] }))
	]);

	const ohneGruppe = profiles.filter((p) => !p.group_id);
	const ohneMitgliedschaft = profiles.filter(
		(p) => !memberships.some((m) => m.profile_id === p.id && m.role === 'learner')
	);
	const buecherOffen = books.filter((b) => b.owner_family && !b.owner_group);

	const zeile = (label: string, ist: number, soll: number) => {
		const ok = ist === soll;
		console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label.padEnd(34)} ${ist} / ${soll}`);
		return ok;
	};

	const checks = [
		zeile('groups vs. families', groups.length, families.length),
		zeile('Profile mit group_id', profiles.length - ohneGruppe.length, profiles.length),
		zeile('Profile mit learner-Mitgliedschaft', profiles.length - ohneMitgliedschaft.length, profiles.length),
		zeile('Bücher mit owner_group', books.length - buecherOffen.length, books.length)
	];

	for (const p of ohneGruppe) console.log(`      ohne group_id: ${p.name} (${p.id})`);
	for (const p of ohneMitgliedschaft) console.log(`      ohne membership: ${p.name} (${p.id})`);
	for (const b of buecherOffen) console.log(`      ohne owner_group: ${b.title} (${b.id})`);

	return checks.every(Boolean);
}

// ------------------------------------------------------------------- Ablauf

async function main() {
	console.log(`\nZiel:  ${URL}`);
	console.log(`Modus: ${DRY ? '\x1b[33mDRY RUN — es wird nichts geschrieben\x1b[0m' : '\x1b[31mSCHREIBEND\x1b[0m'}`);

	const [families, groups, profiles, memberships, books] = await Promise.all([
		directus.request(readItems('families', { limit: -1 })),
		directus.request(readItems('groups', { limit: -1 })),
		directus.request(readItems('profiles', { limit: -1 })),
		directus.request(readItems('memberships', { limit: -1 })),
		directus.request(readItems('books', { limit: -1 }))
	]);

	console.log(
		`Vorher: ${families.length} families, ${groups.length} groups, ${profiles.length} profiles, ` +
			`${memberships.length} memberships, ${books.length} books`
	);

	await migrateGroups(families, groups);
	// Profile frisch lesen — Schritt 2 hängt an den Gruppen aus Schritt 1.
	await migrateProfiles(DRY ? profiles : await directus.request(readItems('profiles', { limit: -1 })));
	await migrateMemberships(
		DRY ? profiles : await directus.request(readItems('profiles', { limit: -1 })),
		memberships
	);
	await migrateBooks(books);

	console.log(
		`\n${DRY ? 'Würde' : 'Hat'} ${created} anlegen, ${updated} aktualisieren, ${skipped} überspringen.`
	);

	if (DRY) {
		console.log('\n\x1b[33mDry Run — nichts geschrieben. Ohne --dry erneut ausführen.\x1b[0m\n');
		return;
	}

	const ok = await verify();
	console.log(
		ok
			? '\n\x1b[32mMigration vollständig.\x1b[0m Nächster Schritt: Code umstellen (Spec §4, §5), erst danach NOT NULL und das Löschen der Altfelder (§6 Schritt 6).\n'
			: '\n\x1b[31mMigration unvollständig — siehe Abweichungen oben. Nicht weitermachen.\x1b[0m\n'
	);
	if (!ok) process.exit(1);
}

main().catch((e) => {
	console.error('\n\x1b[31mAbgebrochen:\x1b[0m', e?.errors ?? e);
	process.exit(1);
});
