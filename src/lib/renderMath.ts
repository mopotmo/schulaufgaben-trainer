import katex from 'katex';

/**
 * `renderMath` läuft auf der HTML-Ausgabe von `marked`, und die hat `& < > " '` im Fließtext
 * bereits als Entities escaped. KaTeX sieht dadurch `&lt;` statt `<` und setzt es wörtlich —
 * `$x < 5$` erscheint als „x &lt; 5". Betrifft jede Ungleichung und jedes `&` in ausgerichteten
 * Umgebungen (`align`, `array`, Matrizen). Deshalb vor dem Rendern zurückübersetzen.
 *
 * `&amp;` kommt zuletzt, damit ein im Quelltext wörtlich gemeintes `&lt;` (aus `&amp;lt;`)
 * nicht versehentlich zu `<` wird.
 */
function decodeEntities(tex: string): string {
	return tex
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&');
}

/** Render inline ($...$) and display ($$...$$) LaTeX in an HTML string. */
export function renderMath(html: string): string {
	// Display math first ($$...$$)
	html = html.replace(/\$\$([^$]+?)\$\$/gs, (_, tex) => {
		try {
			return katex.renderToString(decodeEntities(tex).trim(), {
				displayMode: true,
				throwOnError: false
			});
		} catch {
			return `$$${tex}$$`;
		}
	});

	// Inline math ($...$)
	html = html.replace(/\$([^$\n]+?)\$/g, (_, tex) => {
		try {
			return katex.renderToString(decodeEntities(tex).trim(), {
				displayMode: false,
				throwOnError: false
			});
		} catch {
			return `$${tex}$`;
		}
	});

	return html;
}
