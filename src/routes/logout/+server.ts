import { clearSession } from '$lib/session';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	clearSession(cookies);
	redirect(303, '/login');
};
