<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let loading = $state(false);
</script>

<main class="min-h-screen bg-gray-50 flex items-center justify-center px-4">
	<div class="w-full max-w-sm">
		<div class="text-center mb-8">
			<div class="text-5xl mb-3">🎓</div>
			{#if data.isReset}
				<h1 class="text-2xl font-bold text-gray-800">Neues Passwort setzen</h1>
				<p class="text-gray-500 text-sm mt-1">Für <strong>{data.familyName}</strong></p>
			{:else}
				<h1 class="text-2xl font-bold text-gray-800">Willkommen!</h1>
				<p class="text-gray-600 mt-1">Hallo, <strong>{data.familyName}</strong>.</p>
				<p class="text-gray-500 text-sm mt-1">Vergib jetzt ein Passwort für deinen Familien-Account.</p>
			{/if}
		</div>

		<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
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
						{data.isReset ? 'Neues Passwort' : 'Passwort'}
						<span class="text-gray-400 font-normal">(mindestens 8 Zeichen)</span>
					</label>
					<input
						id="password"
						name="password"
						type="password"
						autocomplete="new-password"
						required
						minlength="8"
						class="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
					/>
				</div>

				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1" for="passwordConfirm">
						Passwort wiederholen
					</label>
					<input
						id="passwordConfirm"
						name="passwordConfirm"
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
					{#if loading}
						Wird gespeichert…
					{:else if data.isReset}
						Passwort ändern & einloggen
					{:else}
						Passwort setzen & loslegen
					{/if}
				</button>
			</form>
		</div>
	</div>
</main>
