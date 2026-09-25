<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { OPERATOR } from '$lib/config';
	import ConsentSummary from '$lib/components/ConsentSummary.svelte';
	import ConsentChecks from '$lib/components/ConsentChecks.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let loading = $state(false);

	const inputClass =
		'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300';
</script>

<svelte:head>
	<title>{data.isReset ? 'Neues Passwort' : 'Willkommen'} – Schulaufgaben Check</title>
</svelte:head>

{#snippet passwordFields()}
	<div>
		<label class="block text-sm font-medium text-gray-700 mb-1" for="password">
			{data.isReset ? 'Neues Passwort' : 'Passwort'}
			<span class="text-gray-400 font-normal">(mindestens 8 Zeichen)</span>
		</label>
		<input id="password" name="password" type="password" autocomplete="new-password" required minlength="8" class={inputClass} />
	</div>
	<div>
		<label class="block text-sm font-medium text-gray-700 mb-1" for="passwordConfirm">Passwort wiederholen</label>
		<input id="passwordConfirm" name="passwordConfirm" type="password" autocomplete="new-password" required class={inputClass} />
	</div>
{/snippet}

{#snippet submit(label: string)}
	{#if form?.error}
		<p class="text-sm text-red-500">{form.error}</p>
	{/if}
	<button
		type="submit"
		disabled={loading}
		class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-xl transition-colors"
	>
		{loading ? 'Wird gespeichert…' : label}
	</button>
{/snippet}

<form
	method="POST"
	use:enhance={() => {
		loading = true;
		return ({ update }) => { loading = false; update({ reset: false }); };
	}}
>
	<input type="hidden" name="token" value={data.token} />

	{#if data.isReset}
		<main class="min-h-screen bg-gray-50 flex items-center justify-center px-4">
			<div class="w-full max-w-sm">
				<div class="text-center mb-8">
					<div class="text-5xl mb-3">🎓</div>
					<h1 class="text-2xl font-bold text-gray-800">Neues Passwort setzen</h1>
					<p class="text-gray-500 text-sm mt-1">Für <strong>{data.familyName}</strong></p>
				</div>
				<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
					{@render passwordFields()}
					{@render submit('Passwort ändern & einloggen')}
				</div>
			</div>
		</main>
	{:else}
		<main class="min-h-screen bg-gray-50 px-4 py-10">
			<div class="mx-auto w-full max-w-xl">
				<div class="text-5xl mb-3">🎓</div>
				<h1 class="text-2xl font-bold text-gray-800">Willkommen, {data.familyName}!</h1>
				<p class="mt-2 text-sm text-gray-600">
					Richte euren Familienzugang ein. Das dauert zwei Minuten: ein Passwort, deine
					E-Mail-Adresse und die Einwilligung eines Elternteils.
				</p>

				<div class="mt-6 space-y-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
					<h2 class="text-sm font-semibold text-gray-700">Zugang</h2>
					{@render passwordFields()}
					<div>
						<label class="mb-1 block text-sm font-medium text-gray-700" for="email">Deine E-Mail-Adresse</label>
						<input
							id="email" name="email" type="email" required autocomplete="email"
							value={form?.email ?? data.email}
							class={inputClass}
						/>
						<p class="mt-1 text-xs text-gray-400">
							Du bekommst gleich einen Bestätigungslink. Die Adresse brauchen wir für ein
							vergessenes Passwort, für Rückfragen, Widerruf und Löschanfragen.
						</p>
					</div>
				</div>

				<div class="mt-4">
					<ConsentSummary children={[]} />
				</div>

				<div class="mt-4 space-y-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
					<h2 class="text-sm font-semibold text-gray-700">Einwilligung</h2>
					<ConsentChecks hasChildren={false} name={form?.name ?? ''} />
					{@render submit('Zugang einrichten')}
					<p class="text-xs text-gray-400">
						Du kannst die Einwilligung jederzeit widerrufen — eine formlose Nachricht an
						<a class="text-blue-600 hover:underline" href="mailto:{OPERATOR.email}">{OPERATOR.email}</a>
						genügt. Der Zugang und alle Daten werden dann binnen weniger Tage gelöscht.
					</p>
				</div>
			</div>
		</main>
	{/if}
</form>
