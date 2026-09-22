// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Actor } from '$lib/server/authz';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** Ersetzt `familyId`. Wird einmal pro Request im Hook gebaut (Spec §5). */
			actor: Actor | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
