/**
 * Einmalig: E-Mail-Bestätigung und Passwort-Reset einrichten.
 *
 * 1. `groups.email_verified_at` anlegen
 * 2. Collection `email_tokens` anlegen, samt Relation zu `groups`
 * 3. Flow „E-Mail-Tokens versenden" anlegen (Event-Hook auf `email_tokens.items.create`)
 * 4. Bestand: eingerichtete Familien mit E-Mail gelten als bestätigt
 * 5. `groups.invite_token` wird beim Anlegen einer Gruppe automatisch vergeben
 * 6. `groups.invite_link`: fertiger Einladungslink als Button im Datensatz
 *
 * Idempotent — mehrfaches Ausführen ändert nichts mehr. Schritt 4 muss vor dem Deploy des
 * neuen Codes laufen, sonst sperrt das Verifikations-Gate die bestehenden Familien aus.
 *
 * Ausführen:
 *   node --experimental-strip-types --env-file=.env scripts/email-verification.ts \
 *     --app-url=https://… --dry
 *
 * Gegen die lokale Probeumgebung:
 *   node --experimental-strip-types --env-file=.env scripts/email-verification.ts \
 *     --url=http://localhost:8055 --app-url=http://localhost:5173 --dry
 *
 * `--flow-neu` löscht einen bestehenden Flow und legt ihn neu an, etwa nach Textänderungen.
 */
import {
	createDirectus,
	rest,
	staticToken,
	readItems,
	updateItem,
	readFieldsByCollection,
	readCollections,
	readRelations,
	createField,
	updateField,
	createCollection,
	createRelation,
	readFlows,
	createFlow,
	updateFlow,
	deleteFlow,
	createOperation
} from '@directus/sdk';

type Group = {
	id: string;
	name: string;
	email: string | null;
	password_hash: string | null;
	email_verified_at: string | null;
};

type Schema = { groups: Group[] };

// ---------------------------------------------------------------- Argumente

const args = process.argv.slice(2);
const flag = (name: string): string | undefined =>
	args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

const DRY = args.includes('--dry');
const FLOW_NEU = args.includes('--flow-neu');
const URL = flag('url') ?? process.env.DIRECTUS_URL;
const TOKEN = flag('token') ?? process.env.DIRECTUS_TOKEN;
const APP_URL = flag('app-url')?.replace(/\/+$/, '');

if (!URL || !TOKEN) {
	console.error('DIRECTUS_URL und DIRECTUS_TOKEN fehlen (--env-file=.env oder --url= / --token=).');
	process.exit(1);
}
if (!APP_URL || !/^https?:\/\//.test(APP_URL)) {
	console.error('--app-url fehlt, z. B. --app-url=https://schulaufgaben-check.de');
	process.exit(1);
}

const directus = createDirectus<Schema>(URL).with(staticToken(TOKEN)).with(rest());

console.log(`Directus: ${URL}\nApp:      ${APP_URL}${DRY ? '\n\x1b[33mDry Run\x1b[0m' : ''}`);

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

async function addVerifiedField() {
	log.step('1. groups.email_verified_at');
	const fields = await directus.request(readFieldsByCollection('groups'));
	if (fields.some((f) => f.field === 'email_verified_at')) return log.keep('Feld vorhanden');

	log.add('Feld email_verified_at (timestamp, nullable)');
	if (DRY) return;
	await directus.request(
		createField('groups', {
			field: 'email_verified_at',
			type: 'timestamp',
			meta: {
				interface: 'datetime',
				note: 'Gesetzt, sobald die Familie den Bestätigungslink geklickt hat.',
				width: 'half'
			},
			schema: { is_nullable: true }
		})
	);
}

const TOKEN_FIELDS = [
	{
		field: 'id',
		type: 'uuid',
		meta: { special: ['uuid'], hidden: true, readonly: true, interface: 'input' },
		schema: { is_primary_key: true, length: 36, has_auto_increment: false }
	},
	{
		field: 'group_id',
		type: 'uuid',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: true },
		schema: { is_nullable: false }
	},
	{
		field: 'purpose',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			required: true,
			options: {
				choices: [
					{ text: 'Adresse bestätigen', value: 'verify' },
					{ text: 'Passwort zurücksetzen', value: 'reset' }
				]
			}
		},
		schema: { is_nullable: false }
	},
	{
		field: 'token',
		type: 'uuid',
		meta: { interface: 'input', required: true, readonly: true },
		schema: { is_nullable: false, is_unique: true }
	},
	{
		field: 'email',
		type: 'string',
		meta: { interface: 'input', required: true, note: 'Empfänger zum Zeitpunkt des Versands' },
		schema: { is_nullable: false }
	},
	{
		field: 'expires_at',
		type: 'timestamp',
		meta: { interface: 'datetime', required: true },
		schema: { is_nullable: false }
	},
	{
		field: 'used_at',
		type: 'timestamp',
		meta: { interface: 'datetime' },
		schema: { is_nullable: true }
	},
	{
		field: 'created_at',
		type: 'timestamp',
		meta: { special: ['date-created'], interface: 'datetime', readonly: true },
		schema: { is_nullable: true }
	}
];

async function addTokenCollection() {
	log.step('2. Collection email_tokens');
	const collections = await directus.request(readCollections());
	if (collections.some((c) => c.collection === 'email_tokens')) {
		log.keep('Collection vorhanden');
	} else {
		log.add(`Collection email_tokens (${TOKEN_FIELDS.map((f) => f.field).join(', ')})`);
		if (!DRY) {
			await directus.request(
				createCollection({
					collection: 'email_tokens',
					meta: {
						icon: 'mark_email_read',
						note: 'Einmal-Links für E-Mail-Bestätigung und Passwort-Reset. Jede neue Zeile löst eine Mail aus.',
						sort_field: null
					},
					schema: {},
					fields: TOKEN_FIELDS
				})
			);
		}
	}

	const relations = DRY && !collections.some((c) => c.collection === 'email_tokens')
		? []
		: await directus.request(readRelations());
	if (relations.some((r) => r.collection === 'email_tokens' && r.field === 'group_id')) {
		return log.keep('Relation group_id → groups vorhanden');
	}
	log.add('Relation group_id → groups (ON DELETE CASCADE)');
	if (DRY) return;
	await directus.request(
		createRelation({
			collection: 'email_tokens',
			field: 'group_id',
			related_collection: 'groups',
			schema: { on_delete: 'CASCADE' }
		})
	);
}

const FLOW_NAME = 'E-Mail-Tokens versenden';
/** Erhöhen, wenn sich Flow oder Mailtexte ändern — ein Lauf legt den Flow dann neu an. */
const FLOW_VERSION = 'Flow-Version 2';

/** Login-Daten stehen in beiden Mails: Wer das Passwort vergisst, weiß oft auch den Namen nicht mehr. */
const LOGIN_BLOCK = [
	'**So meldest du dich an**',
	'',
	`- Adresse: [${APP_URL}](${APP_URL})`,
	'- Familienname: **{{gruppe.slug}}**',
	'- Passwort: das, das du beim Einrichten vergeben hast'
];

function mailOptions(purpose: 'verify' | 'reset') {
	const token = '{{$trigger.payload.token}}';
	if (purpose === 'verify') {
		return {
			to: ['{{$trigger.payload.email}}'],
			subject: 'Bitte bestätige deine E-Mail-Adresse',
			type: 'markdown',
			body: [
				'Hallo,',
				'',
				'für den Schulaufgaben Check wurde gerade der Familienzugang „{{gruppe.name}}" mit dieser E-Mail-Adresse eingerichtet. Bitte bestätige die Adresse:',
				'',
				`**[E-Mail-Adresse bestätigen](${APP_URL}/email-bestaetigen?token=${token})**`,
				'',
				'Der Link gilt 48 Stunden.',
				'',
				...LOGIN_BLOCK,
				'',
				'Heb diese Mail am besten auf.',
				'',
				'Wenn du das nicht warst, kannst du diese Mail ignorieren.'
			].join('\n')
		};
	}
	return {
		to: ['{{$trigger.payload.email}}'],
		subject: 'Neues Passwort für den Schulaufgaben Check',
		type: 'markdown',
		body: [
			'Hallo,',
			'',
			'für deinen Familienzugang „{{gruppe.name}}" beim Schulaufgaben Check wurde ein neues Passwort angefordert:',
			'',
			`**[Neues Passwort vergeben](${APP_URL}/passwort-zuruecksetzen?token=${token})**`,
			'',
			'Der Link gilt eine Stunde.',
			'',
			...LOGIN_BLOCK.map((l) => l.replace('das, das du beim Einrichten vergeben hast', 'das neue, das du über den Link vergibst')),
			'',
			'Wenn du das nicht angefordert hast, kannst du diese Mail ignorieren. Dein bisheriges Passwort bleibt dann gültig.'
		].join('\n')
	};
}

/**
 * Bewusst ein Event-Hook und kein Webhook: Webhook-Flows sind in Directus ohne Anmeldung
 * aufrufbar. Ein Flow, der Adresse und Inhalt aus der Anfrage nimmt, wäre ein offenes
 * Mail-Relay unter unserem Absender. So kann nur auslösen, wer `email_tokens` schreiben darf.
 */
async function addFlow() {
	log.step('3. Flow „E-Mail-Tokens versenden"');
	const flows = await directus.request(
		readFlows({ filter: { name: { _eq: FLOW_NAME } }, fields: ['id', 'name', 'description'] })
	);
	const current = flows.length === 1 && flows[0].description?.includes(FLOW_VERSION);

	if (current && !FLOW_NEU) return log.keep(`Flow vorhanden, ${FLOW_VERSION}`);
	if (flows.length > 0) {
		log.set(`Flow löschen und neu anlegen (${current ? '--flow-neu' : `veraltet → ${FLOW_VERSION}`})`);
		if (!DRY) for (const f of flows) await directus.request(deleteFlow(f.id));
	} else {
		log.add(`Flow: Gruppe lesen, Bedingung, zwei Mail-Operationen (${FLOW_VERSION})`);
	}
	if (DRY) return;

	const flow = await directus.request(
		createFlow({
			name: FLOW_NAME,
			icon: 'mail',
			color: '#2563EB',
			description: `Verschickt Bestätigungs- und Reset-Links samt Login-Daten. Wird von der App über neue Zeilen in email_tokens ausgelöst. Angelegt von scripts/email-verification.ts — ${FLOW_VERSION}.`,
			status: 'active',
			trigger: 'event',
			accountability: 'all',
			options: { type: 'action', scope: ['items.create'], collections: ['email_tokens'] }
		})
	);

	const verify = await directus.request(
		createOperation({
			flow: flow.id,
			name: 'Bestätigungsmail',
			key: 'mail_verify',
			type: 'mail',
			position_x: 55,
			position_y: 1,
			options: mailOptions('verify')
		})
	);
	const reset = await directus.request(
		createOperation({
			flow: flow.id,
			name: 'Reset-Mail',
			key: 'mail_reset',
			type: 'mail',
			position_x: 55,
			position_y: 19,
			options: mailOptions('reset')
		})
	);
	const condition = await directus.request(
		createOperation({
			flow: flow.id,
			name: 'Zweck?',
			key: 'purpose',
			type: 'condition',
			position_x: 37,
			position_y: 1,
			options: { filter: { $trigger: { payload: { purpose: { _eq: 'verify' } } } } },
			resolve: verify.id,
			reject: reset.id
		})
	);
	// Login-Name und Familienname für die Mail. Ein einzelner Schlüssel liefert das Objekt
	// direkt, die Mail greift dann per {{gruppe.slug}} darauf zu. `$full`, damit es nicht von
	// den Rechten des auslösenden Nutzers abhängt — gelesen wird nur die Gruppe aus dem Token.
	const group = await directus.request(
		createOperation({
			flow: flow.id,
			name: 'Gruppe lesen',
			key: 'gruppe',
			type: 'item-read',
			position_x: 19,
			position_y: 1,
			options: {
				collection: 'groups',
				key: ['{{$trigger.payload.group_id}}'],
				query: { fields: ['name', 'slug'] },
				permissions: '$full'
			},
			resolve: condition.id
		})
	);
	await directus.request(updateFlow(flow.id, { operation: group.id }));
}

async function markExistingVerified() {
	log.step('4. Bestand: eingerichtete Familien gelten als bestätigt');
	const groups = await directus.request(
		readItems('groups', { fields: ['id', 'name', 'email', 'password_hash', 'email_verified_at'], limit: -1 })
	).catch((e) => {
		// Im Dry Run gibt es das Feld noch nicht — dann ohne es lesen.
		if (!DRY) throw e;
		return directus.request(readItems('groups', { fields: ['id', 'name', 'email', 'password_hash'], limit: -1 }));
	});

	const now = new Date().toISOString();
	for (const g of groups as Group[]) {
		if (g.email_verified_at) {
			log.keep(`${g.name} (bestätigt seit ${g.email_verified_at})`);
		} else if (!g.password_hash || !g.email) {
			// Noch nicht eingerichtet: Die Familie gibt ihre Adresse beim Einrichten selbst an.
			log.keep(`${g.name} (nicht eingerichtet oder ohne E-Mail — bestätigt später selbst)`);
		} else {
			log.set(`${g.name}: ${g.email} als bestätigt`);
			if (!DRY) await directus.request(updateItem('groups', g.id, { email_verified_at: now }));
		}
	}
}

/**
 * Directus' Spezialwert `uuid` erzeugt beim Anlegen eine UUID aus `node:crypto`, wenn das Feld
 * leer bleibt, und lässt einen mitgegebenen Wert stehen. Beim Einrichten setzt die App das
 * Token auf null — spätere Änderungen fasst der Spezialwert nicht an.
 */
async function autoInviteToken() {
	log.step('5. groups.invite_token automatisch vergeben');
	const fields = await directus.request(readFieldsByCollection('groups'));
	const field = fields.find((f) => f.field === 'invite_token');
	if (!field) throw new Error('Feld groups.invite_token fehlt');

	const special: string[] = field.meta?.special ?? [];
	const note = `Wird beim Anlegen automatisch vergeben. Einladungslink: ${APP_URL}/einrichten?token=<dieser Wert>. Nach dem Einrichten leer.`;
	if (special.includes('uuid') && field.meta?.note === note) return log.keep('bereits automatisch');

	log.set(`Spezialwert uuid und Notiz „${note}"`);
	if (DRY) return;
	await directus.request(
		updateField('groups', 'invite_token', {
			meta: { special: [...new Set([...special, 'uuid'])], note }
		})
	);
}

/**
 * Reines Anzeigefeld ohne Spalte in der Datenbank. Das Links-Interface setzt `{{invite_token}}`
 * aus dem Formular ein und rendert einen echten Link — Rechtsklick → „Link-Adresse kopieren".
 * Nur sichtbar, solange ein Token gesetzt ist.
 */
async function addInviteLink() {
	log.step('6. groups.invite_link (Einladungslink im Datensatz)');
	const url = `${APP_URL}/einrichten?token={{invite_token}}`;
	const meta = {
		interface: 'presentation-links',
		special: ['alias', 'no-data'],
		options: {
			links: [{ label: 'Einladungslink', icon: 'link', type: 'primary', actionType: 'url', url }]
		},
		note: 'Rechtsklick → „Link-Adresse kopieren". Erscheint nach dem Speichern, solange die Familie nicht eingerichtet ist.',
		conditions: [{ name: 'Ohne Token ausblenden', rule: { invite_token: { _null: true } }, hidden: true }],
		width: 'full'
	};

	const fields = await directus.request(readFieldsByCollection('groups'));
	const field = fields.find((f) => f.field === 'invite_link');
	if (field?.meta?.options?.links?.[0]?.url === url) return log.keep('Feld vorhanden');

	if (field) {
		log.set(`Link-Ziel auf ${url}`);
		if (!DRY) await directus.request(updateField('groups', 'invite_link', { meta }));
		return;
	}
	log.add(`Feld invite_link → ${url}`);
	if (DRY) return;
	await directus.request(createField('groups', { field: 'invite_link', type: 'alias', meta, schema: null }));
}

async function main() {
	await addVerifiedField();
	await addTokenCollection();
	await addFlow();
	await markExistingVerified();
	await autoInviteToken();
	await addInviteLink();

	console.log(`\n${DRY ? 'Würde' : 'Hat'} ${changes} Änderung(en) ${DRY ? 'vornehmen' : 'vorgenommen'}.`);
	if (DRY) console.log('\x1b[33mDry Run — nichts geschrieben. Ohne --dry erneut ausführen.\x1b[0m\n');
}

main().catch((e) => {
	console.error('\n\x1b[31mAbgebrochen:\x1b[0m', e?.errors ?? e);
	process.exit(1);
});
