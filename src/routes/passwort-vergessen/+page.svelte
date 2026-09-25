<script lang="ts">
	import { enhance } from '$app/forms';
	import { OPERATOR } from '$lib/config';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let loading = $state(false);
</script>

<svelte:head>
	<title>Passwort vergessen – Schulaufgaben Check</title>
</svelte:head>

<main class="min-h-screen bg-gray-50 flex items-center justify-center px-4">
	<div class="w-full max-w-sm">
		<div class="text-center mb-8">
			<div class="text-5xl mb-3">🔑</div>
			<h1 class="text-2xl font-bold text-gray-800">Passwort vergessen</h1>
		</div>

		<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
			{#if form?.sent}
				<p class="text-sm text-gray-700">
					Wenn zu <strong>{form.email}</strong> ein Familienzugang gehört, ist jetzt eine Mail mit
					einem Link unterwegs. Er gilt eine Stunde.
				</p>
				<p class="mt-3 text-xs text-gray-400">
					Nichts angekommen? Schau im Spam-Ordner nach oder schreib an
					<a class="text-blue-600 hover:underline" href="mailto:{OPERATOR.email}">{OPERATOR.email}</a>.
				</p>
			{:else}
				<form
					method="POST"
					use:enhance={() => {
						loading = true;
						return ({ update }) => { loading = false; update(); };
					}}
					class="space-y-4"
				>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1" for="email">
							Deine E-Mail-Adresse
						</label>
						<input
							id="email" name="email" type="email" autocomplete="email" required
							class="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
						/>
						<p class="mt-1 text-xs text-gray-400">Die Adresse, die du beim Einrichten bestätigt hast.</p>
					</div>

					{#if form?.error}
						<p class="text-sm text-red-500">{form.error}</p>
					{/if}

					<button
						type="submit"
						disabled={loading}
						class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-xl transition-colors"
					>
						{loading ? 'Wird gesendet…' : 'Link schicken'}
					</button>
				</form>
			{/if}
		</div>

		<p class="mt-6 text-center text-sm">
			<a class="text-blue-600 hover:underline" href="/login">Zurück zur Anmeldung</a>
		</p>
	</div>
</main>
