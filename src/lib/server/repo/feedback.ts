/** Bewertungen. Beim Anlegen ist der Scope bereits über Aufgabe bzw. Profil geprüft. */
import { createItem, readItem, updateItem } from '@directus/sdk';
import { error } from '@sveltejs/kit';
import { getDirectus, type Feedback, type Profile } from '../directus';
import type { Actor } from '../authz';
import { getProfile, requireUuid } from './profiles';

export type NewFeedback = {
	type: Feedback['type'];
	ref_id: string | null;
	profile_id: string | null;
	rating: Feedback['rating'];
};

/** Wie lange nach dem Daumen ein Kommentar nachgereicht werden kann. */
const COMMENT_WINDOW_MS = 60 * 60 * 1000;

export const COMMENT_MAX_LENGTH = 1000;

export async function createFeedback(_actor: Actor, data: NewFeedback): Promise<Feedback> {
	return getDirectus().request(createItem('feedback', { ...data, comment: null }));
}

/**
 * Kommentar zu einem gerade abgegebenen Daumen nachreichen. Nur für die eigene, frische Zeile
 * ohne Kommentar — eine Zeile ohne Profil (anonym oder nach `FEEDBACK_LINK_DAYS` geleert)
 * lässt sich keinem Actor zuordnen und ist damit gesperrt.
 */
export async function addFeedbackComment(
	actor: Actor,
	feedbackId: unknown,
	comment: string
): Promise<{ feedback: Feedback; profile: Profile }> {
	const id = requireUuid(feedbackId, 'Feedback-ID');

	const feedback = await getDirectus()
		.request(readItem('feedback', id))
		.catch(() => null);
	if (!feedback?.profile_id) error(404, 'Feedback nicht gefunden');

	// Prüft Gruppe und — bei angemeldetem Kind — das eigene Profil.
	const profile = await getProfile(actor, feedback.profile_id);

	if (feedback.comment) error(409, 'Kommentar bereits gespeichert');
	if (Date.now() - new Date(feedback.created_at).getTime() > COMMENT_WINDOW_MS) {
		error(409, 'Feedback ist zu alt für einen Kommentar');
	}

	const updated = await getDirectus().request(updateItem('feedback', id, { comment }));
	return { feedback: updated, profile };
}
