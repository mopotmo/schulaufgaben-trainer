export type ParsedExercise = {
	title: string;
	body: string;
};

export function parseExercises(content: string): ParsedExercise[] {
	// Split on "Aufgabe X" (with optional points notation)
	const parts = content.split(/(?=Aufgabe\s+\d+)/i);

	return parts
		.map((p) => p.trim())
		.filter((p) => /^Aufgabe\s+\d+/i.test(p))
		.map((p) => {
			// Title = first line, body = rest (strip trailing whitespace lines)
			const lines = p.split('\n');
			const title = lines[0].replace(/:$/, '').trim();
			const body = lines
				.slice(1)
				.join('\n')
				.replace(/\n{3,}/g, '\n\n') // collapse excess blank lines
				.trim();
			return { title, body };
		});
}
