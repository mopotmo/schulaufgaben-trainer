<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const AVATARS = [
		// Tiere
		'🦊', '🐼', '🦁', '🐸', '🦋', '🐙', '🦄', '🐧', '🦖', '🐯',
		'🦈', '🐉', '🐨', '🦥', '🦦', '🦔', '🐺', '🦝', '🐮', '🐷',
		'🐸', '🐊', '🦜', '🦩', '🦚', '🦋', '🐝', '🐞', '🦎', '🐢',
		'🐬', '🦭', '🐘', '🦏', '🦛', '🦒', '🦓', '🦘', '🦙', '🐓',
		'🐍', '🦠',
		// Lustige & Sonstiges
		'👾', '🤖', '👻', '🎃', '🦸', '🧙', '🧚', '🧜', '🧝', '🪄',
		'🌟', '🚀', '⚽', '🎸', '🎨', '🍕', '🎮', '🌈', '🍦', '🎯',
		'🏆', '🎲', '🧩', '🎪', '🎠', '🪀', '🛸', '🌋', '🏔️', '🌊',
	];

	type LastExercise = {
		exerciseId: string;
		profileId: string;
		subject: string;
		topic: string;
		savedAt: string;
	};

	let lastExercise = $state<LastExercise | null>(null);
	let showAddForm = $state(false);
	let selectedAvatar = $state('🦊');
	let addLoading = $state(false);

	onMount(() => {
		try {
			const raw = localStorage.getItem('lastExercise');
			if (raw) lastExercise = JSON.parse(raw);
		} catch {}
	});

	function dismissLast() {
		lastExercise = null;
		try { localStorage.removeItem('lastExercise'); } catch {}
	}

	function lastExerciseAge(savedAt: string) {
		const mins = Math.round((Date.now() - new Date(savedAt).getTime()) / 60000);
		if (mins < 60) return `vor ${mins} Min.`;
		const hrs = Math.round(mins / 60);
		if (hrs < 24) return `vor ${hrs} Std.`;
		return `vor ${Math.round(hrs / 24)} Tag(en)`;
	}
</script>

<main class="max-w-2xl mx-auto px-4 py-8">
	<div class="mb-8">
		<div class="flex items-start justify-between gap-4">
			<div class="min-w-0">
				<h1 class="text-2xl sm:text-4xl font-bold text-gray-800 mb-1 leading-tight">Schulaufgaben Trainer</h1>
				<p class="text-gray-500 text-sm sm:text-base">Wer übt heute, <strong>{data.family.name}</strong>?</p>
			</div>
			<div class="flex items-center gap-3 shrink-0 mt-1">
				<a href="/einstellungen" class="text-sm text-gray-400 hover:text-gray-600 transition-colors">
					Einstellungen
				</a>
				<form method="POST" action="/logout">
					<button type="submit" class="text-sm text-gray-400 hover:text-gray-600 transition-colors">
						Abmelden
					</button>
				</form>
			</div>
		</div>
	</div>

	{#if lastExercise}
		<div class="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4">
			<div class="flex items-start gap-3">
				<span class="text-2xl shrink-0">📋</span>
				<div class="flex-1 min-w-0">
					<p class="text-sm font-semibold text-amber-800">Letzte Aufgabe weitermachen</p>
					<p class="text-xs text-amber-600 truncate">{lastExercise.subject} – {lastExercise.topic} · {lastExerciseAge(lastExercise.savedAt)}</p>
					<div class="flex gap-2 mt-2 flex-wrap">
						<a
							href="/loesen?aufgabe={lastExercise.exerciseId}"
							class="inline-block bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
						>
							Im Browser weitermachen
						</a>
						<a
							href="/korrigieren?aufgabe={lastExercise.exerciseId}"
							class="inline-block bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
						>
							Lösung einreichen
						</a>
					</div>
				</div>
				<button onclick={dismissLast} class="text-amber-300 hover:text-amber-500 text-xl leading-none shrink-0" aria-label="Schließen">×</button>
			</div>
		</div>
	{/if}

	<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
		{#each data.profiles as profile}
			<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-4">
				<div>
					<div class="text-5xl mb-3 text-center">{profile.avatar ?? '🎓'}</div>
					<h2 class="text-xl font-semibold text-gray-800 text-center">{profile.name}</h2>
					<p class="text-sm text-gray-400 text-center mt-1">
						{profile.school_type} · Klasse {profile.grade} · {profile.state}
					</p>
				</div>
				<div class="flex flex-col gap-2">
					<a
						href="/generieren?profil={profile.id}"
						class="block text-center bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
					>
						Neue Aufgaben generieren
					</a>
					<a
						href="/korrigieren?profil={profile.id}"
						class="block text-center bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
					>
						Lösung einreichen
					</a>
					<a
						href="/historie?profil={profile.id}"
						class="block text-center bg-gray-50 hover:bg-gray-100 text-gray-500 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
					>
						Übungshistorie
					</a>
				</div>
			</div>
		{/each}

		<!-- Add profile card -->
		{#if !showAddForm}
			<button
				onclick={() => showAddForm = true}
				class="bg-white rounded-2xl shadow-sm border-2 border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50 p-6 flex flex-col items-center justify-center gap-2 transition-colors text-gray-400 hover:text-blue-500 min-h-[200px]"
			>
				<span class="text-4xl">＋</span>
				<span class="text-sm font-medium">Profil hinzufügen</span>
			</button>
		{:else}
			<div class="bg-white rounded-2xl shadow-sm border border-blue-100 p-5 sm:col-span-2">
				<div class="flex items-center justify-between mb-4">
					<h3 class="font-semibold text-gray-800">Neues Profil</h3>
					<button onclick={() => showAddForm = false} class="text-gray-300 hover:text-gray-500 text-xl leading-none">×</button>
				</div>

				<!-- Avatar picker -->
				<div class="mb-4">
					<p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Avatar wählen</p>
					<div class="flex flex-wrap gap-2">
						{#each AVATARS as emoji}
							<button
								type="button"
								onclick={() => selectedAvatar = emoji}
								class="text-2xl w-10 h-10 rounded-xl transition-all {selectedAvatar === emoji ? 'bg-blue-100 ring-2 ring-blue-400 scale-110' : 'bg-gray-50 hover:bg-gray-100'}"
							>{emoji}</button>
						{/each}
					</div>
				</div>

				<form
					method="POST"
					action="?/addProfile"
					use:enhance={() => {
						addLoading = true;
						return ({ update }) => {
							addLoading = false;
							if (!form?.error) showAddForm = false;
							update();
						};
					}}
					class="grid grid-cols-2 gap-3"
				>
					<input type="hidden" name="avatar" value={selectedAvatar} />

					<div class="col-span-2">
						<label class="block text-xs font-medium text-gray-600 mb-1" for="p-name">Name</label>
						<input
							id="p-name"
							name="name"
							type="text"
							placeholder="z.B. Lukas"
							required
							class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
						/>
					</div>

					<div>
						<label class="block text-xs font-medium text-gray-600 mb-1" for="p-school">Schulart</label>
						<select
							id="p-school"
							name="school_type"
							required
							class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
						>
							<option value="">— wählen —</option>
							<option value="Gymnasium">Gymnasium</option>
							<option value="Realschule">Realschule</option>
							<option value="Mittelschule">Mittelschule</option>
							<option value="Gesamtschule">Gesamtschule</option>
						</select>
					</div>

					<div>
						<label class="block text-xs font-medium text-gray-600 mb-1" for="p-grade">Klasse</label>
						<select
							id="p-grade"
							name="grade"
							required
							class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
						>
							<option value="">—</option>
							{#each Array.from({length: 9}, (_, i) => i + 5) as g}
								<option value={g}>Klasse {g}</option>
							{/each}
						</select>
					</div>

					<div class="col-span-2">
						<label class="block text-xs font-medium text-gray-600 mb-1" for="p-state">Bundesland</label>
						<select
							id="p-state"
							name="state"
							required
							class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
						>
							<option value="">— wählen —</option>
							{#each ['Bayern', 'Baden-Württemberg', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg', 'Hessen', 'Mecklenburg-Vorpommern', 'Niedersachsen', 'Nordrhein-Westfalen', 'Rheinland-Pfalz', 'Saarland', 'Sachsen', 'Sachsen-Anhalt', 'Schleswig-Holstein', 'Thüringen'] as state}
								<option value={state} selected={state === 'Bayern'}>{state}</option>
							{/each}
						</select>
					</div>

					{#if form?.error}
						<p class="col-span-2 text-sm text-red-500">{form.error}</p>
					{/if}

					<div class="col-span-2 flex gap-2 pt-1">
						<button
							type="submit"
							disabled={addLoading}
							class="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2 rounded-xl transition-colors text-sm"
						>
							{addLoading ? 'Wird gespeichert…' : 'Profil anlegen'}
						</button>
						<button
							type="button"
							onclick={() => showAddForm = false}
							class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-xl transition-colors"
						>
							Abbrechen
						</button>
					</div>
				</form>
			</div>
		{/if}
	</div>
</main>
