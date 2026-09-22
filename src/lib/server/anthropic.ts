import type Anthropic from '@anthropic-ai/sdk';

/**
 * Den eigentlichen Antworttext aus einer Anthropic-Antwort holen.
 *
 * Eine Antwort besteht aus mehreren Blöcken. Mit `thinking` kommen `thinking`-Blöcke dazu,
 * mit aktivierter Websuche `server_tool_use` und `web_search_tool_result` — und dazwischen
 * jeweils Text. Zwei naheliegende Abkürzungen gehen dabei schief:
 *
 * - `content.find(b => b.type === 'text')` nimmt den **ersten** Textblock. Sucht oder denkt
 *   das Modell zwischendurch weiter, ist das nur der Anfang.
 * - `textBlocks[textBlocks.length - 1]` nimmt den **letzten**. Hat das Modell die Antwort
 *   über mehrere Blöcke verteilt, bleibt nur der Schwanz übrig. Genau so ist am 22.09.2026
 *   ein Aufgabenblatt entstanden, das nur noch aus „Gesamt: 24 Punkte" bestand.
 *
 * Deshalb: alle Textblöcke ab dem letzten Nicht-Text-Block zusammensetzen. Das ist die
 * abschließende Antwort, ohne Recherche-Kommentare, die das Modell vor den Suchaufrufen
 * geschrieben hat.
 */
export function finalText(message: Anthropic.Message): string {
	const blocks = message.content;

	// Index nach dem letzten Block, der kein Text ist.
	let start = 0;
	for (let i = blocks.length - 1; i >= 0; i--) {
		if (blocks[i].type !== 'text') {
			start = i + 1;
			break;
		}
	}

	const join = (from: number) =>
		blocks
			.slice(from)
			.filter((b): b is Anthropic.TextBlock => b.type === 'text')
			.map((b) => b.text)
			.join('\n')
			.trim();

	// Endet die Antwort mit einem Werkzeugaufruf, steht danach nichts mehr — dann lieber
	// alle Textblöcke nehmen als nichts zurückzugeben.
	return join(start) || join(0);
}
