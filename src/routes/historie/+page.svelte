<script lang="ts">
	import type { PageData } from './$types';
	import { marked } from 'marked';

	let { data }: { data: PageData } = $props();

	let expandedId = $state<string | null>(null);

	function toggle(id: string) {
		expandedId = expandedId === id ? null : id;
	}

	function summaryFromCorrection(text: string): string {
		// Extract "Gesamt" line or first meaningful sentence
		const gesamtMatch = text.match(/Gesamt\w*[:\s]+(\d+\s*\/\s*\d+[^)]*\)?\s*[·\-–]?\s*\d*\s*%?[^\n]*)/i)
			?? text.match(/Erreichte Punkte.*?:\s*([^\n]+)/i)
			?? text.match(/(\d+\s*(?:von|\/)\s*\d+\s*Punkt[^\n]*)/i);
		return gesamtMatch?.[1]?.trim() ?? '';
	}

	function gradeFromCorrection(text: string): string | null {
		const match = text.match(/Note[:\s]+([1-6](?:[,\.]\d+)?)\s*\(?([^)\n]*)\)?/i);
		return match ? `Note ${match[1]}${match[2] ? ` (${match[2].trim()})` : ''}` : null;
	}

	function formatDate(dt: string) {
		return new Date(dt).toLocaleDateString('de-DE', {
			day: '2-digit', month: '2-digit', year: 'numeric'
		});
	}
</script>

<main class="max-w-2xl mx-auto px-4 py-10">
	<a href="/" class="text-sm text-blue-500 hover:underline mb-6 inline-block">← Profilauswahl</a>

	<h1 class="text-3xl font-bold text-gray-800 mb-1">Übungshistorie</h1>
	<p class="text-gray-500 mb-8">
		Profil: <strong>{data.profile.name}</strong> · {data.profile.school_type} Klasse {data.profile.grade} · {data.profile.state}
	</p>

	{#if data.exercises.length === 0}
		<div class="text-center text-gray-400 py-16">
			<p class="text-4xl mb-3">📭</p>
			<p>Noch keine Übungen vorhanden.</p>
			<a href="/generieren?profil={data.profile.id}" class="mt-4 inline-block text-blue-500 hover:underline text-sm">
				Erste Aufgaben generieren →
			</a>
		</div>
	{:else}
		<div class="space-y-3">
			{#each data.exercises as ex}
				{@const correction = ex.correction}
				{@const summary = correction ? summaryFromCorrection(correction.correction_result ?? '') : ''}
				{@const grade = correction ? gradeFromCorrection(correction.correction_result ?? '') : null}

				<div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
					<!-- Header row -->
					<button
						onclick={() => toggle(ex.id)}
						class="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors"
					>
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2 flex-wrap">
								<span class="font-semibold text-gray-800 text-sm">{ex.subject}</span>
								<span class="text-gray-300">·</span>
								<span class="text-gray-600 text-sm truncate">{ex.topic}</span>
							</div>
							<div class="flex items-center gap-2 mt-1 flex-wrap">
								<span class="text-xs text-gray-400">{formatDate(ex.created_at)}</span>
								{#if correction}
									{#if grade}
										<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">{grade}</span>
									{/if}
									{#if summary}
										<span class="text-xs text-gray-500">{summary}</span>
									{/if}
								{:else}
									<span class="text-xs text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full">Noch nicht korrigiert</span>
								{/if}
							</div>
						</div>
						<span class="text-gray-300 text-sm shrink-0">{expandedId === ex.id ? '▲' : '▼'}</span>
					</button>

					<!-- Expanded detail -->
					{#if expandedId === ex.id}
						<div class="border-t border-gray-100 px-5 py-4 space-y-4">
							<!-- Actions -->
							<div class="flex gap-2 flex-wrap">
								<a
									href="/generieren?profil={data.profile.id}"
									class="text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
								>
									Neue Aufgaben generieren
								</a>
								{#if !correction}
									<a
										href="/generieren?aufgabe={ex.id}"
										class="text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
									>
										Im Browser lösen
									</a>
									<a
										href="/korrigieren?aufgabe={ex.id}"
										class="text-xs bg-green-600 hover:bg-green-700 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
									>
										Lösung einreichen
									</a>
									<form method="POST" action="?/replace">
										<input type="hidden" name="exerciseId" value={ex.id} />
										<input type="hidden" name="profilId" value={data.profile.id} />
										<input type="hidden" name="subject" value={ex.subject} />
										<input type="hidden" name="topic" value={ex.topic} />
										<button
											type="submit"
											class="text-xs bg-amber-500 hover:bg-amber-600 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
										>
											Neu generieren
										</button>
									</form>
									<form method="POST" action="?/delete" onsubmit={(e) => { if (!confirm('Übung wirklich löschen?')) e.preventDefault(); }}>
										<input type="hidden" name="exerciseId" value={ex.id} />
										<input type="hidden" name="profilId" value={data.profile.id} />
										<button
											type="submit"
											class="text-xs bg-red-100 hover:bg-red-200 text-red-700 font-medium px-3 py-1.5 rounded-lg transition-colors"
										>
											Löschen
										</button>
									</form>
								{/if}
								<a
									href="/api/pdf?exerciseId={ex.id}"
									target="_blank"
									class="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-3 py-1.5 rounded-lg transition-colors"
								>
									PDF öffnen
								</a>
							</div>

							<!-- Correction result -->
							{#if correction?.correction_result}
								<div>
									<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Korrektur</p>
									<div class="prose prose-sm max-w-none bg-gray-50 rounded-xl p-4 overflow-auto max-h-64">
										{@html marked(correction.correction_result) as string}
									</div>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</main>
