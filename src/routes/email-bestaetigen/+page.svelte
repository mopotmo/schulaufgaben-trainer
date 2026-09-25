<script lang="ts">
	import { enhance } from '$app/forms';
	import { OPERATOR } from '$lib/config';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let busy = $state(false);

	const submitting = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
		};
	};
</script>

<svelte:head>
	<title>E-Mail bestätigen – Schulaufgaben Check</title>
</svelte:head>

<main class="min-h-screen bg-gray-50 flex items-center justify-center px-4">
	<div class="w-full max-w-sm text-center">
		<div class="text-5xl mb-3">✉️</div>

		{#if data.state === 'confirm'}
			<h1 class="text-2xl font-bold text-gray-800">E-Mail-Adresse bestätigen</h1>
			<p class="mt-2 text-sm text-gray-600">
				Für <strong>{data.familyName}</strong>: <strong>{data.email}</strong>
			</p>
			<form method="POST" action="?/confirm" use:enhance={submitting} class="mt-6">
				<input type="hidden" name="token" value={data.token} />
				<button
					type="submit"
					disabled={busy}
					class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-xl transition-colors"
				>
					{busy ? 'Wird bestätigt…' : 'Jetzt bestätigen'}
				</button>
			</form>
			{#if form?.error}
				<p class="mt-3 text-sm text-red-500">{form.error}</p>
			{/if}
		{:else if data.state === 'invalid'}
			<h1 class="text-2xl font-bold text-gray-800">Link nicht mehr gültig</h1>
			<p class="mt-2 text-sm text-gray-600">
				Der Link ist abgelaufen oder wurde schon verwendet. Melde dich an — dort kannst du dir
				einen neuen schicken lassen.
			</p>
			<a href="/login" class="mt-6 inline-block text-sm text-blue-600 hover:underline">Zur Anmeldung</a>
		{:else}
			<h1 class="text-2xl font-bold text-gray-800">Schau in dein Postfach</h1>
			<p class="mt-2 text-sm text-gray-600">
				Wir haben einen Bestätigungslink an <strong>{data.email}</strong> geschickt. Sobald du
				ihn angeklickt hast, geht es los.
			</p>
			<p class="mt-2 text-xs text-gray-400">Nichts angekommen? Schau auch im Spam-Ordner nach.</p>

			<div class="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
				<form method="POST" action="?/resend" use:enhance={submitting}>
					<button
						type="submit"
						disabled={busy}
						class="w-full rounded-xl border border-blue-200 py-2.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:opacity-50"
					>
						{busy ? 'Wird gesendet…' : 'Mail erneut senden'}
					</button>
				</form>
				{#if form?.resent}
					<p class="mt-3 text-sm text-green-600">Neue Mail ist unterwegs.</p>
				{:else if form?.error}
					<p class="mt-3 text-sm text-red-500">{form.error}</p>
				{/if}
				<p class="mt-4 text-xs text-gray-400">
					Adresse falsch? Schreib an
					<a class="text-blue-600 hover:underline" href="mailto:{OPERATOR.email}">{OPERATOR.email}</a>,
					dann korrigieren wir sie.
				</p>
			</div>

			<form method="POST" action="/logout" class="mt-6">
				<button type="submit" class="text-xs text-gray-400 hover:underline">Abmelden</button>
			</form>
		{/if}
	</div>
</main>
