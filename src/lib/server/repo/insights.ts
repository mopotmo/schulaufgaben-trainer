/**
 * Lernerkenntnisse. Der Inhalt fließt in den System-Prompt der Generierung — deshalb darf
 * hier nichts landen, das nicht aus dem Scope des Actors stammt.
 */
import { readItems, createItem, updateItem } from '@directus/sdk';
import { getDirectus, type LearnerInsight } from '$lib/server/directus';
import { assertCan, assertInScope, type Actor } from '../authz';
import { resolveProfileGroup } from './profiles';

async function find(profileId: string, subject: string, topic: string): Promise<LearnerInsight | null> {
	if (!profileId || !subject || !topic) return null;
	return getDirectus()
		.request(
			readItems('learner_insights', {
				filter: { profile_id: { _eq: profileId }, subject: { _eq: subject }, topic: { _eq: topic } },
				limit: 1
			})
		)
		.then((r) => r[0] ?? null)
		.catch(() => null);
}

export async function getInsight(
	actor: Actor,
	profileId: string,
	subject: string,
	topic: string
): Promise<LearnerInsight | null> {
	assertCan(actor, 'insight:read');
	assertInScope(actor, await resolveProfileGroup(actor, profileId));
	return find(profileId, subject, topic);
}

export type InsightUpdate = {
	strengths: string[];
	weaknesses: string[];
	style_notes: string | null;
	difficulty: 'leichter' | 'passend' | 'schwerer';
};

export async function upsertInsight(
	actor: Actor,
	profileId: string,
	subject: string,
	topic: string,
	update: InsightUpdate
): Promise<void> {
	assertCan(actor, 'insight:read');
	assertInScope(actor, await resolveProfileGroup(actor, profileId));

	const existing = await find(profileId, subject, topic);
	const directus = getDirectus();

	if (existing) {
		await directus.request(
			updateItem('learner_insights', existing.id, { ...update, updated_at: new Date().toISOString() })
		);
	} else {
		await directus.request(
			createItem('learner_insights', { profile_id: profileId, subject, topic, ...update })
		);
	}
}
