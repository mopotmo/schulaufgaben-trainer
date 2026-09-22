import { error } from '@sveltejs/kit';
import { requireActor } from '$lib/server/actor';
import { getExercise, listExercises } from '$lib/server/repo/exercises';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const actor = requireActor(locals);
	const aufgabeId = url.searchParams.get('aufgabe');
	const profilId = url.searchParams.get('profil');

	if (aufgabeId) {
		const { exercise } = await getExercise(actor, aufgabeId);
		return { exercise, exercises: null };
	}

	if (profilId) {
		return { exercise: null, exercises: await listExercises(actor, profilId, 20) };
	}

	error(400, 'Aufgabe oder Profil angeben');
};
