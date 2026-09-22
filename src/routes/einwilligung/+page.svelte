<script lang="ts">
	import { enhance } from '$app/forms';
	import { OPERATOR } from '$lib/config';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let submitting = $state(false);
</script>

<svelte:head>
	<title>Einwilligung – Schulaufgaben Trainer</title>
</svelte:head>

<main class="min-h-screen bg-gray-50 px-4 py-10">
	<div class="mx-auto w-full max-w-xl">
		<h1 class="text-2xl font-bold text-gray-800">Einmal kurz bestätigen</h1>
		<p class="mt-2 text-sm text-gray-600">
			Bevor {data.familyName} loslegen kann, brauchen wir die Einwilligung eines Elternteils. Das ist
			einmalig und dauert eine Minute.
		</p>

		<div class="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
			<h2 class="text-sm font-semibold text-gray-700">Worum es geht</h2>
			<ul class="mt-2 space-y-1.5 text-sm text-gray-600">
				<li>· Es werden Übungsaufgaben erzeugt, passend zu Schulart, Klasse und Bundesland.</li>
				<li>· Eingereichte Lösungen werden von einer KI korrigiert — auch hochgeladene Fotos.</li>
				<li>· Dafür gehen Eingaben und Uploads an Anthropic in den USA. Gehostet wird in Nürnberg.</li>
				<li>· Hochgeladene Dateien werden nach 30 Tagen automatisch gelöscht.</li>
				<li>· Nichts davon geht an die Schule. KI-Korrekturen können falsch sein.</li>
			</ul>
			<p class="mt-3 text-sm text-gray-500">
				Alle Einzelheiten in der <a class="text-blue-600 hover:underline" href="/datenschutz">Datenschutzerklärung</a>
				und den <a class="text-blue-600 hover:underline" href="/nutzungsbedingungen">Nutzungsbedingungen</a>.
			</p>
		</div>

		{#if data.children.length > 0}
			<div class="mt-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
				<h2 class="text-sm font-semibold text-gray-700">Für diese Kinder</h2>
				<ul class="mt-2 space-y-1 text-sm text-gray-600">
					{#each data.children as child (child.name)}
						<li>{child.avatar ?? '🎓'} {child.name} · Klasse {child.grade}</li>
					{/each}
				</ul>
			</div>
		{/if}

		<form
			method="POST"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
			class="mt-4 space-y-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
		>
			<label class="flex gap-3 text-sm text-gray-700">
				<input type="checkbox" name="custody" class="mt-0.5 h-4 w-4 shrink-0" />
				<span>Ich bin sorgeberechtigt für die oben aufgeführten Kinder.</span>
			</label>

			<label class="flex gap-3 text-sm text-gray-700">
				<input type="checkbox" name="privacy" class="mt-0.5 h-4 w-4 shrink-0" />
				<span>
					Ich habe die Datenschutzerklärung gelesen und willige in die beschriebene Verarbeitung ein.
				</span>
			</label>

			<div>
				<label class="mb-1 block text-sm font-medium text-gray-700" for="name">Dein Name</label>
				<input
					id="name" name="name" type="text" required autocomplete="name"
					value={form?.name ?? ''}
					class="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
				/>
			</div>

			<div>
				<label class="mb-1 block text-sm font-medium text-gray-700" for="email">Deine E-Mail-Adresse</label>
				<input
					id="email" name="email" type="email" required autocomplete="email"
					value={form?.email ?? data.email}
					class="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
				/>
				<p class="mt-1 text-xs text-gray-400">Nur für Rückfragen, Widerruf und Löschanfragen.</p>
			</div>

			{#if form?.error}
				<p class="text-sm text-red-500">{form.error}</p>
			{/if}

			<button
				type="submit"
				disabled={submitting}
				class="w-full rounded-xl bg-blue-600 py-2.5 font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-blue-300"
			>
				{submitting ? 'Wird gespeichert…' : 'Einwilligen und loslegen'}
			</button>

			<p class="text-xs text-gray-400">
				Du kannst die Einwilligung jederzeit widerrufen — eine formlose Nachricht an
				<a class="text-blue-600 hover:underline" href="mailto:{OPERATOR.email}">{OPERATOR.email}</a>
				genügt. Der Zugang und alle Daten werden dann binnen weniger Tage gelöscht.
			</p>
		</form>
	</div>
</main>
