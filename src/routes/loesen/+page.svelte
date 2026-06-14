<script lang="ts">
	import type { PageData } from './$types';
	import Stopwatch from '$lib/components/Stopwatch.svelte';
	import MathToolbar from '$lib/components/MathToolbar.svelte';
	import { parseExercises } from '$lib/parseExercises';
	import { renderMath } from '$lib/renderMath';
	import { marked } from 'marked';
	import { onMount } from 'svelte';
	import 'katex/dist/katex.min.css';

	let { data }: { data: PageData } = $props();

	let draftKey = $derived(`draft_answers_${data.exercise.id}`);

	let parsedExercises = $derived(parseExercises(data.exercise.content));
	let answers = $state<string[]>([]);
	let activeField = $state<number | null>(null);

	// Stopwatch
	let stopwatch = $state<Stopwatch | null>(null);
	let durationMinutes = $state(45);
	let stopwatchEnabled = $state(true);
	let durationSeconds = $derived(stopwatchEnabled ? durationMinutes * 60 : 0);

	// Submission
	let showGrade = $state(false);
	let submitting = $state(false);
	let submitError = $state('');
	let correctionResult = $state('');
	let correctionHtml = $derived(
		correctionResult ? renderMath(marked(correctionResult) as string) : ''
	);

	// Post-correction grade
	let gradeText = $state('');
	let loadingGrade = $state(false);

	// Follow-up chat
	type ChatMsg = { role: 'user' | 'assistant'; text: string };
	let chatMessages = $state<ChatMsg[]>([]);
	let chatInput = $state('');
	let chatLoading = $state(false);

	// Textarea refs for symbol insertion
	let textareaRefs = $state<(HTMLTextAreaElement | null)[]>([]);

	onMount(() => {
		const saved = localStorage.getItem(draftKey);
		answers = saved ? JSON.parse(saved) : parsedExercises.map(() => '');
	});

	$effect(() => {
		if (answers.length > 0) localStorage.setItem(draftKey, JSON.stringify(answers));
	});

	$effect(() => {
		const hasAnswers = answers.some((a) => a.trim());
		function handleBeforeUnload(e: BeforeUnloadEvent) {
			if (hasAnswers && !correctionResult) e.preventDefault();
		}
		window.addEventListener('beforeunload', handleBeforeUnload);
		return () => window.removeEventListener('beforeunload', handleBeforeUnload);
	});

	function insertSymbol(symbol: string) {
		const idx = activeField ?? 0;
		const ta = textareaRefs[idx];
		if (!ta) {
			answers[idx] = (answers[idx] ?? '') + symbol;
			return;
		}
		const start = ta.selectionStart ?? answers[idx].length;
		const end = ta.selectionEnd ?? start;
		const before = answers[idx].slice(0, start);
		const after = answers[idx].slice(end);
		answers[idx] = before + symbol + after;
		// Restore cursor after tick
		setTimeout(() => {
			ta.focus();
			ta.setSelectionRange(start + symbol.length, start + symbol.length);
		}, 0);
	}

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

	async function requestGrade() {
		loadingGrade = true;
		try {
			const res = await fetch('/api/note', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ correctionResult })
			});
			const json = await res.json();
			gradeText = json.grade ?? '';
		} catch {
			gradeText = 'Fehler bei der Notenberechnung.';
		} finally {
			loadingGrade = false;
		}
	}

	async function sendChat() {
		const q = chatInput.trim();
		if (!q) return;
		chatMessages = [...chatMessages, { role: 'user', text: q }];
		chatInput = '';
		chatLoading = true;
		try {
			const res = await fetch('/api/folgefrage', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					exerciseContent: data.exercise.content,
					correctionResult,
					question: q
				})
			});
			const json = await res.json();
			chatMessages = [...chatMessages, { role: 'assistant', text: json.answer ?? '' }];
		} catch {
			chatMessages = [...chatMessages, { role: 'assistant', text: 'Fehler – bitte nochmal versuchen.' }];
		} finally {
			chatLoading = false;
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
		<!-- Sticky stopwatch -->
		{#if stopwatchEnabled}
			<div class="sticky top-4 z-10 bg-white rounded-2xl shadow border border-gray-100 p-4">
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
				<!-- Math toolbar (shared, acts on active field) -->
				<div>
					<p class="text-xs text-gray-400 mb-1">Mathematische Symbole einfügen (aktives Feld):</p>
					<MathToolbar oninsert={insertSymbol} />
				</div>

				{#each parsedExercises as ex, i}
					<div>
						<p class="text-sm font-semibold text-gray-800 mb-1">{ex.title}</p>
						{#if ex.body}
							<div class="prose prose-sm max-w-none text-gray-600 mb-2">
								{@html renderMath(marked(ex.body) as string)}
							</div>
						{/if}
						<textarea
							bind:value={answers[i]}
							bind:this={textareaRefs[i]}
							onfocus={() => (activeField = i)}
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
					disabled={submitting || !!correctionResult}
					class="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold py-2.5 rounded-xl transition-colors"
				>
					{submitting ? 'Korrektur läuft…' : correctionResult ? 'Bereits korrigiert' : 'Korrektur starten'}
				</button>
			</div>
		</div>

		<!-- Correction result -->
		{#if correctionResult}
			<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
				<h2 class="text-xl font-semibold text-gray-800">Korrektur-Ergebnis</h2>
				<div class="prose prose-sm max-w-none bg-gray-50 rounded-lg p-4 overflow-auto">
					{@html correctionHtml}
				</div>

				<!-- Grade on demand -->
				{#if !gradeText}
					<button
						onclick={requestGrade}
						disabled={loadingGrade}
						class="text-sm px-4 py-2 rounded-xl border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
					>
						{loadingGrade ? 'Berechne Note…' : 'Note nachträglich berechnen'}
					</button>
				{:else}
					<p class="text-sm font-medium text-gray-700 bg-blue-50 rounded-xl px-4 py-3">{gradeText}</p>
				{/if}

				<!-- Follow-up chat -->
				<div class="border-t border-gray-100 pt-4">
					<h3 class="text-sm font-semibold text-gray-700 mb-3">Rückfragen zur Korrektur</h3>

					{#if chatMessages.length > 0}
						<div class="space-y-3 mb-3 max-h-80 overflow-y-auto">
							{#each chatMessages as msg}
								<div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
									<div class="max-w-[85%] rounded-2xl px-4 py-2 text-sm
										{msg.role === 'user'
											? 'bg-blue-500 text-white'
											: 'bg-gray-100 text-gray-800'}">
										{#if msg.role === 'assistant'}
											<div class="prose prose-sm max-w-none">{@html renderMath(marked(msg.text) as string)}</div>
										{:else}
											{msg.text}
										{/if}
									</div>
								</div>
							{/each}
							{#if chatLoading}
								<div class="flex justify-start">
									<div class="bg-gray-100 rounded-2xl px-4 py-2 text-sm text-gray-400 animate-pulse">Lehrer denkt nach…</div>
								</div>
							{/if}
						</div>
					{/if}

					<div class="flex gap-2">
						<input
							type="text"
							bind:value={chatInput}
							onkeydown={(e) => e.key === 'Enter' && !e.shiftKey && sendChat()}
							placeholder="Frage stellen…"
							disabled={chatLoading}
							class="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50"
						/>
						<button
							onclick={sendChat}
							disabled={chatLoading || !chatInput.trim()}
							class="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-200 text-white rounded-xl text-sm font-medium transition-colors"
						>
							Senden
						</button>
					</div>
				</div>

				<div class="pt-2">
					<a href="/historie?profil={data.profile.id}" class="text-sm text-blue-500 hover:underline">
						← Zurück zur Übungshistorie
					</a>
				</div>
			</div>
		{/if}
	</div>
</main>
