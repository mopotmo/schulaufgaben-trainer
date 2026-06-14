import { getDirectus } from '$lib/directus';
import { createItem, readItem } from '@directus/sdk';
import { json, error } from '@sveltejs/kit';
import { logError } from '$lib/logger';
import { saveFeatureRequest } from '$lib/featureRequests';
import { upsertInsight } from '$lib/learnerInsights';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { type, refId, profileId, rating, comment, featureRequest } = body;

	if (!type || !rating) error(400, 'type und rating erforderlich');

	const directus = getDirectus();

	try {
		await directus.request(
			createItem('feedback', {
				type,
				ref_id: refId ?? null,
				profile_id: profileId ?? null,
				rating,
				comment: comment?.trim() || null
			})
		);

		// If comment contains a feature request, save it
		if (featureRequest?.title) {
			await saveFeatureRequest(directus, featureRequest.title, featureRequest.description ?? null, profileId ?? null, 'feedback_comment');
		}

		// Freitext-Kommentar zu Learner Insights destillieren
		if (comment?.trim() && profileId && refId && (type === 'generation' || type === 'correction')) {
			try {
				const exercise = await directus.request(
					readItem(type === 'generation' ? 'exercises' : 'corrections', refId)
				) as any;
				const exerciseId = type === 'generation' ? refId : exercise?.exercise_id;
				if (exerciseId) {
					const ex = await directus.request(readItem('exercises', exerciseId)) as any;
					if (ex?.subject && ex?.topic) {
						const insightInput = `Feedback (${rating === 'positive' ? 'positiv' : 'negativ'}) zu einer Übung über "${ex.topic}":\n${comment.trim()}`;
						upsertInsight(profileId, ex.subject, ex.topic, insightInput).catch(() => {});
					}
				}
			} catch (_) {}
		}
	} catch (e) {
		await logError('api/feedback', e, { type, refId });
		error(502, 'Fehler beim Speichern');
	}

	return json({ ok: true });
};
