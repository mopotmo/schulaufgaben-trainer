import { error } from '@sveltejs/kit';
import { requireActor } from '$lib/server/actor';
import { getExercise } from '$lib/server/repo/exercises';
import { hasCorrection } from '$lib/server/repo/corrections';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const actor = requireActor(locals);
	const { exercise, profile } = await getExercise(actor, url.searchParams.get('aufgabe'));

	if (await hasCorrection(actor, exercise.id)) {
		error(400, 'Diese Übung wurde bereits korrigiert');
	}

	return {
		exercise: {
			id: exercise.id,
			subject: exercise.subject ?? '',
			topic: exercise.topic ?? '',
			content: exercise.generated_content ?? ''
		},
		profile
	};
};
