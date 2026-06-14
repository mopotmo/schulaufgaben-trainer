export type ParsedExercise = {
	title: string;
	body: string;
};

export function parseExercises(content: string): ParsedExercise[] {
	// Split on "Aufgabe X" headers
	const parts = content.split(/(?=Aufgabe\s+\d+)/i);

	const exercises: ParsedExercise[] = [];

	for (const part of parts) {
		const trimmed = part.trim();
		if (!/^Aufgabe\s+\d+/i.test(trimmed)) continue;

		const lines = trimmed.split('\n');
		const parentTitle = lines[0].replace(/:$/, '').trim();
		const body = lines.slice(1).join('\n').replace(/\n{3,}/g, '\n\n').trim();

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
			const preamble = firstSubIdx > 0 ? bodyLines.slice(0, firstSubIdx).join('\n').trim() : '';

			for (const sub of subTasks) {
				exercises.push({
					title: `${parentTitle} ${sub.label}`,
					body: preamble ? `${preamble}\n\n${sub.body}` : sub.body
				});
			}
		} else {
			exercises.push({ title: parentTitle, body });
		}
	}

	return exercises;
}
