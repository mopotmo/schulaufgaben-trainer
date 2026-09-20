import { getDirectus, type Exercise, type Profile } from '$lib/directus';
import { createItem } from '@directus/sdk';
import { json, error } from '@sveltejs/kit';
import { logError } from '$lib/logger';
import { saveFeatureRequest } from '$lib/featureRequests';
import { upsertInsight } from '$lib/learnerInsights';
import { requireFamilyId, assertProfileInFamily, assertExerciseInFamily } from '$lib/server/scope';
import type { RequestHandler } from './$types';

const TYPES = ['generation', 'correction', 'chat'] as const;
const RATINGS = ['positive', 'negative'] as const;

export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await request.json();
	const { type, refId, profileId, rating, comment, featureRequest } = body;

	if (!TYPES.includes(type)) error(400, 'Unbekannter Feedback-Typ');
	if (!RATINGS.includes(rating)) error(400, 'Unbekannte Bewertung');

	// Bis zum Hotfix war diese Route öffentlich und nahm profileId und refId ungeprüft entgegen.
	// Damit ließ sich ohne Login in `feedback` schreiben und über upsertInsight der Lernstand
	// eines beliebigen Kindes überschreiben — der später in den Generierungs-Prompt einfließt.
	const familyId = requireFamilyId(locals);

	// Der Widget schickt in beiden Fällen eine Aufgaben-ID (siehe FeedbackWidget.svelte).
	// Profil und Aufgabe werden daraus abgeleitet, nicht aus dem Request übernommen.
	let profile: Profile | null = null;
	let exercise: Exercise | null = null;

	if (refId) {
		({ exercise, profile } = await assertExerciseInFamily(refId, familyId));
	} else if (profileId) {
		profile = await assertProfileInFamily(profileId, familyId);
	}

	const directus = getDirectus();

	try {
		await directus.request(
			createItem('feedback', {
				type,
				ref_id: exercise?.id ?? null,
				profile_id: profile?.id ?? null,
				rating,
				comment: comment?.trim() || null
			})
		);

		// If comment contains a feature request, save it
		if (featureRequest?.title) {
			await saveFeatureRequest(
				directus,
				featureRequest.title,
				featureRequest.description ?? null,
				profile?.id ?? null,
				'feedback_comment'
			);
		}

		// Freitext-Kommentar zu Learner Insights destillieren
		if (comment?.trim() && profile && exercise?.subject && exercise?.topic) {
			const insightInput = `Feedback (${rating === 'positive' ? 'positiv' : 'negativ'}) zu einer Übung über "${exercise.topic}":\n${comment.trim()}`;
			upsertInsight(profile.id, exercise.subject, exercise.topic, insightInput).catch(() => {});
		}
	} catch (e) {
		await logError('api/feedback', e, { type, refId });
		error(502, 'Fehler beim Speichern');
	}

	return json({ ok: true });
};
