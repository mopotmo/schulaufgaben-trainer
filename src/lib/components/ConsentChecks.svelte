<script lang="ts">
	/** `offerInsights`: das freiwillige Opt-in anbieten — nicht, wenn es schon besteht. */
	let {
		hasChildren,
		name = '',
		offerInsights = false
	}: { hasChildren: boolean; name?: string; offerInsights?: boolean } = $props();
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

{#if offerInsights}
	<!-- Freiwillig und nie vorangekreuzt (Art. 7 Abs. 4, Art. 25 Abs. 2 DSGVO) — deshalb
	     sichtbar abgesetzt von den drei Pflichthäkchen darüber. -->
	<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
		<p class="text-xs font-semibold tracking-wide text-gray-500 uppercase">Freiwillig</p>
		<label class="mt-2 flex gap-3 text-sm text-gray-700">
			<input type="checkbox" name="insights" class="mt-0.5 h-4 w-4 shrink-0" />
			<span>
				Aus eingereichten Lösungen dürfen <strong>Lernerkenntnisse</strong> abgeleitet werden
				(Stärken und Schwächen je Fach), damit neue Aufgaben besser passen. Geht auch ohne,
				lässt sich unter Einstellungen jederzeit ändern — beim Ausschalten wird alles
				Gesammelte gelöscht.
				<a class="text-blue-600 hover:underline" href="/datenschutz#lernerkenntnisse" target="_blank" rel="noreferrer">Mehr dazu</a>
			</span>
		</label>
	</div>
{/if}

<div>
	<label class="mb-1 block text-sm font-medium text-gray-700" for="name">Dein Name</label>
	<input
		id="name" name="name" type="text" required autocomplete="name"
		value={name}
		class="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
	/>
</div>
