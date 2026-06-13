import { getSession } from '$lib/session';
import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';

const PUBLIC_PATHS = ['/login', '/einrichten', '/api/feedback'];

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

	const familyId = await getSession(event.cookies);
	event.locals.familyId = familyId ?? null;

	if (!isPublic && !familyId) {
		redirect(303, `/login?weiter=${encodeURIComponent(path)}`);
	}

	return resolve(event);
};
