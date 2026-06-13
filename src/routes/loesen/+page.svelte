<script lang="ts">
	import type { PageData } from './$types';
	import Stopwatch from '$lib/components/Stopwatch.svelte';
	import { parseExercises } from '$lib/parseExercises';
	import { marked } from 'marked';
	import { onMount } from 'svelte';

	let { data }: { data: PageData } = $props();

	const draftKey = `draft_answers_${data.exercise.id}`;

	let parsedExercises = $derived(parseExercises(data.exercise.content));
	let answers = $state<string[]>([]);
	let showGrade = $state(false);
	let submitting = $state(false);
	let submitError = $state('');
	let correctionResult = $state('');
	let correctionHtml = $derived(correctionResult ? (marked(correctionResult) as string) : '');

	let stopwatch = $state<Stopwatch | null>(null);
	let durationMinutes = $state(45);
	let stopwatchEnabled = $state(true);
	let durationSeconds = $derived(stopwatchEnabled ? durationMinutes * 60 : 0);

	onMount(() => {
		const saved = localStorage.getItem(draftKey);
		answers = saved ? JSON.parse(saved) : parsedExercises.map(() => '');
	});

	// Persist answers on every change
	$effect(() => {
		if (answers.length > 0) {
			localStorage.setItem(draftKey, JSON.stringify(answers));
		}
	});

	// Warn before leaving if unsaved answers exist
	$effect(() => {
		const hasAnswers = answers.some((a) => a.trim());
		function handleBeforeUnload(e: BeforeUnloadEvent) {
			if (hasAnswers && !correctionResult) e.preventDefault();
		}
		window.addEventListener('beforeunload', handleBeforeUnload);
		return () => window.removeEventListener('beforeunload', handleBeforeUnload);
	});

	async function submitAnswers() {
		if (answers.some((a) => !a.trim())) {
			submitError = 'Bitte alle Aufgaben beantworten.';
			return;
		}
		submitError = '';
		submitting = true;
		correctionResult = '';

		const textAnswers = parsedExercises
			.map((ex, i) => `${ex.title}:\n${answers[i]}`)
			.join('\n\n');

		const form = new FormData();
		form.append('exerciseId', data.exercise.id);
		form.append('textAnswers', textAnswers);
		form.append('showGrade', String(showGrade));

		try {
			const res = await fetch('/api/korrigieren', { method: 'POST', body: form });
			const json = await res.json();
			if (!res.ok) throw new Error(json.message ?? 'Fehler bei der Korrektur');
			correctionResult = json.result;
			stopwatch?.stop();
			localStorage.removeItem(draftKey);
		} catch (e: any) {
			submitError = e.message;
		} finally {
			submitting = false;
		}
	}
</script>

<main class="max-w-2xl mx-auto px-4 py-8">
	<a href="/historie?profil={data.profile.id}" class="text-sm text-blue-500 hover:underline mb-6 inline-block">
		← Übungshistorie
	</a>

	<div class="mb-6">
		<h1 class="text-2xl font-bold text-gray-800">{data.exercise.subject}</h1>
		<p class="text-gray-500 text-sm mt-1">{data.exercise.topic} · {data.profile.name}</p>
	</div>

	<div class="space-y-4">
		<!-- Stoppuhr -->
		{#if stopwatchEnabled}
			<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
				<div class="flex items-center justify-between mb-2">
					<p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Stoppuhr</p>
					<label class="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
						<input type="number" bind:value={durationMinutes} min="5" max="180" class="w-14 border border-gray-200 rounded-lg px-2 py-1 text-center text-sm" />
						Min.
					</label>
				</div>
				<Stopwatch bind:this={stopwatch} {durationSeconds} />
			</div>
		{/if}

		<!-- Exercises -->
		<div class="bg-white rounded-2xl shadow-sm border border-blue-100 overflow-hidden">
			<div class="px-6 py-4 border-b border-blue-100 bg-blue-50">
				<h2 class="font-semibold text-gray-800 text-sm">Aufgaben lösen</h2>
				<p class="text-xs text-gray-500 mt-0.5">Trag deine Antworten ein und klick auf „Korrektur starten". Deine Eingaben werden automatisch gespeichert.</p>
			</div>

			<div class="p-6 space-y-6">
				{#each parsedExercises as ex, i}
					<div>
						<p class="text-sm font-semibold text-gray-800 mb-1">{ex.title}</p>
						{#if ex.body}
							<div class="prose prose-sm max-w-none text-gray-600 mb-2">{@html marked(ex.body) as string}</div>
						{/if}
						<textarea
							bind:value={answers[i]}
							rows="3"
							placeholder="Deine Antwort…"
							class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-y"
						></textarea>
					</div>
				{/each}

				<label class="flex items-center gap-3 cursor-pointer select-none">
					<div class="relative">
						<input type="checkbox" bind:checked={showGrade} class="sr-only peer" />
						<div class="w-10 h-6 bg-gray-200 rounded-full peer-checked:bg-blue-500 transition-colors"></div>
						<div class="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4"></div>
					</div>
					<span class="text-sm text-gray-700">Note anzeigen <span class="text-gray-400">(bayerischer Gymnasium-Schlüssel)</span></span>
				</label>

				{#if submitError}
					<p class="text-red-500 text-sm">{submitError}</p>
				{/if}

				<button
					onclick={submitAnswers}
					disabled={submitting}
					class="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold py-2.5 rounded-xl transition-colors"
				>
					{submitting ? 'Korrektur läuft…' : 'Korrektur starten'}
				</button>
			</div>
		</div>

		<!-- Correction result -->
		{#if correctionResult}
			<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
				<h2 class="text-xl font-semibold text-gray-800 mb-4">Korrektur-Ergebnis</h2>
				<div class="prose prose-sm max-w-none bg-gray-50 rounded-lg p-4 overflow-auto">
					{@html correctionHtml}
				</div>
				<div class="mt-4 pt-4 border-t border-gray-100">
					<a href="/historie?profil={data.profile.id}" class="text-sm text-blue-500 hover:underline">
						← Zurück zur Übungshistorie
					</a>
				</div>
			</div>
		{/if}
	</div>
</main>
