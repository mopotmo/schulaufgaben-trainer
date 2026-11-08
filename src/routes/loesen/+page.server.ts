import { error } from '@sveltejs/kit';
import { requireActor } from '$lib/server/actor';
import { getExercise } from '$lib/server/repo/exercises';
import { hasCorrection, canResubmit } from '$lib/server/repo/corrections';
import { hasInsightsConsent } from '$lib/server/repo/consents';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const actor = requireActor(locals);
	const { exercise, profile } = await getExercise(actor, url.searchParams.get('aufgabe'));

	// Nachbessern nur bei fremden Aufgaben und „Nur Hinweise" (Konzept fremde Aufgaben §4.4).
	const resubmit = canResubmit(exercise, profile);
	if (!resubmit && (await hasCorrection(actor, exercise.id))) {
		error(400, 'Diese Übung wurde bereits korrigiert');
	}

	return {
		exercise: {
			id: exercise.id,
			subject: exercise.subject ?? '',
			topic: exercise.topic ?? '',
			content: exercise.generated_content ?? ''
		},
		profile,
		canResubmit: resubmit,
		// Nur dann den Schalter „Für Lernerkenntnisse nutzen" zeigen. Durchgesetzt wird das
		// Opt-in serverseitig in `upsertInsight`, nicht hier.
		insightsEnabled: await hasInsightsConsent(profile.group_id)
	};
};
