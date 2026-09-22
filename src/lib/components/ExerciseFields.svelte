<script lang="ts">
	/**
	 * Das Aufgabenblatt mit den Antwortfeldern — in „Lösen" und in der Vorschau nach dem
	 * Generieren dieselbe Darstellung.
	 *
	 * Teilaufgaben stehen unter **einer** Überschrift. Vorher trug jede Teilaufgabe den
	 * vollständigen Aufgabentitel („Aufgabe 2 (6 Punkte) a)", „Aufgabe 2 (6 Punkte) b)") und
	 * darunter noch einmal den gemeinsamen Vorspann — so schreibt kein Aufgabenblatt.
	 *
	 * Die Antwortfelder bleiben flach durchnummeriert (`part.index`): Entwürfe im
	 * localStorage, die Zeichenflächen und die Korrektur hängen an dieser Position.
	 */
	import DrawCanvas from './DrawCanvas.svelte';
	import { renderMarkdown } from '$lib/renderMarkdown';
	import type { ParsedExercise } from '$lib/parseExercises';

	type Mode = 'text' | 'draw';
	type Point = { x: number; y: number; p: number };
	type Stroke = Point[];

	let {
		exercises,
		answers = $bindable(),
		modes = $bindable(),
		drawings = $bindable(),
		canvasRefs = $bindable(),
		/** Nur „Lösen" braucht die Felder — für die Symbolleiste. */
		textareaRefs = $bindable([]),
		onfocusfield
	}: {
		exercises: ParsedExercise[];
		answers: string[];
		modes: Mode[];
		drawings: Stroke[][];
		canvasRefs: (DrawCanvas | null)[];
		textareaRefs?: (HTMLTextAreaElement | null)[];
		onfocusfield?: (index: number) => void;
	} = $props();
</script>

{#each exercises as ex}
	<div>
		<div class="flex items-start justify-between gap-3 mb-1">
			<p class="text-sm font-semibold text-gray-800">{ex.title}</p>
			{#if ex.parts.length === 1}
				<!-- Ohne Teilaufgaben gehört die Umschaltung neben die Überschrift. -->
				<div class="flex rounded-lg border border-gray-200 overflow-hidden shrink-0 text-xs">
					<button
						type="button"
						onclick={() => (modes[ex.parts[0].index] = 'text')}
						class="px-2.5 py-1 transition-colors {modes[ex.parts[0].index] === 'text' ? 'bg-blue-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}"
					>
						⌨ Tippen
					</button>
					<button
						type="button"
						onclick={() => (modes[ex.parts[0].index] = 'draw')}
						class="px-2.5 py-1 transition-colors {modes[ex.parts[0].index] === 'draw' ? 'bg-blue-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}"
					>
						✏️ Zeichnen
					</button>
				</div>
			{/if}
		</div>

		{#if ex.preamble}
			<div class="prose prose-sm max-w-none text-gray-600 mb-2">
				{@html renderMarkdown(ex.preamble)}
			</div>
		{/if}

		{#each ex.parts as part (part.index)}
			{@const i = part.index}
			<div class={part.label ? 'mt-3 pl-3 border-l-2 border-gray-100' : ''}>
				{#if part.label}
					<div class="flex items-start justify-between gap-3 mb-1">
						<p class="text-sm font-medium text-gray-700">{part.label}</p>
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
				{/if}

				{#if part.body}
					<div class="prose prose-sm max-w-none text-gray-600 mb-2">
						{@html renderMarkdown(part.body)}
					</div>
				{/if}

				{#if modes[i] === 'draw'}
					<DrawCanvas bind:this={canvasRefs[i]} bind:strokes={drawings[i]} />
				{:else}
					<textarea
						bind:value={answers[i]}
						bind:this={textareaRefs[i]}
						onfocus={() => onfocusfield?.(i)}
						rows="3"
						placeholder="Deine Antwort…"
						class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-y"
					></textarea>
				{/if}
			</div>
		{/each}
	</div>
{/each}
