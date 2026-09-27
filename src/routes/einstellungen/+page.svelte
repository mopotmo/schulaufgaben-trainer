<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let loading = $state(false);
	let insightsBusy = $state(false);

	const insightsEnhance = () => {
		insightsBusy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			insightsBusy = false;
		};
	};
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
				Passwort erfolgreich geändert. Auf allen anderen Geräten ist die Familie jetzt abgemeldet.
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

	<div id="lernerkenntnisse" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 max-w-md mt-6">
		<h2 class="text-lg font-semibold text-gray-800 mb-2">Lernerkenntnisse</h2>
		<p class="text-sm text-gray-600 mb-4">
			Aus eingereichten Lösungen leitet der Trainer Stärken und Schwächen je Fach ab und stimmt
			neue Aufgaben darauf ab. Freiwillig — ohne funktioniert alles andere genauso.
			<a class="text-blue-600 hover:underline" href="/datenschutz#lernerkenntnisse" target="_blank" rel="noreferrer">Mehr dazu</a>
		</p>

		{#if form?.insightsChanged === 'off'}
			<div class="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 mb-4">
				Ausgeschaltet. Alle gesammelten Lernerkenntnisse wurden gelöscht.
			</div>
		{:else if form?.insightsChanged === 'on'}
			<div class="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 mb-4">
				Eingeschaltet. Ab der nächsten eingereichten Lösung werden Erkenntnisse gesammelt.
			</div>
		{/if}

		{#if data.insights}
			<p class="text-sm text-gray-700 mb-4">
				<strong>Eingeschaltet</strong> — eingewilligt von {data.insights.grantedBy} am
				{new Date(data.insights.grantedAt).toLocaleDateString('de-DE')}.
			</p>
			<form method="POST" action="?/disableInsights" use:enhance={insightsEnhance}>
				<p class="text-xs text-gray-500 mb-3">
					Beim Ausschalten werden alle gesammelten Erkenntnisse aller Kinder sofort gelöscht.
				</p>
				<button
					type="submit"
					disabled={insightsBusy}
					class="w-full border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 font-semibold py-2.5 rounded-xl transition-colors"
				>
					{insightsBusy ? 'Wird ausgeschaltet…' : 'Ausschalten und löschen'}
				</button>
			</form>
		{:else}
			<p class="text-sm text-gray-700 mb-4"><strong>Ausgeschaltet.</strong></p>
			<form method="POST" action="?/enableInsights" use:enhance={insightsEnhance} class="space-y-3">
				<label class="flex gap-3 text-sm text-gray-700">
					<input type="checkbox" name="insights" class="mt-0.5 h-4 w-4 shrink-0" />
					<span>Ich bin sorgeberechtigt und willige ein, dass Lernerkenntnisse abgeleitet und genutzt werden.</span>
				</label>
				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1" for="insights-name">Dein Name</label>
					<input
						id="insights-name" name="name" type="text" autocomplete="name"
						class="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
					/>
				</div>
				{#if form?.insightsError}
					<p class="text-sm text-red-500">{form.insightsError}</p>
				{/if}
				<button
					type="submit"
					disabled={insightsBusy}
					class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-xl transition-colors"
				>
					{insightsBusy ? 'Wird gespeichert…' : 'Einschalten'}
				</button>
			</form>
		{/if}
	</div>
</main>
