/** Bewertungen. Der Scope ist bereits über Aufgabe bzw. Profil geprüft, wenn es hier ankommt. */
import { createItem } from '@directus/sdk';
import { getDirectus, type Feedback } from '../directus';
import type { Actor } from '../authz';

export type NewFeedback = {
	type: Feedback['type'];
	ref_id: string | null;
	profile_id: string | null;
	rating: Feedback['rating'];
	comment: string | null;
};

export async function createFeedback(_actor: Actor, data: NewFeedback): Promise<Feedback> {
	return getDirectus().request(createItem('feedback', data));
}
