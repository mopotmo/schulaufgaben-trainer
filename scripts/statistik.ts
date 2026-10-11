/**
 * Nutzung je Familie in einem Zeitraum — Rangliste, Korrekturquote, Tokens (Backlog: Statistiken).
 *
 * Ergänzt das Insights-Dashboard („Nutzung", `scripts/insights-dashboard.ts`): Directus zeigt
 * eine Gruppierung nach `group_id` nur als UUID, nicht mit Familiennamen. Nur lesend.
 *
 * Bewusst je Familie, nicht je Kind (entschieden 11.10.2026): Zweck ist Betrieb und Kosten,
 * keine Auswertung einzelner Kinder.
 *
 * Zeitraum: `--tage=30` (Standard) oder `--seit=2026-09-01 [--bis=2026-09-30]`, `--bis` inklusive.
 *
 * Ausführen:
 *   npm run statistik
 *   npm run statistik -- --seit=2026-09-01 --bis=2026-09-30
 */
import { createDirectus, rest, staticToken, readItems, aggregate } from '@directus/sdk';
import { flag, target, color } from './lib/cli.ts';

type Schema = {
	exercises: { id: string; group_id: string | null; tokens_used: number | null; created_at: 'datetime' }[];
	corrections: { id: string; group_id: string | null; tokens_used: number | null; created_at: 'datetime' }[];
	groups: { id: string; name: string; type: string }[];
	profiles: { id: string; group_id: string }[];
};

const DAY = 24 * 60 * 60 * 1000;

function period(): { from: Date; to: Date } {
	const seit = flag('seit');
	const bis = flag('bis');
	const parse = (s: string, name: string) => {
		const d = new Date(`${s}T00:00:00`);
		if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime())) {
			console.error(`--${name}= erwartet JJJJ-MM-TT, bekam „${s}".`);
			process.exit(1);
		}
		return d;
	};
	if (seit) {
		const to = bis ? new Date(parse(bis, 'bis').getTime() + DAY) : new Date();
		return { from: parse(seit, 'seit'), to };
	}
	const tage = Number(flag('tage') ?? 30);
	if (!Number.isInteger(tage) || tage < 1) {
		console.error('--tage= erwartet eine ganze Zahl ab 1.');
		process.exit(1);
	}
	const to = new Date();
	return { from: new Date(to.getTime() - tage * DAY), to };
}

const { url, token } = target();
const directus = createDirectus<Schema>(url).with(staticToken(token)).with(rest());

type Row = { group_id: string | null; count: string | number; sum: { tokens_used: string | number | null } };

async function perGroup(collection: 'exercises' | 'corrections', from: Date, to: Date) {
	const rows = (await directus.request(
		aggregate(collection, {
			aggregate: { count: '*', sum: 'tokens_used' },
			groupBy: ['group_id'],
			query: { filter: { created_at: { _gte: from.toISOString(), _lt: to.toISOString() } } }
		})
	)) as unknown as Row[];
	return new Map(
		rows.map((r) => [r.group_id, { count: Number(r.count), tokens: Number(r.sum?.tokens_used ?? 0) }])
	);
}

const fmt = (n: number) => n.toLocaleString('de-DE');
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)} %` : '–');
const day = (d: Date) => d.toLocaleDateString('de-DE');

async function main() {
	const { from, to } = period();
	const [ex, co, groups, profiles] = await Promise.all([
		perGroup('exercises', from, to),
		perGroup('corrections', from, to),
		directus.request(readItems('groups', { fields: ['id', 'name', 'type'], limit: -1 })),
		directus.request(readItems('profiles', { fields: ['id', 'group_id'], limit: -1 }))
	]);

	console.log(color.bold(`\nNutzung ${day(from)} – ${day(new Date(to.getTime() - 1))}`) + `  (${url})\n`);

	const rows = groups
		.filter((g) => g.type === 'family')
		.map((g) => {
			const e = ex.get(g.id) ?? { count: 0, tokens: 0 };
			const c = co.get(g.id) ?? { count: 0, tokens: 0 };
			return {
				name: g.name,
				profiles: profiles.filter((p) => p.group_id === g.id).length,
				exercises: e.count,
				corrections: c.count,
				tokens: e.tokens + c.tokens
			};
		})
		.sort((a, b) => b.exercises + b.corrections - (a.exercises + a.corrections) || a.name.localeCompare(b.name));

	const head = ['#', 'Familie', 'Profile', 'Aufgaben', 'Korrekturen', 'Quote', 'Tokens'];
	const table = rows.map((r, i) => [
		String(i + 1),
		r.name,
		String(r.profiles),
		fmt(r.exercises),
		fmt(r.corrections),
		pct(r.corrections, r.exercises),
		fmt(r.tokens)
	]);
	const total = rows.reduce(
		(s, r) => ({ e: s.e + r.exercises, c: s.c + r.corrections, t: s.t + r.tokens, a: s.a + (r.exercises ? 1 : 0) }),
		{ e: 0, c: 0, t: 0, a: 0 }
	);
	table.push(['', 'Summe', '', fmt(total.e), fmt(total.c), pct(total.c, total.e), fmt(total.t)]);

	const widths = head.map((h, i) => Math.max(h.length, ...table.map((r) => r[i].length)));
	const line = (cells: string[]) =>
		cells.map((c, i) => (i === 1 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ');
	console.log(color.bold(line(head)));
	table.forEach((r, i) => console.log(i === table.length - 1 ? color.bold(line(r)) : line(r)));

	console.log(`\nAktive Familien: ${total.a} von ${rows.length}`);
	console.log('Quote = Korrekturen / Aufgaben im Zeitraum (Korrekturen können ältere Blätter betreffen).');
	console.log('Tokens = Ein- plus Ausgabe von Generierung und Korrektur; Chat, Nachschärfen, Folgefragen');
	console.log('und Buchanalyse sind nicht erfasst. Echte Kosten: Anthropic Console.');

	const missing = (ex.get(null)?.count ?? 0) + (co.get(null)?.count ?? 0);
	if (missing) {
		console.log(color.yellow(`\n!! ${missing} Zeile(n) ohne group_id — scripts/statistik-group-id.ts laufen lassen.`));
	}
}

main().catch((e) => {
	console.error(`\n${color.red('Abgebrochen:')}`, e?.errors ?? e?.message ?? e);
	process.exit(1);
});
