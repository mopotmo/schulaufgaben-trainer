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
 *
 * `breaks: true`, weil die Generierung mehrzeilige Blöcke ohne Markdown-Zeilenumbruch
 * ausgibt — Gleichungssysteme als `(I) …` / `(II) …`, Teilaufgaben als `a)` / `b)` / `c)`.
 * Mit der Voreinstellung landen die alle in einem `<p>` auf einer Sichtzeile. Prosa wird
 * vom Modell nicht hart umbrochen, deshalb entstehen dadurch keine zerrissenen Absätze.
 */
const md = new Marked({ async: false, breaks: true });
md.use({
	renderer: {
		/**
		 * Rohes HTML wird verworfen — mit **einer** Ausnahme: `<br>`.
		 *
		 * Die Generierung setzt `<br><br><br>` als Schreibplatz auf dem Arbeitsblatt. Sie
		 * pauschal zu verwerfen nahm gedruckten Blättern den Platz zum Antworten, also genau
		 * das, wofür sie da sind. `<br>` trägt keine Attribute und kann nichts ausführen,
		 * deshalb ist es die einzige Form, die hier durchgelassen wird — normalisiert, damit
		 * keine Schreibweise durchrutscht, die nur so aussieht.
		 */
		html(token) {
			return /^<br\s*\/?>$/i.test(token.raw.trim()) ? '<br>' : '';
		}
	}
});

export function renderMarkdown(source: string | null | undefined): string {
	if (!source) return '';
	return renderMath(md.parse(source) as string);
}
