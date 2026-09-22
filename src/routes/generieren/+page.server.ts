import { requireActor } from '$lib/server/actor';
import { getProfile } from '$lib/server/repo/profiles';
import { listBooks } from '$lib/server/repo/books';
import { listSubjects } from '$lib/server/repo/exercises';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const actor = requireActor(locals);
	const profile = await getProfile(actor, url.searchParams.get('profil'));
	const [books, subjects] = await Promise.all([
		listBooks(actor, ['id', 'title', 'subject', 'grade', 'chapters', 'page_count', 'page_offset']),
		listSubjects(actor, profile.id)
	]);

	return {
		profile,
		books,
		subjects,
		prefill: {
			subject: url.searchParams.get('subject') ?? '',
			topic: url.searchParams.get('topic') ?? ''
		}
	};
};
