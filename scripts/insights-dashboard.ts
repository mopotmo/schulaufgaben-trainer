/**
 * Insights-Dashboard „Nutzung" in Directus anlegen bzw. angleichen (Backlog: Statistiken).
 *
 * Dashboards und Panels stehen nicht im Snapshot — deshalb dieses Skript. Es ist die Quelle:
 * Panels, die hier stehen, werden angelegt oder auf diesen Stand gebracht; Panels, die nur in
 * Directus stehen, meldet es und lässt sie stehen.
 *
 * Nur aggregiert, keine Werte einzelner Kinder. Die Rangliste je Familie zeigt Directus nicht
 * mit Namen (das Panel kennt nur die UUID) — dafür `scripts/statistik.ts`.
 *
 * Braucht `exercises.group_id` und `corrections.group_id` (Snapshot, `statistik-group-id.ts`).
 *
 * Ausführen:
 *   node --experimental-strip-types --env-file=.env scripts/insights-dashboard.ts --dry
 *
 * Gegen die lokale Probeumgebung:
 *   node --experimental-strip-types --env-file=.env scripts/insights-dashboard.ts \
 *     --url=http://localhost:8055 --dry
 */
import {
	createDirectus,
	rest,
	staticToken,
	readDashboards,
	createDashboard,
	readPanels,
	createPanel,
	updatePanel
} from '@directus/sdk';
import { DRY, target, log, run } from './lib/cli.ts';

const DASHBOARD = { name: 'Nutzung', icon: 'monitoring', note: 'Erzeugt von scripts/insights-dashboard.ts — Änderungen dort, nicht hier.' };

const LAST_30_DAYS = { created_at: { _gte: '$NOW(-30 days)' } };

type Panel = {
	name: string;
	icon: string;
	type: string;
	note?: string;
	position_x: number;
	position_y: number;
	width: number;
	height: number;
	options: Record<string, unknown>;
};

/** Wochenverlauf über den ganzen Bestand. */
const weekly = (collection: string, fn: string, valueField: string, filter?: object) => ({
	collection,
	function: fn,
	valueField,
	dateField: 'created_at',
	precision: 'week',
	range: 'auto',
	missingData: 'zero',
	decimals: 0,
	...(filter ? { filter } : {})
});

const PANELS: Panel[] = [
	// ---------------------------------------------------------- Kennzahlen, 30 Tage
	{
		name: 'Aufgaben (30 Tage)',
		icon: 'description',
		type: 'metric',
		position_x: 1, position_y: 1, width: 8, height: 5,
		options: { collection: 'exercises', field: 'id', function: 'count', filter: LAST_30_DAYS }
	},
	{
		name: 'Korrekturen (30 Tage)',
		icon: 'fact_check',
		type: 'metric',
		note: 'Ins Verhältnis zu den Aufgaben gesetzt ergibt das die Korrekturquote.',
		position_x: 9, position_y: 1, width: 8, height: 5,
		options: { collection: 'corrections', field: 'id', function: 'count', filter: LAST_30_DAYS }
	},
	{
		name: 'Aktive Familien (30 Tage)',
		icon: 'groups',
		type: 'metric',
		note: 'Familien mit mindestens einer erstellten Aufgabe.',
		position_x: 17, position_y: 1, width: 8, height: 5,
		options: { collection: 'exercises', field: 'group_id', function: 'countDistinct', filter: LAST_30_DAYS }
	},

	// ---------------------------------------------------------- Wochenverläufe
	{
		name: 'Aufgaben pro Woche',
		icon: 'description',
		type: 'time-series',
		position_x: 1, position_y: 6, width: 12, height: 10,
		options: weekly('exercises', 'count', 'id')
	},
	{
		name: 'Korrekturen pro Woche',
		icon: 'fact_check',
		type: 'time-series',
		position_x: 13, position_y: 6, width: 12, height: 10,
		options: weekly('corrections', 'count', 'id')
	},
	{
		name: 'Aktive Familien pro Woche',
		icon: 'groups',
		type: 'time-series',
		position_x: 1, position_y: 16, width: 24, height: 8,
		options: weekly('exercises', 'countDistinct', 'group_id')
	},
	{
		name: 'Tokens pro Woche — Aufgaben',
		icon: 'toll',
		type: 'time-series',
		note: 'Ein- plus Ausgabe-Tokens der Generierung. Echte Kosten: Anthropic Console.',
		position_x: 1, position_y: 24, width: 12, height: 10,
		options: weekly('exercises', 'sum', 'tokens_used')
	},
	{
		name: 'Tokens pro Woche — Korrekturen',
		icon: 'toll',
		type: 'time-series',
		note: 'Ein- plus Ausgabe-Tokens der Korrektur. Echte Kosten: Anthropic Console.',
		position_x: 13, position_y: 24, width: 12, height: 10,
		options: weekly('corrections', 'sum', 'tokens_used')
	},

	// ---------------------------------------------------------- Inhalte und Rückmeldungen
	{
		name: 'Fächer (30 Tage)',
		icon: 'school',
		type: 'metric-list',
		note: 'Fach ist Freitext — „Mathe" und „Mathematik" stehen getrennt.',
		position_x: 1, position_y: 34, width: 12, height: 10,
		options: {
			collection: 'exercises',
			groupByField: 'subject',
			aggregateField: 'id',
			aggregateFunction: 'count',
			sortDirection: 'desc',
			limit: 10,
			filter: LAST_30_DAYS
		}
	},
	{
		name: 'Rückmeldungen (30 Tage)',
		icon: 'thumbs_up_down',
		type: 'metric-list',
		position_x: 13, position_y: 34, width: 12, height: 10,
		options: {
			collection: 'feedback',
			groupByField: 'rating',
			aggregateField: 'id',
			aggregateFunction: 'count',
			sortDirection: 'desc',
			limit: 5,
			filter: LAST_30_DAYS
		}
	},
	{
		name: 'Kommentare (30 Tage)',
		icon: 'chat',
		type: 'list',
		position_x: 1, position_y: 44, width: 24, height: 10,
		options: {
			collection: 'feedback',
			sortField: 'created_at',
			sortDirection: 'desc',
			limit: 20,
			displayTemplate: '{{rating}} · {{type}} — {{comment}}',
			linkToItem: true,
			filter: { _and: [LAST_30_DAYS, { comment: { _nempty: true } }] }
		}
	},

	// ---------------------------------------------------------- Betrieb
	{
		name: 'Fehler pro Tag',
		icon: 'error',
		type: 'time-series',
		note: 'Einträge mit Level „error" in `logs`. Logs werden nach 30 Tagen gelöscht.',
		position_x: 1, position_y: 54, width: 24, height: 8,
		options: {
			collection: 'logs',
			function: 'count',
			valueField: 'id',
			dateField: 'created_at',
			precision: 'day',
			range: '1 month',
			missingData: 'zero',
			decimals: 0,
			filter: { level: { _eq: 'error' } }
		}
	},
	{
		name: 'Hinweise',
		icon: 'info',
		type: 'label',
		position_x: 1, position_y: 62, width: 24, height: 6,
		options: {
			text:
				'Rangliste je Familie und Korrekturquote: npm run statistik (Zeitraum mit --tage= oder --seit=/--bis=). ' +
				'Tokens decken nur Generierung und Korrektur ab — Chat, Nachschärfen, Folgefragen und Buchanalyse fehlen. ' +
				'Die tatsächlichen Kosten stehen in der Anthropic Console.',
			whiteSpace: 'normal'
		}
	}
];

const { url, token } = target();
const directus = createDirectus(url).with(staticToken(token)).with(rest());

console.log(`Directus: ${url}${DRY ? '\n\x1b[33mDry Run\x1b[0m' : ''}`);

/** Gleich, wenn alle hier gepflegten Schlüssel übereinstimmen. */
function differs(want: Panel, have: Record<string, unknown>): boolean {
	return (Object.keys(want) as (keyof Panel)[]).some(
		(k) => JSON.stringify(want[k] ?? null) !== JSON.stringify(have[k] ?? null)
	);
}

run(async () => {
	log.step(`1. Dashboard „${DASHBOARD.name}"`);
	const existing = await directus.request(
		readDashboards({ filter: { name: { _eq: DASHBOARD.name } }, fields: ['id'], limit: 2 })
	);
	if (existing.length > 1) throw new Error(`Mehrere Dashboards „${DASHBOARD.name}" — erst von Hand bereinigen.`);

	let dashboardId = existing[0]?.id as string | undefined;
	if (dashboardId) {
		log.keep(dashboardId);
	} else {
		log.add(DASHBOARD.name);
		if (!DRY) dashboardId = (await directus.request(createDashboard(DASHBOARD))).id as string;
	}

	log.step('2. Panels');
	const have = dashboardId
		? ((await directus.request(
				readPanels({ filter: { dashboard: { _eq: dashboardId } }, limit: -1 })
			)) as Record<string, unknown>[])
		: [];

	for (const want of PANELS) {
		const match = have.find((p) => p.name === want.name);
		const data = { ...want, note: want.note ?? null, show_header: true, color: null };
		if (!match) {
			log.add(want.name);
			if (!DRY) await directus.request(createPanel({ ...data, dashboard: dashboardId }));
		} else if (differs(want, match) || (match.note ?? null) !== data.note) {
			log.set(want.name);
			if (!DRY) await directus.request(updatePanel(match.id as string, data));
		} else {
			log.keep(want.name);
		}
	}

	for (const extra of have.filter((p) => !PANELS.some((w) => w.name === p.name))) {
		log.warn(`„${extra.name}" steht nur in Directus — bleibt stehen`);
	}
});
