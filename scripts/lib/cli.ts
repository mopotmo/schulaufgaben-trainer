/**
 * Gemeinsames Gerüst für Skripte gegen Directus: Argumente, Ziel, Ausgabe mit Änderungszähler.
 *
 * Die älteren Einmal-Skripte (`migrate-groups.ts`, `email-verification.ts` …) tragen dasselbe
 * noch selbst und bleiben so — sie sind gelaufen und werden nicht mehr angefasst.
 * `aufraeumen.ts` ebenfalls nicht: Es läuft auf dem Server ohne diese Datei.
 */

const args = process.argv.slice(2);

/** `--name=wert` → `wert`. */
export const flag = (name: string): string | undefined =>
	args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

/** `--name` ohne Wert. */
export const has = (name: string): boolean => args.includes(`--${name}`);

/** Erstes Argument ohne `--` — der Unterbefehl. */
export const command: string | undefined = args.find((a) => !a.startsWith('--'));

export const DRY = has('dry');

/**
 * Ziel-Instanz: `--url=` vor `DIRECTUS_URL`. Der Token gilt auch gegen die Probe, weil er
 * im Dump mitkommt (docs/backup-und-restore.md).
 */
export function target(): { url: string; token: string; local: boolean } {
	const url = (flag('url') ?? process.env.DIRECTUS_URL)?.replace(/\/+$/, '');
	const token = flag('token') ?? process.env.DIRECTUS_TOKEN;
	if (!url || !token) {
		console.error('DIRECTUS_URL und DIRECTUS_TOKEN fehlen (--env-file=.env oder --url= / --token=).');
		process.exit(1);
	}
	return { url, token, local: /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url) };
}

// ------------------------------------------------------------------ Ausgabe

export const color = {
	bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
	yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
	red: (s: string) => `\x1b[31m${s}\x1b[0m`,
	green: (s: string) => `\x1b[32m${s}\x1b[0m`
};

let changes = 0;
let report = false;

/**
 * Spalte vor jeder Zeile — im Dry Run „würde …", beim Schreiben das Partizip, im Bericht
 * (`run(…, { report: true })`) die Richtung der Abweichung aus Sicht der Ziel-Instanz.
 */
function label(dry: string, done: string, diff: string): string {
	return (report ? diff : DRY ? dry : done).padEnd(14);
}

export const log = {
	step: (s: string) => console.log(`\n${color.bold(s)}`),
	add: (s: string) => {
		changes++;
		console.log(`  ${label('würde anlegen', 'angelegt', 'fehlt dort')} ${s}`);
	},
	set: (s: string) => {
		changes++;
		console.log(`  ${label('würde setzen', 'gesetzt', 'weicht ab')} ${s}`);
	},
	remove: (s: string) => {
		changes++;
		console.log(`  ${label('würde löschen', 'gelöscht', 'nur dort')} ${s}`);
	},
	keep: (s: string) => console.log(`  ${'unverändert'.padEnd(14)} ${s}`),
	warn: (s: string) => console.log(`  ${color.yellow('!!')}${' '.repeat(13)}${s}`)
};

/**
 * Führt `main` aus, schreibt die Bilanz und bricht bei Fehlern mit Exit-Code 1 ab.
 * `report`: Der Befehl schreibt nie — die Bilanz zählt dann Abweichungen, nicht Änderungen.
 */
export function run(main: () => Promise<void>, options: { report?: boolean } = {}) {
	report = options.report ?? false;
	main()
		.then(() => {
			if (report) return console.log(`\n${changes} Abweichung(en).`);
			console.log(`\n${DRY ? 'Würde' : 'Hat'} ${changes} Änderung(en) ${DRY ? 'vornehmen' : 'vorgenommen'}.`);
			if (DRY) console.log(color.yellow('Dry Run — nichts geschrieben. Ohne --dry erneut ausführen.') + '\n');
		})
		.catch((e) => {
			console.error(`\n${color.red('Abgebrochen:')}`, e?.errors ?? e?.message ?? e);
			process.exit(1);
		});
}
