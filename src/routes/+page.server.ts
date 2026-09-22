import { fail } from '@sveltejs/kit';
import { listProfiles, createProfile } from '$lib/server/repo/profiles';
import { getOwnGroup } from '$lib/server/repo/groups';
import { requireActor } from '$lib/server/actor';
import { assertCan } from '$lib/server/authz';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const actor = requireActor(locals);
	const [profiles, group] = await Promise.all([listProfiles(actor), getOwnGroup(actor)]);
	return { profiles, family: { name: group.name } };
};

export const actions: Actions = {
	addProfile: async ({ request, locals }) => {
		const actor = requireActor(locals);
		assertCan(actor, 'profile:create');

		const form = await request.formData();
		const name = ((form.get('name') as string) ?? '').trim();
		const school_type = ((form.get('school_type') as string) ?? '').trim();
		const grade = parseInt(form.get('grade') as string);
		const state = ((form.get('state') as string) ?? '').trim();
		const avatar = ((form.get('avatar') as string) ?? '🎓').trim();

		if (!name || !school_type || !grade || !state) {
			return fail(400, { error: 'Bitte alle Felder ausfüllen.' });
		}

		await createProfile(actor, { name, school_type, grade, state, avatar });
	}
};
