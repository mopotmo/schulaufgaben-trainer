<script lang="ts">
	let {
		files = $bindable<File[]>([]),
		disabled = false,
		label = 'Dateien auswählen'
	}: {
		files: File[];
		disabled?: boolean;
		label?: string;
	} = $props();

	function add(e: Event, capture?: string) {
		const input = e.target as HTMLInputElement;
		files = [...files, ...Array.from(input.files ?? [])];
		input.value = '';
	}

	function remove(i: number) {
		files = files.filter((_, idx) => idx !== i);
	}
</script>

{#if files.length > 0}
	<ul class="mb-3 space-y-2">
		{#each files as file, i}
			<li class="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-sm">
				<span class="text-gray-400 text-xs font-mono w-5 text-right">{i + 1}.</span>
				<span class="flex-1 truncate text-gray-700">{file.name}</span>
				<span class="text-gray-400 text-xs">{(file.size / 1024).toFixed(0)} KB</span>
				<button
					onclick={() => remove(i)}
					{disabled}
					class="text-gray-300 hover:text-red-400 transition-colors ml-1 text-lg leading-none disabled:opacity-30"
					aria-label="Entfernen"
				>×</button>
			</li>
		{/each}
	</ul>
{/if}

<div class="flex gap-2">
	<!-- File picker -->
	<label class="flex-1 flex items-center gap-2 cursor-pointer border-2 border-dashed border-gray-200 rounded-xl px-4 py-3 hover:border-blue-300 hover:bg-blue-50 transition-colors text-sm text-gray-500 {disabled ? 'pointer-events-none opacity-40' : ''}">
		<span class="text-base">📎</span>
		<span>{files.length === 0 ? label : 'Weitere hinzufügen'}</span>
		<input type="file" accept="image/*,.pdf" multiple {disabled} onchange={add} class="hidden" />
	</label>

	<!-- Camera (mobile) -->
	<label class="flex items-center gap-1.5 cursor-pointer border-2 border-dashed border-gray-200 rounded-xl px-3 py-3 hover:border-blue-300 hover:bg-blue-50 transition-colors text-sm text-gray-500 {disabled ? 'pointer-events-none opacity-40' : ''}" title="Foto aufnehmen">
		<span class="text-base">📷</span>
		<input type="file" accept="image/*" capture="environment" {disabled} onchange={add} class="hidden" />
	</label>
</div>
