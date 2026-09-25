<script lang="ts">
	type Child = { name: string; grade: string | number | null; avatar: string | null };
	let { children }: { children: Child[] } = $props();
</script>

<div class="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
	<h2 class="text-sm font-semibold text-gray-700">Worum es geht</h2>
	<ul class="mt-2 space-y-1.5 text-sm text-gray-600">
		<li>· Es werden Übungsaufgaben erzeugt, passend zu Schulart, Klasse und Bundesland.</li>
		<li>· Eingereichte Lösungen werden von einer KI korrigiert — auch hochgeladene Fotos.</li>
		<li>· Dafür gehen Eingaben und Uploads an Anthropic in den USA. Gehostet wird in Nürnberg.</li>
		<li>· Hochgeladene Dateien werden nach 30 Tagen automatisch gelöscht.</li>
		<li>· Nichts davon geht an die Schule. KI-Korrekturen können falsch sein.</li>
	</ul>
	<p class="mt-3 text-sm text-gray-500">
		Alle Einzelheiten in der <a class="text-blue-600 hover:underline" href="/datenschutz" target="_blank" rel="noreferrer">Datenschutzerklärung</a>
		und den <a class="text-blue-600 hover:underline" href="/nutzungsbedingungen" target="_blank" rel="noreferrer">Nutzungsbedingungen</a>.
	</p>
</div>

<div class="mt-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
	<h2 class="text-sm font-semibold text-gray-700">Für diese Kinder</h2>
	{#if children.length > 0}
		<ul class="mt-2 space-y-1 text-sm text-gray-600">
			{#each children as child (child.name)}
				<li>{child.avatar ?? '🎓'} {child.name} · Klasse {child.grade}</li>
			{/each}
		</ul>
		<p class="mt-3 text-sm text-gray-500">
			Die Einwilligung gilt auch für Profile, die du später anlegst.
		</p>
	{:else}
		<p class="mt-2 text-sm text-gray-600">
			Du hast noch keine Profile angelegt — das kommt gleich nach diesem Schritt. Die
			Einwilligung gilt für alle Kinder, für die du hier Profile anlegst.
		</p>
	{/if}
</div>
