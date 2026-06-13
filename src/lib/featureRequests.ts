import { getDirectus } from './directus';
import { readItems, createItem, updateItem } from '@directus/sdk';

export async function saveFeatureRequest(
	directus: ReturnType<typeof getDirectus>,
	title: string,
	description: string | null,
	profileId: string | null,
	source: 'chat_auto' | 'feedback_comment'
) {
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

function wordOverlap(a: string, b: string): number {
	const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > 3));
	return [...wordsA].filter((w) => b.includes(w)).length;
}
