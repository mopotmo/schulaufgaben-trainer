import { error } from '@sveltejs/kit';
import { requireActor } from '$lib/server/actor';
import { getExercise, listExercises } from '$lib/server/repo/exercises';
import { hasInsightsConsent } from '$lib/server/repo/consents';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const actor = requireActor(locals);
	const aufgabeId = url.searchParams.get('aufgabe');
	const profilId = url.searchParams.get('profil');
	// Nur für die Anzeige des Schalters; durchgesetzt wird das Opt-in in `upsertInsight`.
	const insightsEnabled = await hasInsightsConsent(actor.session.groupId);

	if (aufgabeId) {
		const { exercise } = await getExercise(actor, aufgabeId);
		return { exercise, exercises: null, insightsEnabled };
	}

	if (profilId) {
		return { exercise: null, exercises: await listExercises(actor, profilId, 20), insightsEnabled };
	}

	error(400, 'Aufgabe oder Profil angeben');
};
