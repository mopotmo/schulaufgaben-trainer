import { json } from '@sveltejs/kit';
import { requireActor } from '$lib/server/actor';
import { getExercise } from '$lib/server/repo/exercises';
import type { RequestHandler } from './$types';

/**
 * Gibt es diese Aufgabe noch — und darf die Sitzung sie sehen?
 *
 * Nur für den Merkzettel „Letzte Aufgabe weitermachen" auf der Startseite. Der steht im
 * localStorage des Browsers und weiß nichts davon, wenn die Aufgabe in der Historie
 * gelöscht oder ersetzt wurde. Ohne diese Prüfung bleibt die Karte stehen und führt auf
 * eine 404-Seite.
 *
 * Antwortet bewusst auch dann mit `exists: false`, wenn die Aufgabe existiert, aber außerhalb
 * des Scopes liegt (harte Regel 2) — sonst wäre das ein Orakel, mit dem sich fremde
 * Aufgaben-IDs erraten ließen. Für den Aufrufer ist beides derselbe Fall: Karte weg.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const actor = requireActor(locals);

	const exists = await getExercise(actor, url.searchParams.get('id')).then(
		() => true,
		() => false
	);

	return json({ exists });
};
