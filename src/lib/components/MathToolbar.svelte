<script lang="ts">
	type Props = {
		oninsert: (text: string) => void;
	};
	let { oninsert }: Props = $props();

	const symbols = [
		{ label: '√', insert: '√' },
		{ label: 'x²', insert: '^2' },
		{ label: 'x³', insert: '^3' },
		{ label: 'π', insert: 'π' },
		{ label: '±', insert: '±' },
		{ label: '×', insert: '×' },
		{ label: '÷', insert: '÷' },
		{ label: '≤', insert: '≤' },
		{ label: '≥', insert: '≥' },
		{ label: '≠', insert: '≠' },
		{ label: '∞', insert: '∞' },
		{ label: '∑', insert: '∑' },
		{ label: 'α', insert: 'α' },
		{ label: 'β', insert: 'β' },
		{ label: 'Δ', insert: 'Δ' },
	];
</script>

<div class="flex flex-wrap gap-1 mb-1">
	{#each symbols as sym}
		<button
			type="button"
			onclick={() => oninsert(sym.insert)}
			class="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-blue-100 text-gray-700 font-mono border border-gray-200 transition-colors"
			title={sym.insert}
		>
			{sym.label}
		</button>
	{/each}
</div>
