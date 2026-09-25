<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let loading = $state(false);

	const inputClass =
		'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300';
</script>

<svelte:head>
	<title>Neues Passwort – Schulaufgaben Check</title>
</svelte:head>

<main class="min-h-screen bg-gray-50 flex items-center justify-center px-4">
	<div class="w-full max-w-sm">
		<div class="text-center mb-8">
			<div class="text-5xl mb-3">🔑</div>
			<h1 class="text-2xl font-bold text-gray-800">Neues Passwort</h1>
		</div>

		{#if data.valid}
			<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
				<p class="mb-4 text-sm text-gray-600">
					Für <strong>{data.familyName}</strong>. Zum Anmelden brauchst du künftig den
					Familiennamen <strong>{data.slug}</strong> und dieses Passwort.
				</p>
				<form
					method="POST"
					use:enhance={() => {
						loading = true;
						return ({ update }) => { loading = false; update(); };
					}}
					class="space-y-4"
				>
					<input type="hidden" name="token" value={data.token} />
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1" for="password">
							Neues Passwort <span class="text-gray-400 font-normal">(mindestens 8 Zeichen)</span>
						</label>
						<input id="password" name="password" type="password" autocomplete="new-password" required minlength="8" class={inputClass} />
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1" for="passwordConfirm">Passwort wiederholen</label>
						<input id="passwordConfirm" name="passwordConfirm" type="password" autocomplete="new-password" required class={inputClass} />
					</div>

					{#if form?.error}
						<p class="text-sm text-red-500">{form.error}</p>
					{/if}

					<button
						type="submit"
						disabled={loading}
						class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-xl transition-colors"
					>
						{loading ? 'Wird gespeichert…' : 'Passwort speichern & anmelden'}
					</button>
				</form>
			</div>
		{:else}
			<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
				<p class="text-sm text-gray-600">Der Link ist abgelaufen oder wurde schon verwendet.</p>
				<a class="mt-4 inline-block text-sm text-blue-600 hover:underline" href="/passwort-vergessen">
					Neuen Link anfordern
				</a>
			</div>
		{/if}
	</div>
</main>
