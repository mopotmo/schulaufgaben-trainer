<script lang="ts">
	type Props = {
		durationSeconds: number; // countdown target; 0 = count-up
	};

	let { durationSeconds }: Props = $props();

	let elapsed = $state(0);
	let running = $state(false);
	let interval: ReturnType<typeof setInterval> | null = null;

	let remaining = $derived(Math.max(0, durationSeconds - elapsed));
	let isCountdown = $derived(durationSeconds > 0);
	let isOvertime = $derived(isCountdown && elapsed > durationSeconds);
	let overtime = $derived(isOvertime ? elapsed - durationSeconds : 0);
	let display = $derived(isCountdown ? remaining : elapsed);
	let progress = $derived(isCountdown && durationSeconds > 0 ? Math.min(elapsed / durationSeconds, 1) : 0);

	function toggle() {
		running ? pause() : start();
	}

	function start() {
		if (running) return;
		running = true;
		interval = setInterval(() => { elapsed += 1; }, 1000);
	}

	function pause() {
		running = false;
		if (interval) { clearInterval(interval); interval = null; }
	}

	export function stop() {
		pause();
	}

	function reset() {
		pause();
		elapsed = 0;
	}

	function format(s: number): string {
		const m = Math.floor(s / 60).toString().padStart(2, '0');
		const sec = (s % 60).toString().padStart(2, '0');
		return `${m}:${sec}`;
	}

	// Color: green → amber (last 20%) → red (overtime)
	let color = $derived(
		isOvertime ? 'text-red-600' :
		isCountdown && remaining < durationSeconds * 0.2 ? 'text-amber-500' :
		'text-gray-800'
	);
</script>

<div class="space-y-2">
	{#if isCountdown}
		<!-- Progress bar -->
		<div class="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
			<div
				class="h-full rounded-full transition-all duration-1000 {isOvertime ? 'bg-red-400' : progress > 0.8 ? 'bg-amber-400' : 'bg-green-400'}"
				style="width: {Math.min(progress * 100, 100)}%"
			></div>
		</div>
	{/if}

	<div class="flex items-center gap-3">
		<div class="text-center">
			<span class="font-mono text-2xl font-semibold tabular-nums {color} w-16 inline-block text-center">
				{format(display)}
			</span>
			{#if isOvertime}
				<span class="block text-xs text-red-400">+{format(overtime)} über Zeit</span>
			{:else if isCountdown && !running && elapsed === 0}
				<span class="block text-xs text-gray-400">{format(durationSeconds)} Bearbeitungszeit</span>
			{/if}
		</div>

		<button
			onclick={toggle}
			class="text-sm font-medium px-3 py-1.5 rounded-lg transition-colors {running
				? 'bg-amber-100 hover:bg-amber-200 text-amber-700'
				: 'bg-green-100 hover:bg-green-200 text-green-700'}"
		>
			{running ? '⏸ Pause' : elapsed > 0 ? '▶ Weiter' : '▶ Start'}
		</button>

		{#if elapsed > 0 && !running}
			<button
				onclick={reset}
				class="text-xs text-gray-400 hover:text-gray-600 transition-colors"
			>
				Zurücksetzen
			</button>
		{/if}
	</div>
</div>
