<script lang="ts">
	let { hasChildren, name = '' }: { hasChildren: boolean; name?: string } = $props();
</script>

<label class="flex gap-3 text-sm text-gray-700">
	<input type="checkbox" name="custody" class="mt-0.5 h-4 w-4 shrink-0" />
	<span>
		{#if hasChildren}
			Ich bin sorgeberechtigt für die oben aufgeführten Kinder und für alle weiteren, für
			die ich hier später ein Profil anlege.
		{:else}
			Ich bin sorgeberechtigt für alle Kinder, für die ich hier ein Profil anlege.
		{/if}
	</span>
</label>

<label class="flex gap-3 text-sm text-gray-700">
	<input type="checkbox" name="privacy" class="mt-0.5 h-4 w-4 shrink-0" />
	<span>
		Ich habe die
		<a class="text-blue-600 hover:underline" href="/datenschutz" target="_blank" rel="noreferrer">Datenschutzerklärung</a>
		gelesen und willige in die beschriebene Verarbeitung ein.
	</span>
</label>

<label class="flex gap-3 text-sm text-gray-700">
	<input type="checkbox" name="terms" class="mt-0.5 h-4 w-4 shrink-0" />
	<span>
		Ich akzeptiere die <a class="text-blue-600 hover:underline" href="/nutzungsbedingungen" target="_blank" rel="noreferrer">Nutzungsbedingungen</a>.
	</span>
</label>

<div>
	<label class="mb-1 block text-sm font-medium text-gray-700" for="name">Dein Name</label>
	<input
		id="name" name="name" type="text" required autocomplete="name"
		value={name}
		class="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
	/>
</div>
