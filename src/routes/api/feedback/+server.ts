import { getDirectus } from '$lib/directus';
import { createItem } from '@directus/sdk';
import { json, error } from '@sveltejs/kit';
import { logError } from '$lib/logger';
import { saveFeatureRequest } from '$lib/featureRequests';
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
	} catch (e) {
		await logError('api/feedback', e, { type, refId });
		error(502, 'Fehler beim Speichern');
	}

	return json({ ok: true });
};
