import { fail } from '@sveltejs/kit';
import { requireActor } from '$lib/server/actor';
import { getProfile } from '$lib/server/repo/profiles';
import { listSubjects, updateExternalExercise } from '$lib/server/repo/exercises';
import type { PageServerLoad, Actions } from './$types';

/**
 * Fremde Aufgabe korrigieren lassen (Konzept fremde Aufgaben §4). Erfassen läuft über
 * `/api/aufgabe-erfassen`, die Seite selbst lädt nur das Profil und speichert die Prüfansicht.
 */
export const load: PageServerLoad = async ({ url, locals }) => {
	const actor = requireActor(locals);
	const profile = await getProfile(actor, url.searchParams.get('profil'));
	return {
		profile: { id: profile.id, name: profile.name, avatar: profile.avatar },
		subjects: await listSubjects(actor, profile.id)
	};
};

export const actions: Actions = {
	/** Prüfansicht speichern. Die Aufgaben-ID prüft `updateExternalExercise` gegen den Scope. */
	speichern: async ({ request, locals }) => {
		const actor = requireActor(locals);
		const form = await request.formData();
		const content = ((form.get('content') as string | null) ?? '').trim();
		const subject = ((form.get('subject') as string | null) ?? '').trim().replace(/\s+/g, ' ');
		const topic = ((form.get('topic') as string | null) ?? '').trim();
		const taskKind = form.get('taskKind');

		if (!content || !subject || !topic) return fail(400, { error: 'Bitte Aufgabe, Fach und Thema ausfüllen.' });
		if (taskKind !== 'structured' && taskKind !== 'free_text') return fail(400, { error: 'Ungültiger Aufgabentyp.' });

		await updateExternalExercise(actor, form.get('exerciseId'), {
			generated_content: content,
			subject: subject.slice(0, 100),
			topic: topic.slice(0, 200),
			task_kind: taskKind
		});
		return { saved: true };
	}
};
