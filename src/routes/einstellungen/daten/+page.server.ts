import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { clearSession } from '$lib/session';
import { requireActor } from '$lib/server/actor';
import { assertCan } from '$lib/server/authz';
import { getOwnGroup } from '$lib/server/repo/groups';
import { collectFamilyData, deleteFamily } from '$lib/server/repo/familyData';
import { deleteByGroup, minutes } from '$lib/server/rateLimit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const actor = requireActor(locals);
	// Wie die Einstellungen: nur Eltern. Ein angemeldetes Kind sähe sonst die Daten der
	// Geschwister und käme bis zum Passwortvergleich.
	assertCan(actor, 'group:manage');
	const data = await collectFamilyData(actor);

	return {
		family: data.family,
		consents: data.consents,
		profiles: data.profiles.map((p) => ({
			name: p.name,
			avatar: p.avatar,
			school_type: p.school_type,
			grade: p.grade,
			state: p.state,
			exercises: p.exercises.length,
			corrections: p.exercises.reduce((n, e) => n + e.corrections.length, 0),
			subjects: [...new Set(p.exercises.map((e) => e.subject?.trim()).filter(Boolean))],
			insights: p.learner_insights.map((i) => i.subject),
			feedback: p.feedback.length
		})),
		books: data.books.map((b) => ({ title: b.title, subject: b.subject, grade: b.grade })),
		files: data.files.length
	};
};

export const actions: Actions = {
	deleteFamily: async ({ request, locals, cookies }) => {
		const actor = requireActor(locals);
		// Vor jeder Verarbeitung, insbesondere vor dem Passwortvergleich.
		assertCan(actor, 'group:manage');

		const group = await getOwnGroup(actor);
		const blocked = deleteByGroup.blockedFor(group.id);
		if (blocked) {
			return fail(429, { error: `Zu viele Versuche. Bitte in ${minutes(blocked)} erneut versuchen.` });
		}

		const form = await request.formData();
		const password = ((form.get('password') as string) ?? '').trim();
		if (form.get('confirm') !== 'on') return fail(400, { error: 'Bitte bestätige, dass alles gelöscht werden soll.' });
		if (!password) return fail(400, { error: 'Bitte gib das Familienpasswort ein.' });

		if (!(await bcrypt.compare(password, group.password_hash ?? ''))) {
			deleteByGroup.fail(group.id);
			return fail(401, { error: 'Das Passwort ist falsch.' });
		}

		await deleteFamily(actor);
		deleteByGroup.clear(group.id);
		clearSession(cookies);
		redirect(303, '/login?geloescht');
	}
};
