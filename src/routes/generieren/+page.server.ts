import { getDirectus } from '$lib/directus';
import { readItems } from '@directus/sdk';
import { requireFamilyId, assertProfileInFamily } from '$lib/server/scope';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const familyId = requireFamilyId(locals);
	const profile = await assertProfileInFamily(url.searchParams.get('profil'), familyId);

	const books = await getDirectus().request(
		readItems('books', {
			filter: {
				_or: [{ owner_family: { _eq: familyId } }, { visibility: { _eq: 'shared' } }]
			},
			fields: ['id', 'title', 'subject', 'grade', 'chapters', 'page_count', 'page_offset'],
			sort: ['subject', 'grade', 'title']
		})
	);

	return {
		profile,
		books,
		prefill: {
			subject: url.searchParams.get('subject') ?? '',
			topic: url.searchParams.get('topic') ?? ''
		}
	};
};
