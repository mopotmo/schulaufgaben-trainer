/**
 * Abschreiben fremder Aufgaben (Konzept fremde Aufgaben §4.1). Ohne SvelteKit-Importe, damit
 * sich Prompt und Werkzeug auch aus einem Skript ausprobieren lassen.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { TaskKind } from './directus';

export const MAX_FILES = 10;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

const TOOL: Anthropic.Tool = {
	name: 'aufgabe_erfasst',
	description: 'Hält die abgeschriebene Aufgabenstellung und ihre Einordnung fest.',
	input_schema: {
		type: 'object',
		properties: {
			content: {
				type: 'string',
				description:
					'Die Aufgabenstellung wörtlich, als Markdown. Jede Aufgabe beginnt mit „Aufgabe X:" in der Nummerierung des Originals, Teilaufgaben als a), b), c). Formeln in KaTeX ($…$ bzw. $$…$$). Ohne Lösungen des Kindes.'
			},
			subject: { type: 'string', description: 'Schulfach, z. B. Mathematik, Deutsch, Englisch.' },
			topic: { type: 'string', description: 'Thema in wenigen Worten, z. B. „Bruchrechnung" oder „Erörterung".' },
			task_kind: {
				type: 'string',
				enum: ['structured', 'free_text'],
				description:
					'structured: Aufgaben mit eindeutiger Lösung (Rechnen, Lückentext, Vokabeln, Fragen). free_text: Aufsatz, Erörterung, Inhaltsangabe, Bildbeschreibung, Übersetzung eines längeren Textes.'
			},
			solution_on_sheet: {
				type: 'boolean',
				description: 'true, wenn das Kind auf den Fotos schon eine Lösung geschrieben hat.'
			},
			solution_transcript: {
				type: 'string',
				description:
					'Nur bei task_kind free_text und solution_on_sheet: der Text des Kindes, buchstabengetreu mit allen Fehlern abgeschrieben. Sonst leer lassen.'
			},
			unreadable: {
				type: 'array',
				items: { type: 'string' },
				description: 'Stellen, die du nicht sicher lesen konntest, je kurz beschrieben (z. B. „Aufgabe 3b, zweite Zahl").'
			}
		},
		required: ['content', 'subject', 'topic', 'task_kind', 'solution_on_sheet', 'unreadable']
	}
};

export type Erfasst = {
	content: string;
	subject: string;
	topic: string;
	taskKind: TaskKind;
	solutionOnSheet: boolean;
	solutionTranscript: string;
	unreadable: string[];
};

export function normalize(input: unknown): Erfasst {
	const o = (input ?? {}) as Record<string, unknown>;
	const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
	const taskKind: TaskKind = o.task_kind === 'free_text' ? 'free_text' : 'structured';
	const solutionOnSheet = o.solution_on_sheet === true;
	return {
		content: str(o.content),
		subject: str(o.subject).slice(0, 100),
		topic: str(o.topic).slice(0, 200),
		taskKind,
		solutionOnSheet,
		solutionTranscript: taskKind === 'free_text' && solutionOnSheet ? str(o.solution_transcript) : '',
		unreadable: Array.isArray(o.unreadable)
			? o.unreadable.filter((u): u is string => typeof u === 'string' && u.trim() !== '').map((u) => u.trim())
			: []
	};
}

export type Upload = { type: string; data: string };

/** Fotos/PDF und Begleittext → Werkzeugaufruf. Wirft, wenn keine Werkzeugantwort kommt. */
export async function transcribe(
	anthropic: Anthropic,
	opts: { uploads: Upload[]; text: string; subjects: string[]; schoolType: string; grade: number }
): Promise<{ erfasst: Erfasst; tokensUsed: number }> {
	const { uploads, text, subjects } = opts;
	const content: Anthropic.MessageParam['content'] = [];
	uploads.forEach((u, i) => {
		if (uploads.length > 1) content.push({ type: 'text', text: `Seite ${i + 1}:` });
		content.push(
			u.type === 'application/pdf'
				? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: u.data } }
				: { type: 'image', source: { type: 'base64', media_type: u.type as ImageType, data: u.data } }
		);
	});
	content.push({
		type: 'text',
		text: [
			uploads.length ? 'Schreibe die Aufgabenstellung von den Fotos ab.' : 'Ordne diese Aufgabenstellung ein und bring sie ins Format.',
			text ? `${uploads.length ? 'Dazu hat das Kind notiert' : 'Aufgabenstellung'}:\n${text}` : '',
			subjects.length
				? `Fächer, die dieses Kind schon benutzt: ${subjects.join(', ')}. Passt eins davon, übernimm es in genau dieser Schreibweise.`
				: '',
			'Halte das Ergebnis mit dem Werkzeug `aufgabe_erfasst` fest.'
		]
			.filter(Boolean)
			.join('\n\n')
	});

	const stream = anthropic.messages.stream({
		model: 'claude-opus-4-8',
		max_tokens: 8192,
		tools: [TOOL],
		tool_choice: { type: 'tool', name: TOOL.name },
		system: [
			`Du schreibst Schulaufgaben ab, damit ein Kind (${opts.schoolType}, Klasse ${opts.grade}) sie korrigieren lassen kann.`,
			'Übernimm die Aufgabenstellung wörtlich und vollständig, mit der Nummerierung des Originals. Löse nichts und ergänze nichts.',
			'Lass weg: Namen von Kindern und Lehrkräften, Schulname, Klasse, Datum, Unterschriften. Steht so etwas in einer Aufgabe selbst (z. B. eine Textaufgabe über „Lisa"), bleibt es stehen.',
			'Was du nicht sicher lesen kannst, schreibst du so gut es geht ab, markierst es mit [?] und nennst es unter unreadable. Rate nicht still.'
		].join('\n'),
		messages: [{ role: 'user', content }]
	});
	const message = await stream.finalMessage();
	const call = message.content.find((b) => b.type === 'tool_use');
	if (!call) throw new Error(`Keine Werkzeugantwort (stop_reason: ${message.stop_reason})`);
	return {
		erfasst: normalize(call.input),
		tokensUsed: (message.usage.input_tokens ?? 0) + (message.usage.output_tokens ?? 0)
	};
}
