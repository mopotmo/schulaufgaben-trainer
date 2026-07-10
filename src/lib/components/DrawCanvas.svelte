<script lang="ts">
	import { onMount } from 'svelte';

	type Point = { x: number; y: number; p: number };
	type Stroke = Point[];

	let {
		strokes = $bindable<Stroke[]>([]),
		height = 180,
		disabled = false
	}: {
		strokes: Stroke[];
		height?: number;
		disabled?: boolean;
	} = $props();

	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let wrapperEl = $state<HTMLDivElement | null>(null);
	let cssWidth = $state(0);
	let dpr = 1;

	let drawing = $state(false);
	let current: Stroke = [];
	// Palm rejection: once a pen is used, ignore finger (touch) input.
	let usedPen = false;

	const BASE_WIDTH = 2.2;
	const INK = '#1f2937'; // gray-800

	function lineWidthFor(p: number): number {
		// Pen delivers real pressure (0..1); mouse reports 0.5 while pressed.
		const pressure = p > 0 ? p : 0.5;
		return BASE_WIDTH * (0.4 + pressure * 1.4);
	}

	function ctx(): CanvasRenderingContext2D | null {
		return canvasEl?.getContext('2d') ?? null;
	}

	function setupCanvas() {
		if (!canvasEl || !wrapperEl) return;
		dpr = window.devicePixelRatio || 1;
		cssWidth = wrapperEl.clientWidth;
		canvasEl.width = Math.round(cssWidth * dpr);
		canvasEl.height = Math.round(height * dpr);
		redraw();
	}

	// Draw ruled "notebook" lines — visible only, never exported.
	function drawRuling(c: CanvasRenderingContext2D) {
		c.save();
		c.strokeStyle = '#e5e7eb'; // gray-200
		c.lineWidth = 1;
		const gap = 32;
		for (let y = gap; y < height; y += gap) {
			c.beginPath();
			c.moveTo(0, y);
			c.lineTo(cssWidth, y);
			c.stroke();
		}
		c.restore();
	}

	function drawStroke(c: CanvasRenderingContext2D, stroke: Stroke) {
		if (stroke.length === 0) return;
		c.lineCap = 'round';
		c.lineJoin = 'round';
		c.strokeStyle = INK;
		if (stroke.length === 1) {
			const pt = stroke[0];
			c.beginPath();
			c.arc(pt.x, pt.y, lineWidthFor(pt.p) / 2, 0, Math.PI * 2);
			c.fillStyle = INK;
			c.fill();
			return;
		}
		for (let i = 1; i < stroke.length; i++) {
			const a = stroke[i - 1];
			const b = stroke[i];
			c.beginPath();
			c.lineWidth = lineWidthFor(b.p);
			c.moveTo(a.x, a.y);
			c.lineTo(b.x, b.y);
			c.stroke();
		}
	}

	function redraw() {
		const c = ctx();
		if (!c || !canvasEl) return;
		c.setTransform(dpr, 0, 0, dpr, 0, 0);
		c.clearRect(0, 0, cssWidth, height);
		drawRuling(c);
		for (const s of strokes) drawStroke(c, s);
		if (current.length) drawStroke(c, current);
	}

	function pointFrom(e: PointerEvent): Point {
		const rect = canvasEl!.getBoundingClientRect();
		return {
			x: e.clientX - rect.left,
			y: e.clientY - rect.top,
			p: e.pressure
		};
	}

	function onPointerDown(e: PointerEvent) {
		if (disabled) return;
		if (e.pointerType === 'pen') usedPen = true;
		if (e.pointerType === 'touch' && usedPen) return; // palm rejection
		e.preventDefault();
		canvasEl?.setPointerCapture(e.pointerId);
		drawing = true;
		current = [pointFrom(e)];
		redraw();
	}

	function onPointerMove(e: PointerEvent) {
		if (!drawing) return;
		e.preventDefault();
		const events =
			typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
		const c = ctx();
		for (const ev of events.length ? events : [e]) {
			const pt = pointFrom(ev);
			const prev = current[current.length - 1];
			current.push(pt);
			// Incremental draw for responsiveness.
			if (c && prev) {
				c.setTransform(dpr, 0, 0, dpr, 0, 0);
				c.lineCap = 'round';
				c.lineJoin = 'round';
				c.strokeStyle = INK;
				c.beginPath();
				c.lineWidth = lineWidthFor(pt.p);
				c.moveTo(prev.x, prev.y);
				c.lineTo(pt.x, pt.y);
				c.stroke();
			}
		}
	}

	function endStroke() {
		if (!drawing) return;
		drawing = false;
		if (current.length) strokes = [...strokes, current];
		current = [];
	}

	function onPointerUp(e: PointerEvent) {
		if (!drawing) return;
		e.preventDefault();
		endStroke();
	}

	export function clear() {
		strokes = [];
		current = [];
		usedPen = false;
		redraw();
	}

	export function undo() {
		strokes = strokes.slice(0, -1);
		redraw();
	}

	export function isEmpty(): boolean {
		return strokes.length === 0;
	}

	// Export handwriting on a clean white background (no ruling) for correction.
	export function toBlob(): Promise<Blob | null> {
		return new Promise((resolve) => {
			if (!canvasEl || strokes.length === 0) {
				resolve(null);
				return;
			}
			const out = document.createElement('canvas');
			out.width = canvasEl.width;
			out.height = canvasEl.height;
			const c = out.getContext('2d');
			if (!c) {
				resolve(null);
				return;
			}
			c.setTransform(dpr, 0, 0, dpr, 0, 0);
			c.fillStyle = '#ffffff';
			c.fillRect(0, 0, cssWidth, height);
			for (const s of strokes) drawStroke(c, s);
			out.toBlob((b) => resolve(b), 'image/png');
		});
	}

	onMount(() => {
		setupCanvas();
		const ro = new ResizeObserver(() => setupCanvas());
		if (wrapperEl) ro.observe(wrapperEl);
		return () => ro.disconnect();
	});

	// Redraw when strokes are replaced externally (e.g. draft restore).
	$effect(() => {
		strokes;
		redraw();
	});
</script>

<div bind:this={wrapperEl} class="w-full">
	<div class="relative rounded-xl border border-gray-200 bg-white overflow-hidden {disabled ? 'opacity-60' : ''}">
		<canvas
			bind:this={canvasEl}
			style="width: 100%; height: {height}px; touch-action: none;"
			class="block cursor-crosshair"
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
			onpointerleave={onPointerUp}
		></canvas>
		{#if isEmpty() && !drawing}
			<span class="pointer-events-none absolute left-3 top-2 text-xs text-gray-300">
				Hier mit dem Stift schreiben…
			</span>
		{/if}
	</div>
	<div class="mt-1 flex items-center justify-end gap-2">
		<button
			type="button"
			onclick={undo}
			disabled={disabled || isEmpty()}
			class="text-xs px-2 py-1 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors"
		>
			↶ Rückgängig
		</button>
		<button
			type="button"
			onclick={clear}
			disabled={disabled || isEmpty()}
			class="text-xs px-2 py-1 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors"
		>
			🗑 Löschen
		</button>
	</div>
</div>
