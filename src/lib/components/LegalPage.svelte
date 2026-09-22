<script lang="ts">
	import { operatorDataComplete } from '$lib/config';

	type Props = { title: string; updated?: string; children: import('svelte').Snippet };
	let { title, updated, children }: Props = $props();
</script>

<svelte:head>
	<title>{title} – Schulaufgaben Check</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="min-h-screen bg-gray-50 px-4 py-10">
	<div class="mx-auto w-full max-w-2xl">
		<a href="/" class="text-sm text-blue-600 hover:underline">← Zurück</a>

		<h1 class="mt-4 text-2xl font-bold text-gray-800">{title}</h1>
		{#if updated}
			<p class="mt-1 text-xs text-gray-400">Stand: {updated}</p>
		{/if}

		{#if !operatorDataComplete()}
			<p class="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
				<strong>Noch nicht veröffentlichungsbereit.</strong> Die Betreiberangaben in
				<code>src/lib/config.ts</code> sind Platzhalter und müssen vor der Freigabe ausgefüllt werden.
			</p>
		{/if}

		<div
			class="prose prose-sm mt-6 max-w-none text-gray-700
				prose-headings:text-gray-800 prose-headings:font-semibold
				prose-h2:text-base prose-h2:mt-8 prose-h2:mb-2
				prose-a:text-blue-600 prose-li:my-0.5"
		>
			{@render children()}
		</div>
	</div>
</main>
