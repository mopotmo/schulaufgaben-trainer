<script lang="ts">
	import type { PageData } from './$types';
	import { marked } from 'marked';
	import { renderMath } from '$lib/renderMath';
	import 'katex/dist/katex.min.css';
	import FileUpload from '$lib/components/FileUpload.svelte';
	import FeedbackWidget from '$lib/components/FeedbackWidget.svelte';

	let { data }: { data: PageData } = $props();

	let selectedExerciseId = $state(data.exercise?.id ?? '');
	let solutionFiles = $state<File[]>([]);
	let showGrade = $state(false);

	let loading = $state(false);
	let correctionResult = $state('');
	let correctionHtml = $derived(correctionResult ? renderMath(marked(correctionResult) as string) : '');
	let error = $state('');

	// Nachschärfen
	type NachschaerpenMode = 'weak_areas' | 'easier' | 'harder';
	let nachschaerpenLoading = $state(false);
	let nachschaerpenError = $state('');
	let newExerciseId = $state<string | null>(null);
	let newContent = $state('');
	let newContentHtml = $derived(newContent ? renderMath(marked(newContent) as string) : '');

	async function nachschaerpen(mode: NachschaerpenMode) {
		if (!selectedExerciseId || !correctionResult) return;
		nachschaerpenLoading = true;
		nachschaerpenError = '';
		newExerciseId = null;
		newContent = '';

		try {
			const res = await fetch('/api/nachschaerfen', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ exerciseId: selectedExerciseId, correctionResult, mode })
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json.message ?? 'Fehler');
			newExerciseId = json.exerciseId;
			newContent = json.content;
		} catch (e: any) {
			nachschaerpenError = e.message;
		} finally {
			nachschaerpenLoading = false;
		}
	}

	// Chat
	type ChatMessage = { role: 'user' | 'assistant'; text: string };
	let chatMessages = $state<ChatMessage[]>([]);
	let chatInput = $state('');
	let chatLoading = $state(false);
	let chatError = $state('');
	let chatContainer = $state<HTMLDivElement | null>(null);
	let chatHtml = $derived(
		chatMessages.map((m) => ({
			...m,
			html: m.role === 'assistant' ? renderMath(marked(m.text) as string) : null
		}))
	);

	async function submit() {
		if (!selectedExerciseId || solutionFiles.length === 0) {
			error = 'Bitte Aufgabe auswählen und mindestens eine Datei hochladen.';
			return;
		}
		error = '';
		loading = true;
		correctionResult = '';
		chatMessages = [];

		const form = new FormData();
		form.append('exerciseId', selectedExerciseId);
		form.append('showGrade', String(showGrade));
		for (const file of solutionFiles) form.append('solutionFiles', file);

		try {
			const res = await fetch('/api/korrigieren', { method: 'POST', body: form });
			const json = await res.json();
			if (!res.ok) throw new Error(json.message ?? 'Fehler bei der Korrektur');
			correctionResult = json.result;
		} catch (e: any) {
			error = e.message;
		} finally {
			loading = false;
		}
	}

	async function sendChatMessage() {
		const text = chatInput.trim();
		if (!text || !selectedExerciseId) return;
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
				body: JSON.stringify({
					exerciseId: selectedExerciseId,
					messages: chatMessages,
					correctionResult,
					profileId: exercise?.profile_id
				})
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json.message ?? 'Fehler');
			chatMessages = [...chatMessages, { role: 'assistant', text: json.reply }];
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

	const exercise = $derived(
		data.exercise ?? (data.exercises?.find((e) => e.id === selectedExerciseId) ?? null)
	);
</script>

<main class="max-w-2xl mx-auto px-4 py-10">
	<a href="/" class="text-sm text-blue-500 hover:underline mb-6 inline-block">← Profilauswahl</a>

	<h1 class="text-3xl font-bold text-gray-800 mb-1">Lösung korrigieren</h1>
	<p class="text-gray-500 mb-8">
		Lade Fotos oder PDFs deiner handgeschriebenen Lösung hoch – auch mehrere Seiten möglich.
	</p>

	<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
		{#if data.exercises}
			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1" for="exercise-select">
					Zu welcher Aufgabe gehört die Lösung?
				</label>
				<select
					id="exercise-select"
					bind:value={selectedExerciseId}
					class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
				>
					<option value="">— Aufgabe wählen —</option>
					{#each data.exercises as ex}
						<option value={ex.id}>
							{ex.subject} – {ex.topic} ({new Date(ex.created_at).toLocaleDateString('de-DE')})
						</option>
					{/each}
				</select>
			</div>
		{:else if exercise}
			<div class="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
				<strong>{exercise.subject}</strong> – {exercise.topic}
			</div>
		{/if}

		<div>
			<label class="block text-sm font-medium text-gray-700 mb-2">Fotos / Scans der Lösung</label>
			<FileUpload bind:files={solutionFiles} label="Dateien auswählen" />
			<p class="text-xs text-gray-400 mt-1.5">
				Tipp: Gute Beleuchtung und scharfe Aufnahme verbessern die Korrekturqualität.
			</p>
		</div>

		<label class="flex items-center gap-3 cursor-pointer select-none">
			<div class="relative">
				<input type="checkbox" bind:checked={showGrade} class="sr-only peer" />
				<div class="w-10 h-6 bg-gray-200 rounded-full peer-checked:bg-blue-500 transition-colors"></div>
				<div class="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4"></div>
			</div>
			<span class="text-sm text-gray-700">Note anzeigen <span class="text-gray-400">(bayerischer Gymnasium-Schlüssel)</span></span>
		</label>

		{#if error}
			<p class="text-red-500 text-sm">{error}</p>
		{/if}

		<button
			onclick={submit}
			disabled={loading}
			class="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold py-2.5 rounded-xl transition-colors"
		>
			{#if loading}
				Korrektur läuft… ({solutionFiles.length} {solutionFiles.length === 1 ? 'Datei' : 'Dateien'})
			{:else}
				Korrektur starten
			{/if}
		</button>
	</div>

	{#if correctionResult}
		<div class="mt-8 space-y-4">
			<!-- Correction result -->
			<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
				<h2 class="text-xl font-semibold text-gray-800 mb-4">Korrektur-Ergebnis</h2>
				<div class="prose prose-sm max-w-none bg-gray-50 rounded-lg p-4 overflow-auto">
					{@html correctionHtml}
				</div>
				<div class="mt-4 pt-4 border-t border-gray-100">
					<FeedbackWidget type="correction" refId={selectedExerciseId} profileId={exercise?.profile_id ?? ''} />
				</div>
				{#if exercise}
					<div class="mt-5 pt-5 border-t border-gray-100 space-y-4">
						<!-- Nachschärfen -->
						<div>
							<p class="text-sm font-medium text-gray-700 mb-2">Weiter üben:</p>
							<div class="flex gap-2 flex-wrap">
								<button
									onclick={() => nachschaerpen('weak_areas')}
									disabled={nachschaerpenLoading}
									class="text-sm bg-orange-500 hover:bg-orange-600 disabled:bg-orange-200 text-white font-medium px-4 py-2 rounded-xl transition-colors"
								>
									🎯 Schwache Stellen üben
								</button>
								<button
									onclick={() => nachschaerpen('easier')}
									disabled={nachschaerpenLoading}
									class="text-sm bg-green-500 hover:bg-green-600 disabled:bg-green-200 text-white font-medium px-4 py-2 rounded-xl transition-colors"
								>
									🌱 Leichtere Aufgaben
								</button>
								<button
									onclick={() => nachschaerpen('harder')}
									disabled={nachschaerpenLoading}
									class="text-sm bg-purple-500 hover:bg-purple-600 disabled:bg-purple-200 text-white font-medium px-4 py-2 rounded-xl transition-colors"
								>
									🚀 Schwerere Aufgaben
								</button>
								<a
									href="/generieren?profil={exercise.profile_id}"
									class="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-4 py-2 rounded-xl transition-colors"
								>
									Neues Thema
								</a>
							</div>
							{#if nachschaerpenLoading}
								<p class="text-sm text-gray-400 mt-3">Neue Aufgaben werden generiert…</p>
							{/if}
							{#if nachschaerpenError}
								<p class="text-sm text-red-500 mt-2">{nachschaerpenError}</p>
							{/if}
						</div>
					</div>
				{/if}
			</div>

			<!-- Nachschärfen result -->
			{#if newContent}
				<div class="bg-white rounded-2xl shadow-sm border border-orange-100 overflow-hidden">
					<div class="px-6 py-4 border-b border-orange-100 bg-orange-50">
						<h3 class="font-semibold text-gray-800 text-sm">Neue Aufgaben</h3>
					</div>
					<div class="p-6 space-y-4">
						<div class="text-gray-700 whitespace-pre-wrap font-mono text-sm bg-gray-50 rounded-lg p-4 overflow-auto max-h-80">
							{newContent}
						</div>
						<div class="flex gap-3">
							<a
								href="/api/pdf?exerciseId={newExerciseId}"
								target="_blank"
								class="flex-1 text-center bg-gray-800 hover:bg-gray-900 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
							>
								PDF öffnen / Drucken
							</a>
							<a
								href="/korrigieren?aufgabe={newExerciseId}"
								class="flex-1 text-center bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
							>
								Lösung einreichen →
							</a>
						</div>
					</div>
				</div>
			{/if}

			<!-- Chat -->
			<div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
				<div class="px-6 py-4 border-b border-gray-100 bg-green-50">
					<h3 class="font-semibold text-gray-800 text-sm">Nachfragen &amp; Rückmeldung</h3>
					<p class="text-xs text-gray-500 mt-0.5">
						Stell Fragen zur Korrektur, erkläre was du dir gedacht hast, oder bitte um eine andere Erklärung.
					</p>
				</div>

				{#if chatMessages.length > 0}
					<div bind:this={chatContainer} class="px-6 py-4 space-y-3 max-h-96 overflow-y-auto">
						{#each chatHtml as msg}
							<div class={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
								<div class="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm {msg.role === 'user' ? 'bg-green-600 text-white rounded-br-sm whitespace-pre-wrap' : 'bg-gray-100 text-gray-800 rounded-bl-sm prose prose-sm max-w-none'}">
									{#if msg.role === 'assistant' && msg.html}
										{@html msg.html}
									{:else}
										{msg.text}
									{/if}
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
						placeholder="z.B. 'Warum ist Aufgabe 2 falsch?' oder 'Ich dachte, man muss hier den Nenner anpassen...'"
						disabled={chatLoading}
						class="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 resize-none disabled:bg-gray-50"
					></textarea>
					<button
						onclick={sendChatMessage}
						disabled={chatLoading || !chatInput.trim()}
						class="self-end bg-green-600 hover:bg-green-700 disabled:bg-green-200 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
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
