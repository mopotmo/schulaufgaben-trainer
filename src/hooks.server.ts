import { getSession } from '$lib/session';
import { error, redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';

// `/api/feedback` war hier eingetragen und damit ohne Login erreichbar — siehe
// `src/routes/api/feedback/+server.ts`. Das Widget läuft ausschließlich auf
// `generieren` und `korrigieren`, beide hinter dem Login; die Route braucht das nicht.
const PUBLIC_PATHS = ['/login', '/einrichten', '/logout'];

/** Exakter Treffer oder echter Unterpfad — `startsWith` allein würde auch `/loginxyz` durchlassen. */
function isPublic(path: string): boolean {
	return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;

	const familyId = await getSession(event.cookies);
	event.locals.familyId = familyId ?? null;

	if (!isPublic(path) && !familyId) {
		// API-Routen bekommen einen Status, keinen Redirect auf eine HTML-Seite.
		if (path.startsWith('/api/')) error(401, 'Keine gültige Sitzung');
		redirect(303, `/login?weiter=${encodeURIComponent(path)}`);
	}

	return resolve(event);
};
