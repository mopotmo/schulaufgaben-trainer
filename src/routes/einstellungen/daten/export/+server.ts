import { requireActor } from '$lib/server/actor';
import { collectFamilyData } from '$lib/server/repo/familyData';
import type { RequestHandler } from './$types';

/** Alle Daten der Familie als JSON-Datei — Auskunft (Art. 15) und Übertragbarkeit (Art. 20). */
export const GET: RequestHandler = async ({ locals }) => {
	const actor = requireActor(locals);
	const data = await collectFamilyData(actor);
	const date = new Date().toISOString().slice(0, 10);

	return new Response(
		JSON.stringify({ exported_at: new Date().toISOString(), ...data }, null, 2),
		{
			headers: {
				'Content-Type': 'application/json; charset=utf-8',
				'Content-Disposition': `attachment; filename="schulaufgaben-check-daten-${date}.json"`,
				'Cache-Control': 'no-store'
			}
		}
	);
};
