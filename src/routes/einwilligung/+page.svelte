<script lang="ts">
	import { enhance } from '$app/forms';
	import { OPERATOR } from '$lib/config';
	import ConsentSummary from '$lib/components/ConsentSummary.svelte';
	import ConsentChecks from '$lib/components/ConsentChecks.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let submitting = $state(false);

	// Welche Texte sich seit der letzten Einwilligung geändert haben, in fester Reihenfolge.
	const changedDocs = $derived(
		(['privacy', 'terms'] as const).filter((d) => data.updates.some((u) => u.documents.includes(d)))
	);
	const changes = $derived(data.updates.flatMap((u) => u.changes));
</script>

<svelte:head>
	<title>Einwilligung – Schulaufgaben Check</title>
</svelte:head>

<main class="min-h-screen bg-gray-50 px-4 py-10">
	<div class="mx-auto w-full max-w-xl">
		{#if data.reason === 'changed'}
			<h1 class="text-2xl font-bold text-gray-800">Neue Bedingungen bestätigen</h1>
			<p class="mt-2 text-sm text-gray-600">
				Wir haben
				{#if changedDocs.length === 0}
					unsere Rechtstexte
				{:else}
					{#each changedDocs as doc, i (doc)}
						{#if i > 0}&nbsp;und{/if}
						{#if doc === 'privacy'}
							die <a class="text-blue-600 hover:underline" href="/datenschutz" target="_blank" rel="noreferrer">Datenschutzerklärung</a>
						{:else}
							die <a class="text-blue-600 hover:underline" href="/nutzungsbedingungen" target="_blank" rel="noreferrer">Nutzungsbedingungen</a>
						{/if}
					{/each}
				{/if}
				seit der letzten Einwilligung für {data.familyName} geändert. Deshalb brauchen wir die Einwilligung
				eines Elternteils noch einmal.
			</p>

			{#if changes.length > 0}
				<div class="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
					<h2 class="text-sm font-semibold text-amber-900">Was ist neu</h2>
					<ul class="mt-2 list-disc space-y-1.5 pl-5 text-sm text-amber-900">
						{#each changes as change (change)}
							<li>{change}</li>
						{/each}
					</ul>
				</div>
			{/if}
		{:else}
			<h1 class="text-2xl font-bold text-gray-800">Einmal kurz bestätigen</h1>
			<p class="mt-2 text-sm text-gray-600">
				Bevor {data.familyName} loslegen kann, brauchen wir die Einwilligung eines Elternteils. Das ist
				einmalig und dauert eine Minute.
			</p>
		{/if}

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
			<ConsentChecks hasChildren={data.children.length > 0} name={form?.name ?? ''} offerInsights={data.offerInsights} />

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
