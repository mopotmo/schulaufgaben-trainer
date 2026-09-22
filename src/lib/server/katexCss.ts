/**
 * Baut ein in sich geschlossenes KaTeX-Stylesheet für die PDF-Erzeugung.
 *
 * Hintergrund: Der PDF-Renderer lud `katex.min.css` bisher von cdn.jsdelivr.net.
 * Harte Regel 4 (`CLAUDE.md`) verbietet externe Ressourcen — und ein CDN-Ausfall
 * hätte jede PDF-Erzeugung mitgerissen. Die Schriften werden deshalb als Data-URIs
 * eingebettet; `page.setContent()` hat keine Basis-URL, relative Pfade greifen dort nicht.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { logError } from '$lib/server/logger';

const require_ = createRequire(import.meta.url);

let cached: string | null = null;

function build(): string {
	const cssPath = require_.resolve('katex/dist/katex.min.css');
	let css = readFileSync(cssPath, 'utf8');
	const fontsDir = join(dirname(cssPath), 'fonts');

	// Nur woff2 behalten – die ttf/woff-Alternativen würden als tote relative Pfade stehenbleiben.
	css = css.replace(/,url\(fonts\/[^)]+\.(?:woff|ttf)\) format\("[^"]+"\)/g, '');

	return css.replace(/url\(fonts\/([^)]+\.woff2)\)/g, (match, file: string) => {
		try {
			const data = readFileSync(join(fontsDir, file)).toString('base64');
			return `url(data:font/woff2;base64,${data})`;
		} catch {
			return match;
		}
	});
}

/** Das Stylesheet, einmal pro Prozess gebaut. Fällt bei Problemen auf einen leeren String zurück. */
export function getKatexCss(): string {
	if (cached !== null) return cached;
	try {
		cached = build();
	} catch (e) {
		// Ohne Stylesheet bleibt Mathe lesbar, nur ohne KaTeX-Schriften – besser als kein PDF.
		void logError('pdf/katex-css', e);
		cached = '';
	}
	return cached;
}
