import katex from 'katex';

/** Render inline ($...$) and display ($$...$$) LaTeX in an HTML string. */
export function renderMath(html: string): string {
	// Display math first ($$...$$)
	html = html.replace(/\$\$([^$]+?)\$\$/gs, (_, tex) => {
		try {
			return katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false });
		} catch {
			return `$$${tex}$$`;
		}
	});

	// Inline math ($...$)
	html = html.replace(/\$([^$\n]+?)\$/g, (_, tex) => {
		try {
			return katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false });
		} catch {
			return `$${tex}$`;
		}
	});

	return html;
}
