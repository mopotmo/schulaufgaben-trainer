/**
 * Schreibplatz auf dem gedruckten Blatt.
 *
 * Die Generierung setzt nach jeder Aufgabe eine Zeile `[Schreibplatz: N]`, N = Schreibzeilen.
 * `renderMarkdown` macht daraus im PDF Freiraum und lässt sie am Bildschirm weg. Anweisung
 * und Erkennung stehen hier zusammen, damit sie nicht auseinanderlaufen.
 */

/** Für den Format-Teil der Prompts, die ein Blatt erzeugen (Generieren, Nachschärfen). */
export const SCHREIBPLATZ_ANWEISUNG =
	'Nach jeder Aufgabe bzw. Teilaufgabe, die eine schriftliche Antwort verlangt, eine eigene Zeile ' +
	'"[Schreibplatz: N]" – N ist die Zahl der Schreibzeilen, passend zum erwarteten Lösungsweg ' +
	'(z.B. 3 für eine kurze Antwort, 10 für eine längere Rechnung). Den Platz nicht selbst mit ' +
	'Leerzeilen, Punkten oder HTML erzeugen.';

/** Obergrenze, damit ein verrutschtes N kein Blatt voller Leerseiten erzeugt. */
const MAX_ZEILEN = 30;

/**
 * Eine Zeile, die Schreibplatz meint. Neben der Markierung die Formen, mit denen das Modell
 * vorher Platz geschaffen hat — sie stehen so in Blättern in Directus:
 * `.`, `\` (harter Umbruch), `&nbsp;` und `<br><br>…`.
 */
const ZEILE =
	/^[ \t]*(?:\[Schreibplatz:[ \t]*(\d+)[ \t]*\]|\.|\\|&nbsp;|((?:<br\s*\/?>[ \t]*)+))[ \t]*$/i;

/** Wo im Quelltext der nächste Schreibplatz beginnt — damit er einen Absatz beendet. */
export function schreibplatzStart(src: string): number | undefined {
	const m = new RegExp(ZEILE.source, 'im').exec(src);
	return m ? m.index : undefined;
}

/**
 * Liest eine Folge von Schreibplatz-Zeilen am Anfang von `src` (Leerzeilen dazwischen
 * zählen mit zur Folge). Gibt den verbrauchten Quelltext und die Zahl der Schreibzeilen
 * zurück, oder null, wenn `src` nicht mit Schreibplatz beginnt.
 */
export function leseSchreibplatz(src: string): { raw: string; zeilen: number } | null {
	let raw = '';
	let zeilen = 0;
	let rest = src;

	while (rest.length > 0) {
		const ende = rest.indexOf('\n');
		const zeile = ende === -1 ? rest : rest.slice(0, ende);
		const umbruch = ende === -1 ? '' : '\n';

		if (zeile.trim() === '') {
			// Leerzeilen nur innerhalb einer Folge verbrauchen, nicht davor.
			if (zeilen === 0) break;
		} else {
			const m = ZEILE.exec(zeile);
			if (!m) break;
			if (m[1]) zeilen += Math.max(1, Number(m[1]));
			else if (m[2]) zeilen += (m[2].match(/<br/gi) ?? []).length;
			else zeilen += 1;
		}

		raw += zeile + umbruch;
		rest = rest.slice(zeile.length + umbruch.length);
	}

	if (zeilen === 0) return null;
	return { raw, zeilen: Math.min(zeilen, MAX_ZEILEN) };
}
