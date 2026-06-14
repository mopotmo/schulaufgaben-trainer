import { ANTHROPIC_API_KEY } from '$env/static/private';
import { json, error } from '@sveltejs/kit';
import Anthropic from '@anthropic-ai/sdk';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const { exerciseContent, correctionResult, question } = await request.json();
	if (!question || !correctionResult) error(400, 'Fehlende Parameter');

	const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

	try {
		const msg = await anthropic.messages.create({
			model: 'claude-sonnet-4-6',
			max_tokens: 1024,
			system: 'Du bist ein hilfreicher Nachhilfelehrer. Beantworte Rückfragen des Schülers zur Korrektur seiner Aufgabe. Sei klar, ermutigend und lehrreich.',
			messages: [
				{
					role: 'user',
					content: `Aufgabenstellung:\n${exerciseContent}\n\nKorrektur:\n${correctionResult}\n\nRückfrage des Schülers: ${question}`
				}
			]
		});

		const answer = msg.content.find((b) => b.type === 'text')?.text ?? '';
		return json({ answer });
	} catch {
		error(502, 'Fehler bei der Antwort');
	}
};
