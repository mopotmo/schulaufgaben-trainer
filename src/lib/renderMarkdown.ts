import { Marked } from 'marked';
import { renderMath } from './renderMath';

/**
 * Markdown → HTML für `{@html}`.
 *
 * `marked` lässt rohes HTML standardmäßig durch. Da die Inhalte aus der Generierung und
 * aus dem Chat stammen und direkt per `{@html}` ins DOM gehen, wird der HTML-Renderer
 * abgeschaltet: Markup im Quelltext fällt weg, Markdown und Mathe bleiben unberührt.
 *
 * Bewusst hier und nicht per DOMPurify: Diese Funktion läuft auch im SSR, und DOMPurify
 * braucht ein DOM (`DOMPurify.sanitize` existiert unter Node nicht). So ist das Ergebnis
 * auf Server und Client identisch — kein Hydration-Mismatch.
 */
const md = new Marked({ async: false });
md.use({ renderer: { html: () => '' } });

export function renderMarkdown(source: string | null | undefined): string {
	if (!source) return '';
	return renderMath(md.parse(source) as string);
}
