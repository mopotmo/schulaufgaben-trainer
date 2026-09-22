/**
 * Eine Teilaufgabe — und damit genau ein Antwortfeld.
 *
 * `index` läuft über das ganze Blatt. Entwürfe im localStorage, die Zeichenflächen und die
 * Korrektur hängen an dieser Position; die Gruppierung darunter ist reine Darstellung.
 */
export type ParsedPart = {
	/** `a)`, `b)` … — oder null, wenn die Aufgabe nicht unterteilt ist. */
	label: string | null;
	body: string;
	index: number;
	/** Für die Korrektur: `Aufgabe 2 (6 Punkte) a)`. */
	title: string;
};

export type ParsedExercise = {
	title: string;
	/** Gemeinsamer Text über a) / b) / c) — steht einmal über der Gruppe, nicht in jeder Teilaufgabe. */
	preamble: string;
	parts: ParsedPart[];
};

/**
 * Der `---`-Trenner zwischen zwei Aufgaben gehört zu keiner von beiden.
 *
 * Getrennt wird vor dem Wort „Aufgabe", der Trenner bleibt dadurch am Ende des vorherigen
 * Blocks hängen — und damit in der letzten Teilaufgabe, wo er als Linie über dem Antwortfeld
 * erscheint.
 */
function stripRules(text: string): string {
	return text
		.replace(/^(?:\s*(?:-{3,}|\*{3,}|_{3,})\s*\n)+/, '')
		.replace(/(?:\n\s*(?:-{3,}|\*{3,}|_{3,})\s*)+$/, '')
		.trim();
}

export function parseExercises(content: string): ParsedExercise[] {
	// Die Generierung setzt Aufgaben-Überschriften fett: `**Aufgabe 1 (4 Punkte): Thema**`.
	// Getrennt wird aber *vor* dem Wort „Aufgabe" — die öffnenden Sternchen blieben dadurch
	// am Ende des vorherigen Blocks hängen (ein einsames `**` über dem Antwortfeld) und die
	// schließenden klebten an der Überschrift („… Architektur** b)").
	// Deshalb die Hervorhebung der Überschriften vorher entfernen, statt hinterher an beiden
	// Rändern Sternchen abzuschneiden — das würde legitimes `**Wichtig!**` im Text zerlegen.
	const normalized = content.replace(/\*\*\s*(Aufgabe\s+\d+[^*\n]*?)\s*\*\*/gi, '$1');

	// Split on "Aufgabe X" headers
	const blocks = normalized.split(/(?=Aufgabe\s+\d+)/i);

	const exercises: ParsedExercise[] = [];
	let index = 0;

	for (const block of blocks) {
		const trimmed = block.trim();
		if (!/^Aufgabe\s+\d+/i.test(trimmed)) continue;

		const lines = trimmed.split('\n');
		const parentTitle = lines[0].replace(/:$/, '').trim();
		const body = stripRules(lines.slice(1).join('\n').replace(/\n{3,}/g, '\n\n'));

		// Check for sub-tasks: lines starting with a), b), c) ...
		const subTaskPattern = /^([a-z]\))\s+(.+)/;
		const bodyLines = body.split('\n');
		const subTasks: { label: string; body: string }[] = [];
		let currentLabel = '';
		let currentBody: string[] = [];

		for (const line of bodyLines) {
			const m = line.match(subTaskPattern);
			if (m) {
				if (currentLabel) subTasks.push({ label: currentLabel, body: currentBody.join('\n').trim() });
				currentLabel = m[1];
				currentBody = [m[2]];
			} else if (currentLabel) {
				currentBody.push(line);
			}
		}
		if (currentLabel) subTasks.push({ label: currentLabel, body: currentBody.join('\n').trim() });

		if (subTasks.length > 1) {
			// Preamble: body lines before first sub-task
			const firstSubIdx = bodyLines.findIndex((l) => subTaskPattern.test(l));
			const preamble = firstSubIdx > 0 ? stripRules(bodyLines.slice(0, firstSubIdx).join('\n')) : '';

			exercises.push({
				title: parentTitle,
				preamble,
				parts: subTasks.map((sub) => ({
					label: sub.label,
					body: stripRules(sub.body),
					index: index++,
					title: `${parentTitle} ${sub.label}`
				}))
			});
		} else {
			exercises.push({
				title: parentTitle,
				preamble: '',
				parts: [{ label: null, body, index: index++, title: parentTitle }]
			});
		}
	}

	return exercises;
}

/** Alle Antwortfelder in der Reihenfolge, in der sie auf dem Blatt stehen. */
export function allParts(exercises: ParsedExercise[]): ParsedPart[] {
	return exercises.flatMap((e) => e.parts);
}
