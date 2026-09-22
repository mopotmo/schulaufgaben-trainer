import { json, error } from '@sveltejs/kit';
import { logError } from '$lib/server/logger';
import { saveFeatureRequest } from '$lib/server/repo/featureRequests';
import { upsertInsight } from '$lib/server/learnerInsights';
import { requireActor } from '$lib/server/actor';
import { getExercise } from '$lib/server/repo/exercises';
import { getProfile } from '$lib/server/repo/profiles';
import { createFeedback } from '$lib/server/repo/feedback';
import type { Exercise, Profile } from '$lib/server/directus';
import type { RequestHandler } from './$types';

const TYPES = ['generation', 'correction', 'chat'] as const;
const RATINGS = ['positive', 'negative'] as const;

export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await request.json();
	const { type, refId, profileId, rating, comment, featureRequest } = body;

	if (!TYPES.includes(type)) error(400, 'Unbekannter Feedback-Typ');
	if (!RATINGS.includes(rating)) error(400, 'Unbekannte Bewertung');

	const actor = requireActor(locals);

	// Das Widget schickt in beiden Fällen eine Aufgaben-ID (siehe FeedbackWidget.svelte).
	// Profil und Aufgabe werden daraus abgeleitet, nicht aus dem Request übernommen.
	let profile: Profile | null = null;
	let exercise: Exercise | null = null;

	if (refId) {
		({ exercise, profile } = await getExercise(actor, refId));
	} else if (profileId) {
		profile = await getProfile(actor, profileId);
	}

	try {
		await createFeedback(actor, {
			type,
			ref_id: exercise?.id ?? null,
			profile_id: profile?.id ?? null,
			rating,
			comment: comment?.trim() || null
		});

		if (featureRequest?.title) {
			await saveFeatureRequest(
				featureRequest.title,
				featureRequest.description ?? null,
				profile?.id ?? null,
				'feedback_comment'
			);
		}

		// Freitext-Kommentar zu Learner Insights destillieren
		if (comment?.trim() && profile && exercise?.subject && exercise?.topic) {
			const insightInput = `Feedback (${rating === 'positive' ? 'positiv' : 'negativ'}) zu einer Übung über "${exercise.topic}":\n${comment.trim()}`;
			upsertInsight(actor, profile.id, exercise.subject, exercise.topic, insightInput).catch(() => {});
		}
	} catch (e) {
		await logError('api/feedback', e, { type, refId });
		error(502, 'Fehler beim Speichern');
	}

	return json({ ok: true });
};
