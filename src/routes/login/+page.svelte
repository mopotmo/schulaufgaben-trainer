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
			<h1 class="text-2xl font-bold text-gray-800">Schulaufgaben Trainer</h1>
			<p class="text-gray-500 text-sm mt-1">Melde dich mit deinem Familien-Login an.</p>
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
				<input type="hidden" name="weiter" value={data.weiter} />

				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1" for="slug">Familienname</label>
					<input
						id="slug"
						name="slug"
						type="text"
						autocomplete="username"
						placeholder="z.B. meier"
						required
						class="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
					/>
				</div>

				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1" for="password">Passwort</label>
					<input
						id="password"
						name="password"
						type="password"
						autocomplete="current-password"
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
					{loading ? 'Wird geprüft…' : 'Anmelden'}
				</button>
			</form>
		</div>
	</div>
</main>
