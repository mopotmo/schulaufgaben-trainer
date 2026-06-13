<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Schulaufgaben Trainer</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 overflow-x-hidden">
	{@render children()}
</div>
