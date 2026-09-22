import { error } from '@sveltejs/kit';
import type { Actor } from './authz';

/**
 * Der Actor der laufenden Sitzung. Der Hook garantiert ihn auf allen geschützten Pfaden —
 * diese Funktion macht daraus einen Typ ohne `null`, statt überall `!` zu schreiben.
 */
export function requireActor(locals: App.Locals): Actor {
	if (!locals.actor) error(401, 'Keine gültige Sitzung');
	return locals.actor;
}
