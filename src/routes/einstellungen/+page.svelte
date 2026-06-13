<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let loading = $state(false);
</script>

<main class="max-w-2xl mx-auto px-4 py-10">
	<a href="/" class="text-sm text-blue-500 hover:underline mb-6 inline-block">← Startseite</a>

	<h1 class="text-3xl font-bold text-gray-800 mb-1">Einstellungen</h1>
	<p class="text-gray-500 mb-8">
		Familie <strong>{data.familyName}</strong> <span class="text-gray-400 text-sm">(Login: {data.slug})</span>
	</p>

	<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 max-w-md">
		<h2 class="text-lg font-semibold text-gray-800 mb-4">Passwort ändern</h2>

		{#if form?.success}
			<div class="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 mb-4">
				Passwort erfolgreich geändert.
			</div>
		{/if}

		<form
			method="POST"
			action="?/changePassword"
			use:enhance={() => {
				loading = true;
				return ({ update }) => { loading = false; update(); };
			}}
			class="space-y-4"
		>
			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1" for="current">
					Aktuelles Passwort
				</label>
				<input
					id="current"
					name="current"
					type="password"
					autocomplete="current-password"
					required
					class="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
				/>
			</div>

			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1" for="next">
					Neues Passwort <span class="text-gray-400 font-normal">(mindestens 8 Zeichen)</span>
				</label>
				<input
					id="next"
					name="next"
					type="password"
					autocomplete="new-password"
					required
					minlength="8"
					class="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
				/>
			</div>

			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1" for="confirm">
					Neues Passwort wiederholen
				</label>
				<input
					id="confirm"
					name="confirm"
					type="password"
					autocomplete="new-password"
					required
					class="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
				/>
			</div>

			{#if form?.error}
				<p class="text-sm text-red-500">{form.error}</p>
			{/if}

			<button
				type="submit"
				disabled={loading}
				class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-xl transition-colors"
			>
				{loading ? 'Wird gespeichert…' : 'Passwort ändern'}
			</button>
		</form>
	</div>
</main>
