<script lang="ts">
	import type { PageData } from './$types';
	import FileUpload from '$lib/components/FileUpload.svelte';
	import FeedbackWidget from '$lib/components/FeedbackWidget.svelte';
	import Stopwatch from '$lib/components/Stopwatch.svelte';
	import { parseExercises } from '$lib/parseExercises';
	import { marked } from 'marked';
	let { data }: { data: PageData } = $props();

	// Generation form
	let subject = $state(data.prefill?.subject ?? '');
	let topic = $state(data.prefill?.topic ?? '');
	let teacherNotes = $state('');
	let count = $state(5);
	let difficulty = $state('mittel');
	let sourceFiles = $state<File[]>([]);

	let generating = $state(false);
	let exerciseId = $state<string | null>(null);
	let generatedContent = $state('');
	let genError = $state('');

	// Browser-Löse-Modus
	type SolveMode = 'none' | 'browser' | 'paper';
	let solveMode = $state<SolveMode>('none');
	let stopwatch = $state<Stopwatch | null>(null);
	let durationMinutes = $state(45);
	let stopwatchEnabled = $state(true);
	let durationSeconds = $derived(stopwatchEnabled ? durationMinutes * 60 : 0);
	let parsedExercises = $derived(generatedContent ? parseExercises(generatedContent) : []);
	let answers = $state<string[]>([]);
	let showGrade = $state(false);
	let submitting = $state(false);
	let submitError = $state('');
	let correctionResult = $state('');
	let correctionHtml = $derived(correctionResult ? (marked(correctionResult) as string) : '');
	let generatedHtml = $derived(generatedContent ? (marked(generatedContent) as string) : '');

	// Chat
	type ChatMessage = { role: 'user' | 'assistant'; text: string };
	let chatMessages = $state<ChatMessage[]>([]);
	let chatInput = $state('');
	let chatLoading = $state(false);
	let chatError = $state('');
	let chatContainer = $state<HTMLDivElement | null>(null);

	// localStorage key for draft answers
	const draftKey = $derived(exerciseId ? `draft_answers_${exerciseId}` : null);

	function startBrowserMode() {
		solveMode = 'browser';
		// Restore saved draft if available
		const saved = draftKey ? localStorage.getItem(draftKey) : null;
		answers = saved ? JSON.parse(saved) : parsedExercises.map(() => '');
		correctionResult = '';
		submitError = '';
	}

	// Persist answers to localStorage on every change
	$effect(() => {
		if (solveMode === 'browser' && draftKey && answers.length > 0) {
			localStorage.setItem(draftKey, JSON.stringify(answers));
		}
	});

	// Warn before leaving if answers are in progress
	$effect(() => {
		const hasAnswers = solveMode === 'browser' && answers.some((a) => a.trim());
		function handleBeforeUnload(e: BeforeUnloadEvent) {
			if (hasAnswers && !correctionResult) {
				e.preventDefault();
			}
		}
		window.addEventListener('beforeunload', handleBeforeUnload);
		return () => window.removeEventListener('beforeunload', handleBeforeUnload);
	});


	async function submitAnswers() {
		if (!exerciseId) return;
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
		form.append('exerciseId', exerciseId);
		form.append('textAnswers', textAnswers);
		form.append('showGrade', String(showGrade));

		try {
			const res = await fetch('/api/korrigieren', { method: 'POST', body: form });
			const json = await res.json();
			if (!res.ok) throw new Error(json.message ?? 'Fehler bei der Korrektur');
			correctionResult = json.result;
			stopwatch?.stop();
			if (draftKey) localStorage.removeItem(draftKey);
		} catch (e: any) {
			submitError = e.message;
		} finally {
			submitting = false;
		}
	}

	function saveLastExercise(id: string) {
		try {
			localStorage.setItem('lastExercise', JSON.stringify({
				exerciseId: id,
				profileId: data.profile.id,
				subject,
				topic,
				savedAt: new Date().toISOString()
			}));
		} catch {}
	}

	async function generate() {
		if (!subject.trim() || !topic.trim()) {
			genError = 'Bitte Fach und Thema eingeben.';
			return;
		}
		genError = '';
		generating = true;
		generatedContent = '';
		exerciseId = null;
		chatMessages = [];

		const form = new FormData();
		form.append('profilId', data.profile.id);
		form.append('subject', subject);
		form.append('topic', topic);
		form.append('teacherNotes', teacherNotes);
		form.append('count', String(count));
		form.append('difficulty', difficulty);
		form.append('durationMinutes', stopwatchEnabled ? String(durationMinutes) : '0');
		for (const file of sourceFiles) form.append('sourceFiles', file);

		try {
			const res = await fetch('/api/generieren', { method: 'POST', body: form });
			const json = await res.json();
			if (!res.ok) throw new Error(json.message ?? 'Fehler beim Generieren');
			exerciseId = json.exerciseId;
			generatedContent = json.content;
			saveLastExercise(json.exerciseId);
		} catch (e: any) {
			genError = e.message;
		} finally {
			generating = false;
		}
	}

	async function sendChatMessage() {
		const text = chatInput.trim();
		if (!text || !exerciseId) return;
		chatInput = '';
		chatError = '';
		chatLoading = true;

		const userMsg: ChatMessage = { role: 'user', text };
		chatMessages = [...chatMessages, userMsg];
		scrollChat();

		try {
			const res = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ exerciseId, messages: chatMessages, profileId: data.profile.id })
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json.message ?? 'Fehler');

			const assistantMsg: ChatMessage = { role: 'assistant', text: json.reply };
			chatMessages = [...chatMessages, assistantMsg];

			if (json.exercisesUpdated) {
				generatedContent = json.reply;
			}
		} catch (e: any) {
			chatError = e.message;
			chatMessages = chatMessages.slice(0, -1);
		} finally {
			chatLoading = false;
			scrollChat();
		}
	}

	function scrollChat() {
		setTimeout(() => chatContainer?.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' }), 50);
	}

	function handleChatKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendChatMessage();
		}
	}

	function downloadPdf() {
		if (!exerciseId) return;
		window.open(`/api/pdf?exerciseId=${exerciseId}`, '_blank');
	}
</script>

<main class="max-w-2xl mx-auto px-4 py-10">
	<a href="/" class="text-sm text-blue-500 hover:underline mb-6 inline-block">← Profilauswahl</a>

	<h1 class="text-3xl font-bold text-gray-800 mb-1">Aufgaben generieren</h1>
	<p class="text-gray-500 mb-8">
		Profil: <strong>{data.profile.name}</strong> · {data.profile.school_type} Klasse {data.profile
			.grade} · {data.profile.state}
	</p>

	<!-- Generation form -->
	<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
		<div>
			<label class="block text-sm font-medium text-gray-700 mb-1" for="subject">Fach</label>
			<input
				id="subject"
				bind:value={subject}
				type="text"
				placeholder="z.B. Mathematik"
				disabled={!!exerciseId}
				class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400"
			/>
		</div>

		<div>
			<label class="block text-sm font-medium text-gray-700 mb-1" for="topic">
				Thema / Was kommt in der Schulaufgabe dran?
			</label>
			<textarea
				id="topic"
				bind:value={topic}
				rows="3"
				placeholder="z.B. Bruchrechnung, gemischte Aufgaben"
				disabled={!!exerciseId}
				class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none disabled:bg-gray-50 disabled:text-gray-400"
			></textarea>
		</div>

		<div>
			<label class="block text-sm font-medium text-gray-700 mb-1" for="teacher-notes">
				Hinweis vom Lehrer (optional)
			</label>
			<input
				id="teacher-notes"
				bind:value={teacherNotes}
				type="text"
				placeholder="z.B. Besonders auf Vorzeichen achten"
				disabled={!!exerciseId}
				class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400"
			/>
		</div>

		<div class="flex gap-4">
			<div class="flex-1">
				<label class="block text-sm font-medium text-gray-700 mb-1" for="count">Anzahl Aufgaben</label>
				<input
					id="count"
					bind:value={count}
					type="number"
					min="1"
					max="20"
					disabled={!!exerciseId}
					class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400"
				/>
			</div>
			<div class="flex-1">
				<label class="block text-sm font-medium text-gray-700 mb-1" for="difficulty">Schwierigkeitsgrad</label>
				<select
					id="difficulty"
					bind:value={difficulty}
					disabled={!!exerciseId}
					class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400"
				>
					<option value="leicht">Leicht</option>
					<option value="mittel">Mittel</option>
					<option value="schwer">Schwer</option>
				</select>
			</div>
		</div>

		<div>
			<label class="flex items-center justify-between mb-1">
				<span class="text-sm font-medium text-gray-700">Bearbeitungszeit</span>
				<label class="flex items-center gap-2 cursor-pointer select-none">
					<span class="text-xs text-gray-400">Stoppuhr</span>
					<div class="relative">
						<input type="checkbox" bind:checked={stopwatchEnabled} disabled={!!exerciseId} class="sr-only peer" />
						<div class="w-8 h-5 bg-gray-200 rounded-full peer-checked:bg-blue-500 transition-colors"></div>
						<div class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-3"></div>
					</div>
				</label>
			</label>
			{#if stopwatchEnabled}
				<div class="flex items-center gap-2">
					<input
						type="number"
						bind:value={durationMinutes}
						min="5"
						max="180"
						step="5"
						disabled={!!exerciseId}
						class="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400"
					/>
					<span class="text-sm text-gray-500">Minuten</span>
				</div>
			{:else}
				<p class="text-sm text-gray-400">Keine Stoppuhr</p>
			{/if}
		</div>

		<div>
			<label class="block text-sm font-medium text-gray-700 mb-2">
				Schulbuch-Fotos / Arbeitsblätter (optional)
			</label>
			<FileUpload bind:files={sourceFiles} disabled={!!exerciseId} label="Dateien auswählen" />
		</div>

		{#if genError}
			<p class="text-red-500 text-sm">{genError}</p>
		{/if}

		{#if !exerciseId}
			<button
				onclick={generate}
				disabled={generating}
				class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-xl transition-colors"
			>
				{generating ? 'Aufgaben werden generiert…' : 'Aufgaben generieren'}
			</button>
		{:else}
			<button
				onclick={() => { exerciseId = null; generatedContent = ''; chatMessages = []; sourceFiles = []; }}
				class="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium py-2 rounded-xl transition-colors text-sm"
			>
				Neu generieren
			</button>
		{/if}
	</div>

	<!-- Result + Chat -->
	{#if generatedContent}
		<div class="mt-8 space-y-4">
			<!-- Exercise preview -->
			<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
				<h2 class="text-xl font-semibold text-gray-800 mb-4">Generierte Aufgaben</h2>
				<div class="prose prose-sm max-w-none text-gray-700 bg-gray-50 rounded-lg p-4 overflow-auto max-h-80">
					{@html generatedHtml}
				</div>

				<!-- Feedback -->
				<div class="mt-4 pt-4 border-t border-gray-100">
						<FeedbackWidget type="generation" refId={exerciseId ?? ''} profileId={data.profile.id} />
					</div>

					<!-- Mode selection -->
				{#if solveMode === 'none'}
					<p class="text-sm text-gray-500 mt-5 mb-3 font-medium">Wie möchtest du die Aufgaben lösen?</p>
					<div class="flex gap-3">
						<button
							onclick={startBrowserMode}
							class="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl transition-colors"
						>
							<span>💻</span> Im Browser lösen
						</button>
						<button
							onclick={() => { solveMode = 'paper'; downloadPdf(); }}
							class="flex-1 flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-900 text-white font-semibold py-2.5 rounded-xl transition-colors"
						>
							<span>🖨️</span> Auf Papier lösen
						</button>
					</div>
				{:else}
					<!-- Stoppuhr -->
					{#if stopwatchEnabled}
						<div class="mt-5 pt-4 border-t border-gray-100">
							<p class="text-xs text-gray-400 mb-2">Stoppuhr</p>
							<Stopwatch bind:this={stopwatch} {durationSeconds} />
						</div>
					{/if}
					<div class="flex gap-2 mt-4">
						<button
							onclick={() => solveMode = 'none'}
							class="text-xs text-gray-400 hover:text-gray-600 underline"
						>
							Auswahl ändern
						</button>
						{#if solveMode === 'paper'}
							<span class="text-xs text-gray-400">·</span>
							<button onclick={downloadPdf} class="text-xs text-gray-400 hover:text-gray-600 underline">
								PDF erneut öffnen
							</button>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Browser solve mode -->
			{#if solveMode === 'browser' && parsedExercises.length > 0}
				<div class="bg-white rounded-2xl shadow-sm border border-blue-100 overflow-hidden">
					<div class="px-6 py-4 border-b border-blue-100 bg-blue-50">
						<h3 class="font-semibold text-gray-800 text-sm">Aufgaben lösen</h3>
						<p class="text-xs text-gray-500 mt-0.5">Trag deine Antworten ein und klick auf „Korrektur starten".</p>
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

				{#if correctionResult}
					<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
						<h2 class="text-xl font-semibold text-gray-800 mb-4">Korrektur-Ergebnis</h2>
						<div class="prose prose-sm max-w-none bg-gray-50 rounded-lg p-4 overflow-auto">
							{@html correctionHtml}
						</div>
					</div>
				{/if}
			{/if}

			<!-- Paper mode: link to upload scan -->
			{#if solveMode === 'paper'}
				<div class="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-4">
					<span class="text-2xl">📋</span>
					<div class="flex-1">
						<p class="text-sm font-semibold text-amber-800">Auf Papier gelöst?</p>
						<p class="text-xs text-amber-600">Fotografiere deine Lösung und lade sie zur Korrektur hoch.</p>
					</div>
					<a
						href="/korrigieren?aufgabe={exerciseId}"
						class="shrink-0 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
					>
						Lösung einreichen
					</a>
				</div>
			{/if}

			<!-- Chat -->
			<div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
				<div class="px-6 py-4 border-b border-gray-100 bg-blue-50">
					<h3 class="font-semibold text-gray-800 text-sm">Fragen &amp; Anpassungen</h3>
					<p class="text-xs text-gray-500 mt-0.5">
						Frag nach unbekannten Begriffen oder bitte um Änderungen – z.B. „Mach Aufgabe 3 leichter" oder „Was ist ein Bruch?"
					</p>
				</div>

				{#if chatMessages.length > 0}
					<div bind:this={chatContainer} class="px-6 py-4 space-y-3 max-h-72 overflow-y-auto">
						{#each chatMessages as msg}
							<div class={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
								<div class="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap {msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}">
									{msg.text}
								</div>
							</div>
						{/each}
						{#if chatLoading}
							<div class="flex justify-start">
								<div class="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-2.5">
									<span class="text-gray-400 text-sm">Denkt nach…</span>
								</div>
							</div>
						{/if}
					</div>
				{/if}

				<div class="px-4 py-3 border-t border-gray-100 flex gap-2">
					<textarea
						bind:value={chatInput}
						onkeydown={handleChatKey}
						rows="2"
						placeholder="Frage stellen oder Änderung wünschen…"
						disabled={chatLoading}
						class="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none disabled:bg-gray-50"
					></textarea>
					<button
						onclick={sendChatMessage}
						disabled={chatLoading || !chatInput.trim()}
						class="self-end bg-blue-600 hover:bg-blue-700 disabled:bg-blue-200 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
					>
						Senden
					</button>
				</div>
				{#if chatError}
					<p class="px-4 pb-3 text-red-500 text-xs">{chatError}</p>
				{/if}
			</div>
		</div>
	{/if}
</main>
