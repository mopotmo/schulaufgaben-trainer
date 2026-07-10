<script lang="ts">
	import type { PageData } from './$types';
	import FileUpload from '$lib/components/FileUpload.svelte';
	import FeedbackWidget from '$lib/components/FeedbackWidget.svelte';
	import Stopwatch from '$lib/components/Stopwatch.svelte';
	import DrawCanvas from '$lib/components/DrawCanvas.svelte';
	import { parseExercises } from '$lib/parseExercises';
	import { renderMath } from '$lib/renderMath';
	import { marked } from 'marked';
	import 'katex/dist/katex.min.css';
	let { data }: { data: PageData } = $props();

	type Point = { x: number; y: number; p: number };
	type Stroke = Point[];
	type Mode = 'text' | 'draw';

	// Generation form
	let subject = $state(data.prefill?.subject ?? '');
	let topic = $state(data.prefill?.topic ?? '');
	let teacherNotes = $state('');
	let book = $state('');
	let bookId = $state('');
	let selectedChapters = $state<number[]>([]);
	let customRangeEnabled = $state(false);
	let customPageFrom = $state<number | null>(null);
	let customPageTo = $state<number | null>(null);
	let selectedBook = $derived(data.books.find((b) => b.id === bookId) ?? null);
	// Claude akzeptiert max. 100 PDF-Seiten pro Request
	const MAX_BOOK_PAGES = 100;
	let bookRanges = $derived.by(() => {
		if (!selectedBook) return [];
		const ranges: { from: number; to: number; title: string }[] = [];
		for (const i of selectedChapters) {
			const chapter = selectedBook.chapters?.[i];
			if (chapter) ranges.push({ from: chapter.pageStart, to: chapter.pageEnd, title: chapter.title });
		}
		if (customRangeEnabled && customPageFrom && customPageTo && customPageFrom <= customPageTo) {
			ranges.push({ from: customPageFrom, to: customPageTo, title: '' });
		}
		return ranges;
	});
	let totalBookPages = $derived(bookRanges.reduce((sum, r) => sum + (r.to - r.from + 1), 0));
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
	let modes = $state<Mode[]>([]);
	let drawings = $state<Stroke[][]>([]);
	let canvasRefs = $state<(DrawCanvas | null)[]>([]);
	let showGrade = $state(false);
	let submitting = $state(false);
	let submitError = $state('');
	let correctionResult = $state('');
	let correctionHtml = $derived(correctionResult ? renderMath(marked(correctionResult) as string) : '');
	let generatedHtml = $derived(generatedContent ? renderMath(marked(generatedContent) as string) : '');

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
		let savedAnswers: string[] = [];
		let savedModes: Mode[] = [];
		let savedDrawings: Stroke[][] = [];
		if (saved) {
			const parsed = JSON.parse(saved);
			if (Array.isArray(parsed)) {
				// Legacy format: plain array of text answers.
				savedAnswers = parsed;
			} else {
				savedAnswers = parsed.answers ?? [];
				savedModes = parsed.modes ?? [];
				savedDrawings = parsed.drawings ?? [];
			}
		}
		const n = parsedExercises.length;
		answers = Array.from({ length: n }, (_, i) => savedAnswers[i] ?? '');
		modes = Array.from({ length: n }, (_, i) => savedModes[i] ?? 'text');
		drawings = Array.from({ length: n }, (_, i) => savedDrawings[i] ?? []);
		correctionResult = '';
		submitError = '';
	}

	function hasContent(i: number): boolean {
		return modes[i] === 'draw' ? (drawings[i]?.length ?? 0) > 0 : !!answers[i]?.trim();
	}

	function setAllModes(m: Mode) {
		modes = parsedExercises.map(() => m);
	}

	let allDraw = $derived(modes.length > 0 && modes.every((m) => m === 'draw'));

	// Persist answers to localStorage on every change
	$effect(() => {
		if (solveMode === 'browser' && draftKey && answers.length > 0) {
			localStorage.setItem(draftKey, JSON.stringify({ answers, modes, drawings }));
		}
	});

	// Warn before leaving if answers are in progress
	$effect(() => {
		const anyContent =
			solveMode === 'browser' && parsedExercises.some((_, i) => hasContent(i));
		function handleBeforeUnload(e: BeforeUnloadEvent) {
			if (anyContent && !correctionResult) {
				e.preventDefault();
			}
		}
		window.addEventListener('beforeunload', handleBeforeUnload);
		return () => window.removeEventListener('beforeunload', handleBeforeUnload);
	});


	async function submitAnswers() {
		if (!exerciseId) return;
		if (parsedExercises.some((_, i) => !hasContent(i))) {
			submitError = 'Bitte alle Aufgaben beantworten (tippen oder zeichnen).';
			return;
		}
		submitError = '';
		submitting = true;
		correctionResult = '';

		// Build per-exercise answer metadata; drawings go as image files in order.
		const meta: { title: string; kind: Mode; text?: string }[] = [];
		const files: File[] = [];
		for (let i = 0; i < parsedExercises.length; i++) {
			const title = parsedExercises[i].title;
			if (modes[i] === 'draw') {
				const blob = await canvasRefs[i]?.toBlob();
				if (blob) {
					files.push(new File([blob], `aufgabe-${i + 1}.png`, { type: 'image/png' }));
					meta.push({ title, kind: 'draw' });
				}
			} else {
				meta.push({ title, kind: 'text', text: answers[i] });
			}
		}

		const form = new FormData();
		form.append('exerciseId', exerciseId);
		form.append('answersMeta', JSON.stringify(meta));
		form.append('showGrade', String(showGrade));
		for (const f of files) form.append('solutionFiles', f);

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
		form.append('book', book);
		if (selectedBook) {
			if (bookRanges.length === 0) {
				genError = 'Bitte mindestens ein Kapitel oder einen gültigen Seitenbereich für das Buch wählen.';
				generating = false;
				return;
			}
			if (totalBookPages > MAX_BOOK_PAGES) {
				genError = `Maximal ${MAX_BOOK_PAGES} Buchseiten pro Generierung – bitte weniger Kapitel auswählen (aktuell ${totalBookPages}).`;
				generating = false;
				return;
			}
			form.append('bookId', selectedBook.id);
			form.append('bookRanges', JSON.stringify(bookRanges));
		}
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

		{#if data.books.length > 0}
			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1" for="book-select">
					Hinterlegtes Buch (optional)
				</label>
				<select
					id="book-select"
					bind:value={bookId}
					onchange={() => { selectedChapters = []; customRangeEnabled = false; customPageFrom = null; customPageTo = null; }}
					disabled={!!exerciseId}
					class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400"
				>
					<option value="">– kein Buch –</option>
					{#each data.books as b}
						<option value={b.id}>{b.subject} {b.grade} · {b.title}</option>
					{/each}
				</select>

				{#if selectedBook}
					<div class="mt-2 border border-gray-200 rounded-lg p-3 space-y-2">
						{#if selectedBook.chapters && selectedBook.chapters.length > 0}
							{#each selectedBook.chapters as chapter, i}
								<label class="flex items-center gap-2 cursor-pointer select-none">
									<input
										type="checkbox"
										value={i}
										bind:group={selectedChapters}
										disabled={!!exerciseId}
										class="rounded border-gray-300 text-blue-600 focus:ring-blue-300"
									/>
									<span class="text-sm text-gray-700 flex-1">{chapter.title}</span>
									<span class="text-xs text-gray-400 shrink-0">S. {chapter.pageStart}–{chapter.pageEnd}</span>
								</label>
							{/each}
						{/if}

						<label class="flex items-center gap-2 cursor-pointer select-none">
							<input
								type="checkbox"
								bind:checked={customRangeEnabled}
								disabled={!!exerciseId}
								class="rounded border-gray-300 text-blue-600 focus:ring-blue-300"
							/>
							<span class="text-sm text-gray-700">Eigener Seitenbereich</span>
						</label>

						{#if customRangeEnabled}
							<div class="flex items-center gap-2 pl-6">
								<input
									type="number"
									bind:value={customPageFrom}
									min="1"
									placeholder="von"
									disabled={!!exerciseId}
									aria-label="Seite von"
									class="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400"
								/>
								<span class="text-sm text-gray-400">bis</span>
								<input
									type="number"
									bind:value={customPageTo}
									min="1"
									placeholder="bis"
									disabled={!!exerciseId}
									aria-label="Seite bis"
									class="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400"
								/>
								<span class="text-xs text-gray-400">gedruckte Seitenzahlen</span>
							</div>
						{/if}
					</div>
					<p class="text-xs mt-1 {totalBookPages > MAX_BOOK_PAGES ? 'text-red-500' : 'text-gray-400'}">
						{#if totalBookPages > 0}
							{totalBookPages} Seiten ausgewählt (max. {MAX_BOOK_PAGES}) – sie dienen direkt als Vorlage für die Aufgaben.
						{:else}
							Kapitel auswählen – die Seiten dienen direkt als Vorlage für die Aufgaben.
						{/if}
					</p>
				{/if}
			</div>
		{/if}

		<div>
			<label class="block text-sm font-medium text-gray-700 mb-1" for="book">
				Lehrbuch / Quelle (optional)
			</label>
			<input
				id="book"
				bind:value={book}
				type="text"
				placeholder="z.B. Mathematik 8, Bayern, Cornelsen"
				disabled={!!exerciseId}
				class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400"
			/>
			<p class="text-xs text-gray-400 mt-1">
				Der Trainer recherchiert dazu im Internet, um passendere Aufgaben zu erstellen.
			</p>
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
						<div class="flex items-start justify-between gap-3">
							<div>
								<h3 class="font-semibold text-gray-800 text-sm">Aufgaben lösen</h3>
								<p class="text-xs text-gray-500 mt-0.5">Tippe deine Antworten oder schreib sie pro Aufgabe mit dem Stift, dann klick auf „Korrektur starten".</p>
							</div>
							<!-- Global toggle: switch the whole sheet to typing or stylus at once -->
							<button
								type="button"
								onclick={() => setAllModes(allDraw ? 'text' : 'draw')}
								class="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors {allDraw ? 'border-blue-200 text-blue-600 bg-white hover:bg-blue-50' : 'border-blue-500 bg-blue-500 text-white hover:bg-blue-600'}"
							>
								{allDraw ? '⌨ Ganzes Blatt tippen' : '✏️ Ganzes Blatt mit Stift'}
							</button>
						</div>
					</div>

					<div class="p-6 space-y-6">
						{#each parsedExercises as ex, i}
							<div>
								<div class="flex items-start justify-between gap-3 mb-1">
									<p class="text-sm font-semibold text-gray-800">{ex.title}</p>
									<!-- Per-exercise input toggle: type or draw with a stylus -->
									<div class="flex rounded-lg border border-gray-200 overflow-hidden shrink-0 text-xs">
										<button
											type="button"
											onclick={() => (modes[i] = 'text')}
											class="px-2.5 py-1 transition-colors {modes[i] === 'text' ? 'bg-blue-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}"
										>
											⌨ Tippen
										</button>
										<button
											type="button"
											onclick={() => (modes[i] = 'draw')}
											class="px-2.5 py-1 transition-colors {modes[i] === 'draw' ? 'bg-blue-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}"
										>
											✏️ Zeichnen
										</button>
									</div>
								</div>
								{#if ex.body}
									<div class="prose prose-sm max-w-none text-gray-600 mb-2">{@html renderMath(marked(ex.body) as string)}</div>
								{/if}
								{#if modes[i] === 'draw'}
									<DrawCanvas bind:this={canvasRefs[i]} bind:strokes={drawings[i]} />
								{:else}
									<textarea
										bind:value={answers[i]}
										rows="3"
										placeholder="Deine Antwort…"
										class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-y"
									></textarea>
								{/if}
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
