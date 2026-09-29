import { json, error } from '@sveltejs/kit';
import { logError } from '$lib/server/logger';
import { upsertInsight } from '$lib/server/learnerInsights';
import { requireActor } from '$lib/server/actor';
import { getExercise } from '$lib/server/repo/exercises';
import { getProfile } from '$lib/server/repo/profiles';
import { addFeedbackComment, COMMENT_MAX_LENGTH, createFeedback } from '$lib/server/repo/feedback';
import type { Exercise, Profile } from '$lib/server/directus';
import type { RequestHandler } from './$types';

const TYPES = ['generation', 'correction', 'chat'] as const;
const RATINGS = ['positive', 'negative'] as const;

/** Daumen — wird sofort gespeichert, der Kommentar kommt ggf. per PATCH nach. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const { type, refId, profileId, rating } = await request.json();

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
		const feedback = await createFeedback(actor, {
			type,
			ref_id: exercise?.id ?? null,
			profile_id: profile?.id ?? null,
			rating
		});
		return json({ id: feedback.id });
	} catch (e) {
		await logError('api/feedback', e, { type, refId });
		error(502, 'Fehler beim Speichern');
	}
};

/** Kommentar zu einem gerade abgegebenen Daumen. */
export const PATCH: RequestHandler = async ({ request, locals }) => {
	const { id, comment } = await request.json();

	const text = typeof comment === 'string' ? comment.trim() : '';
	if (!text) error(400, 'Kommentar fehlt');
	if (text.length > COMMENT_MAX_LENGTH) error(400, 'Kommentar ist zu lang');

	const actor = requireActor(locals);
	const { feedback, profile } = await addFeedbackComment(actor, id, text);

	// Freitext-Kommentar zu Learner Insights destillieren (upsertInsight prüft das Opt-in).
	if (feedback.ref_id) {
		const { exercise } = await getExercise(actor, feedback.ref_id).catch(() => ({ exercise: null }));
		if (exercise?.subject && exercise?.topic) {
			const insightInput = `Feedback (${feedback.rating === 'positive' ? 'positiv' : 'negativ'}) zu einer Übung über "${exercise.topic}":\n${text}`;
			upsertInsight(actor, profile.id, exercise.subject, exercise.topic, insightInput).catch(() => {});
		}
	}

	return json({ ok: true });
};
