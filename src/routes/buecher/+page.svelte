<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showUploadForm = $state(false);
	let uploading = $state(false);
	let expandedBook = $state<string | null>(null);

	function toggleChapters(id: string) {
		expandedBook = expandedBook === id ? null : id;
	}
</script>

<main class="max-w-2xl mx-auto px-4 py-10">
	<a href="/" class="text-sm text-blue-500 hover:underline mb-6 inline-block">← Profilauswahl</a>

	<h1 class="text-3xl font-bold text-gray-800 mb-1">Schulbücher</h1>
	<p class="text-gray-500 mb-8">
		Hinterlegte Bücher stehen beim Generieren als Quelle zur Verfügung – Claude nutzt dann direkt
		die Kapitelinhalte statt einer Websuche.
	</p>

	{#if form?.success}
		<div class="mb-6 bg-green-50 border border-green-200 rounded-2xl px-4 py-3 text-sm text-green-800">
			{form.success}
		</div>
	{/if}
	{#if form?.error}
		<div class="mb-6 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700">
			{form.error}
		</div>
	{/if}

	<!-- Upload -->
	{#if !showUploadForm}
		<button
			onclick={() => (showUploadForm = true)}
			class="w-full mb-8 bg-white rounded-2xl shadow-sm border-2 border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50 p-5 flex items-center justify-center gap-2 transition-colors text-gray-400 hover:text-blue-500"
		>
			<span class="text-2xl">＋</span>
			<span class="text-sm font-medium">Buch hochladen (PDF)</span>
		</button>
	{:else}
		<div class="mb-8 bg-white rounded-2xl shadow-sm border border-blue-100 p-6">
			<div class="flex items-center justify-between mb-4">
				<h2 class="font-semibold text-gray-800">Neues Buch</h2>
				<button onclick={() => (showUploadForm = false)} class="text-gray-300 hover:text-gray-500 text-xl leading-none">×</button>
			</div>

			<form
				method="POST"
				action="?/upload"
				enctype="multipart/form-data"
				use:enhance={() => {
					uploading = true;
					return ({ update }) => {
						uploading = false;
						update();
					};
				}}
				class="grid grid-cols-2 gap-3"
			>
				<div class="col-span-2">
					<label class="block text-xs font-medium text-gray-600 mb-1" for="b-title">Titel</label>
					<input
						id="b-title"
						name="title"
						type="text"
						required
						placeholder="z.B. Fokus Mathematik 8 – Bayern"
						class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
					/>
				</div>

				<div>
					<label class="block text-xs font-medium text-gray-600 mb-1" for="b-subject">Fach</label>
					<input
						id="b-subject"
						name="subject"
						type="text"
						required
						placeholder="z.B. Mathematik"
						class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
					/>
				</div>

				<div>
					<label class="block text-xs font-medium text-gray-600 mb-1" for="b-grade">Klasse</label>
					<select
						id="b-grade"
						name="grade"
						required
						class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
					>
						<option value="">—</option>
						{#each Array.from({ length: 9 }, (_, i) => i + 5) as g}
							<option value={g}>Klasse {g}</option>
						{/each}
					</select>
				</div>

				<div>
					<label class="block text-xs font-medium text-gray-600 mb-1" for="b-school">Schulart (optional)</label>
					<select
						id="b-school"
						name="school_type"
						class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
					>
						<option value="">—</option>
						<option value="Gymnasium">Gymnasium</option>
						<option value="Realschule">Realschule</option>
						<option value="Mittelschule">Mittelschule</option>
						<option value="Gesamtschule">Gesamtschule</option>
					</select>
				</div>

				<div>
					<label class="block text-xs font-medium text-gray-600 mb-1" for="b-publisher">Verlag (optional)</label>
					<input
						id="b-publisher"
						name="publisher"
						type="text"
						placeholder="z.B. Cornelsen"
						class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
					/>
				</div>

				<div class="col-span-2">
					<label class="block text-xs font-medium text-gray-600 mb-1" for="b-file">PDF-Datei</label>
					<input
						id="b-file"
						name="file"
						type="file"
						accept="application/pdf"
						required
						class="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100"
					/>
				</div>

				<div class="col-span-2 pt-1">
					<button
						type="submit"
						disabled={uploading}
						class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
					>
						{uploading ? 'Wird hochgeladen und indexiert – das kann eine Minute dauern…' : 'Hochladen'}
					</button>
					{#if uploading}
						<p class="text-xs text-gray-400 mt-2 text-center">
							Das Inhaltsverzeichnis wird automatisch erkannt, damit du beim Generieren Kapitel auswählen kannst.
						</p>
					{/if}
				</div>
			</form>
		</div>
	{/if}

	<!-- Book list -->
	{#if data.books.length === 0}
		<p class="text-sm text-gray-400 text-center py-8">Noch keine Bücher hinterlegt.</p>
	{:else}
		<div class="space-y-4">
			{#each data.books as book}
				<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
					<div class="flex items-start gap-3">
						<span class="text-2xl shrink-0">📘</span>
						<div class="flex-1 min-w-0">
							<h3 class="font-semibold text-gray-800">{book.title}</h3>
							<p class="text-xs text-gray-400 mt-0.5">
								{book.subject} · Klasse {book.grade}
								{#if book.school_type}· {book.school_type}{/if}
								{#if book.publisher}· {book.publisher}{/if}
								{#if book.page_count}· {book.page_count} Seiten{/if}
								{#if book.visibility === 'shared'}· <span class="text-violet-500">geteilt</span>{/if}
							</p>
							<div class="flex flex-wrap items-center gap-3 mt-2">
								{#if book.chapters && book.chapters.length > 0}
									<button
										onclick={() => toggleChapters(book.id)}
										class="text-xs text-blue-500 hover:underline"
									>
										{book.chapters.length} Kapitel {expandedBook === book.id ? 'ausblenden' : 'anzeigen'}
									</button>
								{:else}
									<span class="text-xs text-amber-600">Keine Kapitel erkannt</span>
								{/if}
								{#if book.owner_family === data.familyId}
									<form
										method="POST"
										action="?/delete"
										use:enhance
										onsubmit={(e) => {
											if (!confirm(`„${book.title}" wirklich löschen?`)) e.preventDefault();
										}}
									>
										<input type="hidden" name="id" value={book.id} />
										<button type="submit" class="text-xs text-red-400 hover:text-red-600 hover:underline">
											Löschen
										</button>
									</form>
								{/if}
							</div>

							{#if expandedBook === book.id && book.chapters}
								<div class="mt-3 bg-gray-50 rounded-xl p-3">
									<ul class="space-y-1">
										{#each book.chapters as chapter}
											<li class="text-xs text-gray-600 flex justify-between gap-2">
												<span class="truncate">{chapter.title}</span>
												<span class="text-gray-400 shrink-0">S. {chapter.pageStart}–{chapter.pageEnd}</span>
											</li>
										{/each}
									</ul>

									{#if book.owner_family === data.familyId}
										<form method="POST" action="?/updateOffset" use:enhance class="mt-3 pt-3 border-t border-gray-200 flex items-center gap-2">
											<input type="hidden" name="id" value={book.id} />
											<label class="text-xs text-gray-500" for="offset-{book.id}">Seiten-Versatz</label>
											<input
												id="offset-{book.id}"
												name="page_offset"
												type="number"
												value={book.page_offset}
												class="w-16 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
											/>
											<button type="submit" class="text-xs text-blue-500 hover:underline">Speichern</button>
											<span class="text-xs text-gray-400">= PDF-Seite minus gedruckte Seitenzahl</span>
										</form>
									{/if}
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</main>
