<script lang="ts">
	type Props = {
		type: 'generation' | 'correction' | 'chat';
		refId: string;
		profileId: string;
	};

	let { type, refId, profileId }: Props = $props();

	// Der Daumen wird sofort gespeichert, der Kommentar ergänzt dieselbe Zeile (PATCH).
	let rating = $state<'positive' | 'negative' | null>(null);
	let feedbackId = $state<string | null>(null);
	let comment = $state('');
	let commentSent = $state(false);
	let submitting = $state(false);

	async function rate(r: 'positive' | 'negative') {
		if (rating || submitting) return;
		rating = r;
		submitting = true;
		try {
			const res = await fetch('/api/feedback', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type, refId, profileId, rating: r })
			});
			if (!res.ok) throw new Error();
			feedbackId = (await res.json()).id;
		} catch {
			// Feedback ist nicht kritisch — Auswahl zurücknehmen, damit man es erneut versuchen kann.
			rating = null;
		} finally {
			submitting = false;
		}
	}

	async function sendComment() {
		if (!feedbackId || !comment.trim() || submitting) return;
		submitting = true;
		try {
			const res = await fetch('/api/feedback', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: feedbackId, comment })
			});
			if (res.ok) commentSent = true;
		} catch {
			// Silent fail — der Daumen ist schon gespeichert
		} finally {
			submitting = false;
		}
	}
</script>

{#if commentSent}
	<p class="text-xs text-gray-400">Danke für dein Feedback!</p>
{:else}
	<div class="flex items-center gap-3 flex-wrap">
		<span class="text-xs text-gray-400">{feedbackId ? 'Danke!' : 'War das hilfreich?'}</span>
		<div class="flex gap-1">
			<button
				onclick={() => rate('positive')}
				disabled={rating !== null || submitting}
				class="text-lg leading-none transition-transform enabled:hover:scale-125 {rating === 'positive' ? 'grayscale-0' : 'grayscale opacity-50'}"
				aria-label="Hilfreich"
				aria-pressed={rating === 'positive'}
			>👍</button>
			<button
				onclick={() => rate('negative')}
				disabled={rating !== null || submitting}
				class="text-lg leading-none transition-transform enabled:hover:scale-125 {rating === 'negative' ? 'grayscale-0' : 'grayscale opacity-50'}"
				aria-label="Nicht hilfreich"
				aria-pressed={rating === 'negative'}
			>👎</button>
		</div>
		{#if feedbackId}
			<input
				bind:value={comment}
				type="text"
				maxlength="1000"
				placeholder={rating === 'positive' ? 'Was war gut? (optional)' : 'Was hat nicht gepasst? (optional)'}
				aria-label="Kommentar"
				class="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300"
				onkeydown={(e) => e.key === 'Enter' && sendComment()}
			/>
			{#if comment.trim()}
				<button
					onclick={sendComment}
					disabled={submitting}
					class="text-xs bg-gray-800 hover:bg-gray-900 disabled:opacity-40 text-white px-2.5 py-1 rounded-lg transition-colors"
				>
					Senden
				</button>
			{/if}
		{/if}
	</div>
{/if}
