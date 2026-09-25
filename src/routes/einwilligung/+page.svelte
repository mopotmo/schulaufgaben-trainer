<script lang="ts">
	import { enhance } from '$app/forms';
	import { OPERATOR } from '$lib/config';
	import ConsentSummary from '$lib/components/ConsentSummary.svelte';
	import ConsentChecks from '$lib/components/ConsentChecks.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let submitting = $state(false);
</script>

<svelte:head>
	<title>Einwilligung – Schulaufgaben Check</title>
</svelte:head>

<main class="min-h-screen bg-gray-50 px-4 py-10">
	<div class="mx-auto w-full max-w-xl">
		<h1 class="text-2xl font-bold text-gray-800">Einmal kurz bestätigen</h1>
		<p class="mt-2 text-sm text-gray-600">
			Bevor {data.familyName} loslegen kann, brauchen wir die Einwilligung eines Elternteils. Das ist
			einmalig und dauert eine Minute.
		</p>

		<div class="mt-6">
			<ConsentSummary children={data.children} />
		</div>

		<form
			method="POST"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
			class="mt-4 space-y-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
		>
			<ConsentChecks hasChildren={data.children.length > 0} name={form?.name ?? ''} />

			{#if data.email}
				<p class="text-xs text-gray-500">
					Rückfragen, Widerruf und Löschanfragen laufen über deine bestätigte Adresse
					<strong>{data.email}</strong>.
				</p>
			{/if}

			{#if form?.error}
				<p class="text-sm text-red-500">{form.error}</p>
			{/if}

			<button
				type="submit"
				disabled={submitting}
				class="w-full rounded-xl bg-blue-600 py-2.5 font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-blue-300"
			>
				{submitting ? 'Wird gespeichert…' : 'Einwilligen und loslegen'}
			</button>

			<p class="text-xs text-gray-400">
				Du kannst die Einwilligung jederzeit widerrufen — eine formlose Nachricht an
				<a class="text-blue-600 hover:underline" href="mailto:{OPERATOR.email}">{OPERATOR.email}</a>
				genügt. Der Zugang und alle Daten werden dann binnen weniger Tage gelöscht.
			</p>
		</form>
	</div>
</main>
