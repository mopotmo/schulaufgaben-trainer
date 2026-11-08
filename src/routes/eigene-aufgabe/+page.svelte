<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { renderMarkdown } from '$lib/renderMarkdown';
	import 'katex/dist/katex.min.css';
	import FileUpload from '$lib/components/FileUpload.svelte';
	import AiNotice from '$lib/components/AiNotice.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	type Step = 'erfassen' | 'pruefen' | 'fertig';
	let step = $state<Step>('erfassen');

	// Erfassen
	let files = $state<File[]>([]);
	let material = $state<File[]>([]);
	let showMaterial = $state(false);
	let text = $state('');
	let reading = $state(false);
	let readError = $state('');

	// Prüfen
	let exerciseId = $state('');
	let content = $state('');
	let subject = $state('');
	let topic = $state('');
	let taskKind = $state<'structured' | 'free_text'>('structured');
	let solutionOnSheet = $state(false);
	let solutionTranscript = $state('');
	let unreadable = $state<string[]>([]);
	let filesSaved = $state(true);
	let preview = $state(true);
	let saving = $state(false);
	let previewHtml = $derived(content ? renderMarkdown(content) : '');

	async function erfassen() {
		reading = true;
		readError = '';
		try {
			const body = new FormData();
			body.append('profileId', data.profile.id);
			body.append('text', text);
			for (const f of files) body.append('files', f);
			for (const f of material) body.append('material', f);
			const res = await fetch('/api/aufgabe-erfassen', { method: 'POST', body });
			const json = await res.json();
			if (!res.ok) throw new Error(json.message ?? 'Fehler beim Lesen');

			exerciseId = json.exerciseId;
			content = json.content;
			subject = json.subject;
			topic = json.topic;
			taskKind = json.taskKind;
			solutionOnSheet = json.solutionOnSheet;
			solutionTranscript = json.solutionTranscript;
			unreadable = json.unreadable;
			filesSaved = json.filesSaved;
			preview = unreadable.length === 0;
			step = 'pruefen';
		} catch (e) {
			readError = e instanceof Error ? e.message : 'Fehler beim Lesen';
		} finally {
			reading = false;
		}
	}

	const input =
		'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300';
</script>

<main class="max-w-2xl mx-auto px-4 py-10">
	<a href="/" class="text-sm text-blue-500 hover:underline mb-6 inline-block">← Profilauswahl</a>

	<h1 class="text-3xl font-bold text-gray-800 mb-1">Eigene Aufgabe</h1>
	<p class="text-gray-500 mb-8">
		{data.profile.avatar ?? ''} {data.profile.name} · Hausaufgabe, Arbeitsblatt oder Buchseite korrigieren lassen
	</p>

	{#if step === 'erfassen'}
		<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
			<div>
				<h2 class="text-lg font-semibold text-gray-800 mb-1">1. Aufgabe fotografieren</h2>
				<p class="text-sm text-gray-600 mb-3">
					Ein Foto pro Seite. Hast du die Aufgabe schon gelöst, fotografiere sie einfach mit deiner
					Lösung. Namen und Schule werden beim Abschreiben weggelassen.
				</p>
				<FileUpload bind:files disabled={reading} label="Fotos oder PDF auswählen" />
			</div>

			<div>
				{#if showMaterial || material.length}
					<h3 class="text-sm font-medium text-gray-700 mb-1">Material zur Aufgabe <span class="text-gray-400 font-normal">(optional)</span></h3>
					<p class="text-sm text-gray-600 mb-3">
						Was zur Aufgabe gehört, aber nicht auf dem Blatt steht: das Bild zur Bildbeschreibung,
						der Text zur Inhaltsangabe oder die Lösungen hinten im Buch. Wird nicht abgeschrieben,
						hilft aber bei der Korrektur.
					</p>
					<FileUpload bind:files={material} disabled={reading} label="Material auswählen" />
				{:else}
					<button type="button" onclick={() => (showMaterial = true)} class="text-sm text-blue-600 hover:underline">
						+ Material zur Aufgabe hinzufügen (Bild, Text, Lösungen aus dem Buch)
					</button>
				{/if}
			</div>

			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1" for="text">
					Oder die Aufgabe eintippen <span class="text-gray-400 font-normal">(optional)</span>
				</label>
				<textarea
					id="text"
					bind:value={text}
					rows="4"
					disabled={reading}
					placeholder="z. B. „Buch S. 54 Nr. 3: Berechne …“"
					class={input}
				></textarea>
			</div>

			{#if readError}
				<p class="text-sm text-red-500">{readError}</p>
			{/if}

			<button
				onclick={erfassen}
				disabled={reading || (files.length === 0 && !text.trim())}
				class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-xl transition-colors"
			>
				{reading ? 'Der Trainer liest die Aufgabe …' : 'Aufgabe abschreiben lassen'}
			</button>
		</div>
	{:else if step === 'pruefen'}
		<form
			method="POST"
			action="?/speichern"
			use:enhance={() => {
				saving = true;
				return async ({ result, update }) => {
					saving = false;
					if (result.type === 'success') step = 'fertig';
					else await update({ reset: false });
				};
			}}
			class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5"
		>
			<input type="hidden" name="exerciseId" value={exerciseId} />
			<input type="hidden" name="taskKind" value={taskKind} />

			<div>
				<h2 class="text-lg font-semibold text-gray-800 mb-1">2. Abschrift prüfen</h2>
				<AiNotice kind="transcript" class="mb-3" />

				{#if unreadable.length}
					<div class="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 mb-3">
						<p class="font-medium mb-1">Das konnte der Trainer nicht sicher lesen (im Text mit [?] markiert):</p>
						<ul class="list-disc pl-5">
							{#each unreadable as u}<li>{u}</li>{/each}
						</ul>
					</div>
				{/if}
				{#if !filesSaved}
					<p class="text-sm text-amber-700 mb-3">
						Die Fotos konnten nicht gespeichert werden. Die Abschrift ist da, für die Korrektur musst du
						deine Lösung aber neu hochladen.
					</p>
				{/if}

				<div class="flex gap-2 mb-2 text-sm">
					<button type="button" onclick={() => (preview = true)} class="px-3 py-1 rounded-lg {preview ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}">Ansicht</button>
					<button type="button" onclick={() => (preview = false)} class="px-3 py-1 rounded-lg {!preview ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}">Bearbeiten</button>
				</div>
				{#if preview}
					<div class="prose prose-sm max-w-none border border-gray-100 rounded-xl px-4 py-3">{@html previewHtml}</div>
					<input type="hidden" name="content" value={content} />
				{:else}
					<textarea name="content" bind:value={content} rows="14" class="{input} font-mono"></textarea>
				{/if}
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1" for="subject">Fach</label>
					<input id="subject" name="subject" bind:value={subject} list="bisherige-faecher" required class={input} />
					<datalist id="bisherige-faecher">
						{#each data.subjects as s}<option value={s}></option>{/each}
					</datalist>
				</div>
				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1" for="topic">Thema</label>
					<input id="topic" name="topic" bind:value={topic} required class={input} />
				</div>
			</div>

			<fieldset>
				<legend class="block text-sm font-medium text-gray-700 mb-1">Art der Aufgabe</legend>
				<div class="flex flex-col gap-1 text-sm text-gray-700">
					<label class="flex gap-2"><input type="radio" bind:group={taskKind} value="structured" /> Aufgaben mit fester Lösung (Rechnen, Lücken, Fragen)</label>
					<label class="flex gap-2"><input type="radio" bind:group={taskKind} value="free_text" /> Freier Text (Aufsatz, Erörterung, Übersetzung)</label>
				</div>
			</fieldset>

			{#if solutionOnSheet}
				<div class="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-800">
					Deine Lösung steht schon auf dem Foto.
					{#if solutionTranscript}
						So hat der Trainer deinen Text gelesen. Berichtige nur Lesefehler, nicht deine eigenen
						Fehler — sonst kann er sie nicht finden.
					{/if}
				</div>
				{#if solutionTranscript}
					<textarea bind:value={solutionTranscript} rows="10" class={input} aria-label="Gelesener Lösungstext"></textarea>
				{/if}
			{/if}

			{#if form?.error}
				<p class="text-sm text-red-500">{form.error}</p>
			{/if}

			<button
				type="submit"
				disabled={saving}
				class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-xl transition-colors"
			>
				{saving ? 'Wird gespeichert …' : 'Abschrift stimmt so'}
			</button>
		</form>
	{:else}
		<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
			<h2 class="text-lg font-semibold text-gray-800">3. Lösung einreichen</h2>
			<p class="text-sm text-gray-600">Die Aufgabe ist gespeichert und steht auch in der Übungshistorie.</p>
			<a
				href="/korrigieren?aufgabe={exerciseId}"
				class="block text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl transition-colors"
			>
				Lösung einreichen
			</a>
		</div>
	{/if}
</main>
