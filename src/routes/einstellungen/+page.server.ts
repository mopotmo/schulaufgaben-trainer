import { fail } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { requireActor } from '$lib/server/actor';
import { assertCan } from '$lib/server/authz';
import { getOwnGroup, changePassword } from '$lib/server/repo/groups';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const actor = requireActor(locals);
	// Passwortverwaltung ist Elternsache. Ohne diese Prüfung sähe ein angemeldetes Kind
	// das Formular und käme bis zum bcrypt-Vergleich — ein Orakel fürs Familienpasswort.
	assertCan(actor, 'group:manage');

	const group = await getOwnGroup(actor);
	return { familyName: group.name, slug: group.slug };
};

export const actions: Actions = {
	changePassword: async ({ request, locals }) => {
		const actor = requireActor(locals);
		// Vor jeder Verarbeitung, insbesondere vor dem Passwortvergleich.
		assertCan(actor, 'group:manage');

		const form = await request.formData();
		const current = ((form.get('current') as string) ?? '').trim();
		const next = ((form.get('next') as string) ?? '').trim();
		const confirm = ((form.get('confirm') as string) ?? '').trim();

		if (!current || !next || !confirm) return fail(400, { error: 'Bitte alle Felder ausfüllen.' });
		if (next.length < 8) return fail(400, { error: 'Das neue Passwort muss mindestens 8 Zeichen lang sein.' });
		if (next !== confirm) return fail(400, { error: 'Die neuen Passwörter stimmen nicht überein.' });

		const group = await getOwnGroup(actor);
		if (!(await bcrypt.compare(current, group.password_hash ?? ''))) {
			return fail(401, { error: 'Das aktuelle Passwort ist falsch.' });
		}

		await changePassword(actor, await bcrypt.hash(next, 12));
		return { success: true };
	}
};
