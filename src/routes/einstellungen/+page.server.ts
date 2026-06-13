import { getDirectus } from '$lib/directus';
import { readItem, updateItem } from '@directus/sdk';
import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const directus = getDirectus();
	const family = await directus.request(readItem('families', locals.familyId!));
	return { familyName: family.name, slug: family.slug };
};

export const actions: Actions = {
	changePassword: async ({ request, locals }) => {
		const form = await request.formData();
		const current = (form.get('current') as string ?? '').trim();
		const next = (form.get('next') as string ?? '').trim();
		const confirm = (form.get('confirm') as string ?? '').trim();

		if (!current || !next || !confirm) return fail(400, { error: 'Bitte alle Felder ausfüllen.' });
		if (next.length < 8) return fail(400, { error: 'Das neue Passwort muss mindestens 8 Zeichen lang sein.' });
		if (next !== confirm) return fail(400, { error: 'Die neuen Passwörter stimmen nicht überein.' });

		const directus = getDirectus();
		const family = await directus.request(readItem('families', locals.familyId!));

		const valid = await bcrypt.compare(current, family.password_hash ?? '');
		if (!valid) return fail(401, { error: 'Das aktuelle Passwort ist falsch.' });

		const hash = await bcrypt.hash(next, 12);
		await directus.request(updateItem('families', locals.familyId!, { password_hash: hash }));

		return { success: true };
	}
};
