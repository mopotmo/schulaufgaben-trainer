<script lang="ts">
	type Props = {
		type: 'generation' | 'correction' | 'chat';
		refId: string;
		profileId: string;
	};

	let { type, refId, profileId }: Props = $props();

	let rating = $state<'positive' | 'negative' | null>(null);
	let comment = $state('');
	let submitted = $state(false);
	let submitting = $state(false);

	async function submit(r: 'positive' | 'negative') {
		rating = r;
		// Submit immediately on thumbs click, comment can follow
		await send();
	}

	async function send() {
		if (!rating || submitting) return;
		submitting = true;
		try {
			await fetch('/api/feedback', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type, refId, profileId, rating, comment: comment || null })
			});
			submitted = true;
		} catch {
			// Silent fail — feedback is non-critical
		} finally {
			submitting = false;
		}
	}
</script>

{#if submitted}
	<p class="text-xs text-gray-400">Danke für dein Feedback!</p>
{:else}
	<div class="flex items-center gap-3 flex-wrap">
		<span class="text-xs text-gray-400">War das hilfreich?</span>
		<div class="flex gap-1">
			<button
				onclick={() => submit('positive')}
				disabled={submitting}
				class="text-lg leading-none transition-transform hover:scale-125 disabled:opacity-40 {rating === 'positive' ? 'grayscale-0' : 'grayscale opacity-50'}"
				aria-label="Hilfreich"
			>👍</button>
			<button
				onclick={() => submit('negative')}
				disabled={submitting}
				class="text-lg leading-none transition-transform hover:scale-125 disabled:opacity-40 {rating === 'negative' ? 'grayscale-0' : 'grayscale opacity-50'}"
				aria-label="Nicht hilfreich"
			>👎</button>
		</div>
		{#if rating === 'negative'}
			<input
				bind:value={comment}
				type="text"
				placeholder="Was hat nicht gepasst? (optional)"
				class="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300"
				onkeydown={(e) => e.key === 'Enter' && send()}
			/>
			{#if comment.trim()}
				<button
					onclick={send}
					class="text-xs bg-gray-800 hover:bg-gray-900 text-white px-2.5 py-1 rounded-lg transition-colors"
				>
					Senden
				</button>
			{/if}
		{/if}
	</div>
{/if}
