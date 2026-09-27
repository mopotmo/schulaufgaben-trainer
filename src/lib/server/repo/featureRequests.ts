import { getDirectus } from '$lib/server/directus';
import { readItems, createItem, updateItem } from '@directus/sdk';

export async function saveFeatureRequest(
	title: string,
	description: string | null,
	profileId: string | null,
	source: 'chat_auto' | 'feedback_comment'
) {
	const directus = getDirectus();
	const titleLower = title.toLowerCase().trim();
	const existing = await directus.request(
		readItems('feature_requests', { limit: 100, fields: ['id', 'title', 'count', 'profile_ids'] })
	);

	const match = existing.find((fr) => {
		const frTitle = fr.title.toLowerCase();
		return frTitle.includes(titleLower) || titleLower.includes(frTitle) || wordOverlap(titleLower, frTitle) >= 3;
	});

	if (match) {
		const updatedProfiles = Array.from(new Set([...(match.profile_ids ?? []), ...(profileId ? [profileId] : [])]));
		await directus.request(
			updateItem('feature_requests', match.id, {
				count: (match.count ?? 1) + 1,
				profile_ids: updatedProfiles
			})
		);
	} else {
		await directus.request(
			createItem('feature_requests', {
				title: title.trim(),
				description,
				count: 1,
				profile_ids: profileId ? [profileId] : [],
				source
			})
		);
	}
}

/**
 * Beim Löschen eines Profils: seine ID aus allen Wunschlisten nehmen. `profile_ids` ist JSON,
 * dafür gibt es keine Relation und damit keine Kaskade. `count` bleibt — er zählt Wünsche,
 * nicht Personen. Die ID ist vom Aufrufer bereits gegen den Scope geprüft.
 */
export async function forgetProfileInFeatureRequests(profileId: string): Promise<void> {
	const directus = getDirectus();
	const all = await directus.request(
		readItems('feature_requests', { limit: -1, fields: ['id', 'profile_ids'] })
	);
	for (const fr of all) {
		if (!fr.profile_ids?.includes(profileId)) continue;
		await directus.request(
			updateItem('feature_requests', fr.id, {
				profile_ids: fr.profile_ids.filter((id) => id !== profileId)
			})
		);
	}
}

function wordOverlap(a: string, b: string): number {
	const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > 3));
	return [...wordsA].filter((w) => b.includes(w)).length;
}
