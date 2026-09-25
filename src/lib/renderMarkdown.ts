import { Marked } from 'marked';
import { renderMath } from './renderMath';
import { leseSchreibplatz, schreibplatzStart } from './schreibplatz';

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
function build(schreibplatz: boolean) {
	const md = new Marked({ async: false, breaks: true });
	md.use({
		extensions: [
			{
				/**
				 * Schreibplatz — `[Schreibplatz: N]` und die älteren Formen (`.`, `\`, `&nbsp;`,
				 * `<br>` je auf eigener Zeile), siehe `schreibplatz.ts`. Im PDF ein Absatz aus N
				 * Umbrüchen mit der Klasse `answer-gap`; daran erkennt ihn die Seitenaufteilung.
				 * Am Bildschirm nichts.
				 */
				name: 'schreibplatz',
				level: 'block',
				start: schreibplatzStart,
				tokenizer(src) {
					const gefunden = leseSchreibplatz(src);
					if (!gefunden) return undefined;
					return { type: 'schreibplatz', raw: gefunden.raw, zeilen: gefunden.zeilen };
				},
				renderer(token) {
					if (!schreibplatz) return '';
					return `<p class="answer-gap">${'<br>'.repeat(token.zeilen as number)}</p>\n`;
				}
			}
		],
		renderer: {
			/**
			 * Rohes HTML wird verworfen — auf dem Arbeitsblatt mit **einer** Ausnahme: `<br>`.
			 *
			 * Ganze `<br>`-Zeilen fängt schon der Schreibplatz oben ab; übrig bleibt `<br>`
			 * mitten im Text. `<br>` trägt keine Attribute und kann nichts ausführen, deshalb
			 * ist es die einzige Form, die durchgelassen wird — normalisiert, damit keine
			 * Schreibweise durchrutscht, die nur so aussieht.
			 */
			html(token) {
				if (!schreibplatz) return '';
				return /^<br\s*\/?>$/i.test(token.raw.trim()) ? '<br>' : '';
			}
		}
	});
	return md;
}

const bildschirm = build(false);
const papier = build(true);

export type RenderOptions = {
	/**
	 * Schreibplatz beibehalten. Nur für das PDF.
	 *
	 * Auf Papier ist er der Platz zum Schreiben. Am Bildschirm steht
	 * darunter ein Eingabefeld — dort wäre derselbe Platz nur ein rätselhaftes Loch
	 * zwischen Aufgabenstellung und Antwort.
	 */
	schreibplatz?: boolean;
};

export function renderMarkdown(
	source: string | null | undefined,
	{ schreibplatz = false }: RenderOptions = {}
): string {
	if (!source) return '';

	let html = (schreibplatz ? papier : bildschirm).parse(source) as string;
	// Verworfenes Inline-HTML (`<br>` am Bildschirm, `<img>` …) kann einen leeren Absatz
	// hinterlassen — unsichtbar, aber mit Außenabstand, also weiterhin eine Lücke.
	if (!schreibplatz) html = html.replace(/<p>\s*<\/p>\s*/g, '');

	return renderMath(html);
}
