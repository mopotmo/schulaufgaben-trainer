<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { BACKUP_RETENTION_DAYS } from '$lib/config';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let deleting = $state(false);

	const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('de-DE') : '–');
	const CONSENT_LABEL: Record<string, string> = {
		privacy: 'Datenschutzerklärung',
		terms: 'Nutzungsbedingungen',
		insights: 'Lernerkenntnisse'
	};
</script>

<main class="max-w-2xl mx-auto px-4 py-10">
	<a href="/einstellungen" class="text-sm text-blue-500 hover:underline mb-6 inline-block">← Einstellungen</a>

	<h1 class="text-3xl font-bold text-gray-800 mb-1">Meine Daten</h1>
	<p class="text-gray-500 mb-8">
		Alles, was zu Familie <strong>{data.family.name}</strong> gespeichert ist.
		<a class="text-blue-600 hover:underline" href="/datenschutz" target="_blank" rel="noreferrer">Datenschutzerklärung</a>
	</p>

	<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
		<h2 class="text-lg font-semibold text-gray-800 mb-3">Familienzugang</h2>
		<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
			<dt class="text-gray-500">Name</dt><dd class="text-gray-800">{data.family.name}</dd>
			<dt class="text-gray-500">Login</dt><dd class="text-gray-800">{data.family.slug}</dd>
			<dt class="text-gray-500">E-Mail</dt><dd class="text-gray-800 break-all">{data.family.email ?? '–'}</dd>
			<dt class="text-gray-500">Angelegt</dt><dd class="text-gray-800">{day(data.family.created_at)}</dd>
		</dl>

		{#if data.consents.length}
			<h3 class="text-sm font-semibold text-gray-700 mt-5 mb-2">Einwilligungen</h3>
			<ul class="text-sm text-gray-700 space-y-1">
				{#each data.consents as c, i (i)}
					<li>
						{CONSENT_LABEL[c.type] ?? c.type} (Version {c.version}) — {c.granted_by_name}, {day(c.granted_at)}
						{#if c.revoked_at}<span class="text-gray-400">· widerrufen {day(c.revoked_at)}</span>{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
		<h2 class="text-lg font-semibold text-gray-800 mb-3">Profile</h2>
		{#if data.profiles.length === 0}
			<p class="text-sm text-gray-500">Keine Profile angelegt.</p>
		{/if}
		<ul class="space-y-4">
			{#each data.profiles as p, i (i)}
				<li class="text-sm">
					<p class="font-medium text-gray-800">{p.avatar ?? ''} {p.name}</p>
					<p class="text-gray-500">{p.school_type}, Klasse {p.grade}, {p.state}</p>
					<p class="text-gray-700 mt-1">
						{p.exercises} Aufgabe(n), {p.corrections} Korrektur(en), {p.feedback} Rückmeldung(en)
					</p>
					{#if p.subjects.length}
						<p class="text-gray-500">Fächer: {p.subjects.join(', ')}</p>
					{/if}
					{#if p.insights.length}
						<p class="text-gray-500">Lernerkenntnisse zu: {p.insights.join(', ')}</p>
					{/if}
				</li>
			{/each}
		</ul>
	</div>

	<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
		<h2 class="text-lg font-semibold text-gray-800 mb-3">Bücher und Dateien</h2>
		{#if data.books.length}
			<ul class="text-sm text-gray-700 space-y-1 mb-3">
				{#each data.books as b, i (i)}
					<li>{b.title} <span class="text-gray-500">({b.subject}, Klasse {b.grade})</span></li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-gray-500 mb-3">Keine Bücher hochgeladen.</p>
		{/if}
		<p class="text-sm text-gray-500">
			{data.files} hochgeladene Datei(en) — Aufgabenvorlagen, Lösungsfotos, Bücher. Uploads zu
			Aufgaben werden nach 30 Tagen automatisch gelöscht.
		</p>
	</div>

	<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
		<h2 class="text-lg font-semibold text-gray-800 mb-2">Alles herunterladen</h2>
		<p class="text-sm text-gray-600 mb-4">
			Eine Datei mit allen Angaben im Volltext — auch den Aufgaben, Korrekturen und
			Lernerkenntnissen. Hochgeladene Dateien sind darin aufgeführt, aber nicht enthalten.
		</p>
		<a
			href="/einstellungen/daten/export"
			download
			class="block w-full text-center border border-gray-200 text-gray-700 hover:bg-gray-50 font-semibold py-2.5 rounded-xl transition-colors"
		>
			Daten herunterladen (JSON)
		</a>
	</div>

	<div class="bg-white rounded-2xl shadow-sm border border-red-100 p-6">
		<h2 class="text-lg font-semibold text-red-700 mb-2">Familienzugang löschen</h2>
		<p class="text-sm text-gray-600 mb-4">
			Löscht den Zugang mit allen Profilen, Aufgaben, Korrekturen, Lernerkenntnissen, Büchern und
			Dateien sofort und endgültig. Aus den Sicherungskopien verschwinden die Daten spätestens
			{BACKUP_RETENTION_DAYS} Tage danach. Rückmeldungen bleiben ohne Bezug zur Familie erhalten.
		</p>

		<form
			method="POST"
			action="?/deleteFamily"
			use:enhance={() => {
				deleting = true;
				return async ({ update }) => {
					await update();
					deleting = false;
				};
			}}
			class="space-y-3"
		>
			<label class="flex gap-3 text-sm text-gray-700">
				<input type="checkbox" name="confirm" class="mt-0.5 h-4 w-4 shrink-0" />
				<span>Ich möchte den Familienzugang und alle Daten endgültig löschen.</span>
			</label>
			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1" for="delete-password">Familienpasswort</label>
				<input
					id="delete-password"
					name="password"
					type="password"
					autocomplete="current-password"
					required
					class="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
				/>
			</div>
			{#if form?.error}
				<p class="text-sm text-red-500">{form.error}</p>
			{/if}
			<button
				type="submit"
				disabled={deleting}
				class="w-full border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 font-semibold py-2.5 rounded-xl transition-colors"
			>
				{deleting ? 'Wird gelöscht…' : 'Endgültig löschen'}
			</button>
		</form>
	</div>
</main>
