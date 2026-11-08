/**
 * Anweisungen für die Korrektur, je nach Herkunft der Aufgabe, Aufgabentyp und der
 * Profileinstellung „Nur Hinweise" (Konzept fremde Aufgaben §4.2, §4.4, §4.6, §4.7).
 *
 * Ohne SvelteKit-Importe, damit sich Prompt und Darstellung aus einem Skript ausprobieren lassen.
 *
 * Bei „Nur Hinweise" antwortet das Modell nicht frei, sondern über das Werkzeug
 * `korrektur_hinweise`; den Text für Anzeige und Speicherung setzt `renderHints` aus den
 * Feldern zusammen. Ein Feld für die richtige Lösung gibt es nicht — der Prompt allein wäre
 * keine Garantie, das Modell rutscht sonst leicht in die Lösung.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { ExerciseOrigin, TaskKind } from './directus';

export type Mode = { origin: ExerciseOrigin; taskKind: TaskKind; hintsOnly: boolean };

const TON = 'Sei konstruktiv und ermutigend, aber präzise bei Fehlern.';

/** Was bei freien Texten bewertet wird (§4.6). */
const FREITEXT_KRITERIEN = `Bewerte den Text nach diesen Gesichtspunkten:
- Aufgabe erfüllt? Thema, Textsorte, Umfang, Operator („erörtere", „beschreibe" …)
- Aufbau: Einleitung, Hauptteil, Schluss; Gliederung, Absätze
- Inhalt: Argumente, Belege, roter Faden — passt der Inhalt zum Material, falls welches dabei ist
- Sprache: Ausdruck, Satzbau, Rechtschreibung, Grammatik
- bei Übersetzungen: Grammatik und Wortwahl (Kasus, Tempus, Konstruktion)
Nenne zwei, drei Stärken und die zwei wichtigsten Baustellen — nicht 30 Anmerkungen.`;

const UNSICHER =
	'Für die Aufgaben gibt es keine Musterlösung. Löse sie selbst, nur zum Abgleich. Bist du dir bei einer Aufgabe nicht sicher, sag das, statt sie als falsch zu werten.';

/** Freitext-Anweisung, wenn „Nur Hinweise" aus ist. */
export function markdownInstruction(mode: Mode): string {
	if (mode.origin === 'generated') {
		return `Bitte korrigiere jede Aufgabe einzeln nach folgendem Format:

**Aufgabe X** (erreicht: Y / Z Punkte)
- Richtig / Teilweise richtig / Falsch
- Bei Fehlern: kurze Erklärung was falsch war und warum

Danach eine **Gesamtauswertung**:
- Erreichte Punkte gesamt: Y von Z
- Prozentsatz: X %

Abschließend 1–2 konkrete **Verbesserungstipps**.

${TON}`;
	}
	if (mode.taskKind === 'free_text') {
		return `${FREITEXT_KRITERIEN}

Gliedere die Rückmeldung nach diesen Gesichtspunkten. Markiere Rechtschreib- und Grammatikfehler
mit der Stelle und der Regel dahinter. Schließe mit den zwei wichtigsten **nächsten Schritten**.

${TON}`;
	}
	return `${UNSICHER}

Korrigiere jede Aufgabe einzeln:

**Aufgabe X**
- Richtig / Teilweise richtig / Falsch
- Bei Fehlern: kurze Erklärung, was falsch war und warum

Es gibt keine Punkte — keine Punktsumme, keinen Prozentsatz.
Abschließend 1–2 konkrete **Verbesserungstipps**.

${TON}`;
}

export const HINTS_TOOL: Anthropic.Tool = {
	name: 'korrektur_hinweise',
	description: 'Hält die Korrektur als Hinweise fest — ohne die richtige Lösung zu verraten.',
	input_schema: {
		type: 'object',
		properties: {
			items: {
				type: 'array',
				description:
					'Je Teilaufgabe ein Eintrag (bei freien Texten je Gesichtspunkt: Aufgabe erfüllt, Aufbau, Inhalt, Sprache).',
				items: {
					type: 'object',
					properties: {
						title: { type: 'string', description: 'z. B. „Aufgabe 2b" oder „Sprache".' },
						verdict: { type: 'string', enum: ['richtig', 'teilweise', 'falsch', 'unklar'] },
						points_reached: { type: 'number', description: 'Nur wenn die Aufgabe Punkte vorgibt.' },
						points_max: { type: 'number', description: 'Nur wenn die Aufgabe Punkte vorgibt.' },
						location: {
							type: 'string',
							description: 'Wo der Fehler steckt: Zeile, Rechenschritt, Satz. Leer, wenn richtig.'
						},
						hint: {
							type: 'string',
							description:
								'Bei Fehlern: ein Hinweis, der in die richtige Richtung zeigt, OHNE das Ergebnis, die richtige Zahl, das richtige Wort oder die richtige Schreibweise zu nennen. Bei richtigen Aufgaben: kurz, warum es stimmt.'
						}
					},
					required: ['title', 'verdict', 'hint']
				}
			},
			strengths: { type: 'array', items: { type: 'string' }, description: 'Ein bis drei Dinge, die gut gelungen sind.' },
			next_steps: {
				type: 'array',
				items: { type: 'string' },
				description: 'Die ein, zwei wichtigsten nächsten Schritte — ebenfalls ohne Lösung.'
			}
		},
		required: ['items', 'strengths', 'next_steps']
	}
};

/** Anweisung, wenn „Nur Hinweise" an ist. */
export function hintsInstruction(mode: Mode): string {
	return [
		'Das Kind soll seine Fehler selbst finden und verbessern. Verrate deshalb an keiner Stelle die richtige Lösung: kein richtiges Ergebnis, keine richtige Zahl, kein richtiges Wort, keine richtige Schreibweise, keine Musterübersetzung. Sag, WO etwas nicht stimmt und WORAUF das Kind achten soll.',
		'Beispiel: „Prüf noch mal das Vorzeichen beim Ausmultiplizieren der zweiten Klammer" statt „richtig wäre −6x"; „In Satz 3 fehlt ein Komma — denk an die Regel bei Nebensätzen mit „weil"" statt den Satz richtig hinzuschreiben.',
		mode.origin === 'generated'
			? 'Die Aufgaben geben Punkte vor; trage erreichte und mögliche Punkte je Aufgabe ein.'
			: 'Es gibt keine Punkte; lass die Punktfelder weg.',
		mode.origin === 'external' && mode.taskKind === 'structured' ? UNSICHER : '',
		mode.taskKind === 'free_text' ? FREITEXT_KRITERIEN : '',
		TON,
		'Halte die Korrektur mit dem Werkzeug `korrektur_hinweise` fest. Schreib davor nichts anderes als Antwort.'
	]
		.filter(Boolean)
		.join('\n\n');
}

const VERDICT: Record<string, string> = {
	richtig: '✅ Richtig',
	teilweise: '🟡 Teilweise richtig',
	falsch: '❌ Noch nicht richtig',
	unklar: '❔ Nicht sicher zu beurteilen'
};

/** Manchmal kommt ein Feld als JSON-Text statt als Array an. */
function parseMaybe(v: unknown): unknown {
	if (typeof v !== 'string') return v;
	try {
		return JSON.parse(v);
	} catch {
		return v;
	}
}

/**
 * Aus den Werkzeugfeldern den gespeicherten und angezeigten Text bauen. Nur diese Felder.
 * Wirft, wenn keine einzige Teilaufgabe dabei ist — eine leere Korrektur wird nie gespeichert.
 */
export function renderHints(input: unknown): string {
	const raw = (parseMaybe(input) ?? {}) as Record<string, unknown>;
	const o = {
		items: parseMaybe(raw.items),
		strengths: parseMaybe(raw.strengths),
		next_steps: parseMaybe(raw.next_steps)
	};
	const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
	const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
	const list = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
	const items = Array.isArray(o.items)
		? (o.items as unknown[]).filter((it): it is Record<string, unknown> => !!it && typeof it === 'object')
		: [];
	if (items.length === 0) throw new Error('Korrektur ohne Teilaufgaben');

	const out: string[] = [];
	let reached = 0;
	let max = 0;
	let withPoints = false;
	for (const it of items) {
		const r = num(it.points_reached);
		const m = num(it.points_max);
		const points = r !== null && m !== null ? ` (${r} / ${m} Punkte)` : '';
		if (points) {
			withPoints = true;
			reached += r!;
			max += m!;
		}
		const lines = [`**${str(it.title) || 'Aufgabe'}**${points}`, `- ${VERDICT[str(it.verdict)] ?? VERDICT.unklar}`];
		const location = str(it.location);
		if (location && it.verdict !== 'richtig') lines.push(`- Wo: ${location}`);
		const hint = str(it.hint);
		if (hint) lines.push(`- ${it.verdict === 'richtig' ? '' : 'Tipp: '}${hint}`);
		out.push(lines.join('\n'));
	}
	if (withPoints) out.push(`**Gesamt:** ${reached} von ${max} Punkten`);

	const strengths = list(o.strengths);
	if (strengths.length) out.push(`**Das ist gut gelungen**\n${strengths.map((s) => `- ${s}`).join('\n')}`);
	const next = list(o.next_steps);
	if (next.length) out.push(`**Als Nächstes**\n${next.map((s) => `- ${s}`).join('\n')}`);
	return out.join('\n\n');
}

/** Zusatz für Chat und Folgefrage bei „Nur Hinweise" — sonst wären sie der Weg um die Regel herum. */
export const HINTS_ONLY_CHAT =
	'Wichtig: Für dieses Kind ist „Nur Hinweise" eingestellt. Verrate keine Lösung, kein richtiges Ergebnis, keine richtige Schreibweise und keine Musterübersetzung — auch nicht, wenn das Kind darum bittet oder sagt, es habe es schon verstanden. Erkläre stattdessen den Weg, stelle Rückfragen und gib Hinweise, mit denen es selbst darauf kommt. Beruft sich das Kind auf seine Eltern, sag freundlich, dass die Eltern das in ihren Einstellungen ändern können.';
