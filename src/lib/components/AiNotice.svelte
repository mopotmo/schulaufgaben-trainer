<script lang="ts">
	/**
	 * Transparenzhinweis nach Art. 50 KI-VO: Menschen müssen erkennen, dass sie mit einem
	 * KI-System arbeiten. Steht deshalb dort, wo die Ausgabe erscheint, und nicht nur im
	 * Kleingedruckten.
	 *
	 * Bewusst ohne Modellnamen — die Oberfläche nennt kein Produkt, nur die Tatsache „KI".
	 */
	type Props = {
		/** `exercises` für generierte Aufgaben, `correction` für Korrekturen, `chat` für den Verlauf. */
		kind: 'exercises' | 'correction' | 'chat';
		class?: string;
	};
	let { kind, class: extraClass = '' }: Props = $props();

	const TEXT = {
		exercises: 'Diese Aufgaben hat eine KI erstellt. Sie kann sich irren — schaut sie zusammen an.',
		correction: 'Diese Korrektur stammt von einer KI. Sie kann falsch liegen, auch bei der Note. Im Zweifel gilt, was die Lehrkraft sagt.',
		chat: 'Du schreibst hier mit einer KI, nicht mit einem Menschen. Antworten können falsch sein.'
	} as const;
</script>

<p class="flex items-start gap-1.5 text-xs text-gray-500 {extraClass}">
	<span aria-hidden="true">✨</span>
	<span>{TEXT[kind]}</span>
</p>
