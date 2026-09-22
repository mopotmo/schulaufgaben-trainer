import { ANTHROPIC_API_KEY } from '$env/static/private';
import { json, error } from '@sveltejs/kit';
import Anthropic from '@anthropic-ai/sdk';
import { requireActor } from '$lib/server/actor';
import { getCorrection } from '$lib/server/repo/corrections';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { correctionId, question } = await request.json();
	if (!question || typeof question !== 'string') error(400, 'Fehlende Parameter');

	// Aufgabe und Korrektur kommen aus der Datenbank, nicht aus dem Request:
	// sonst bestimmt der Client den kompletten Prompt-Inhalt.
	const actor = requireActor(locals);
	const { correction, exercise } = await getCorrection(actor, correctionId);

	const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

	try {
		const msg = await anthropic.messages.create({
			model: 'claude-sonnet-4-6',
			max_tokens: 1024,
			system: 'Du bist ein hilfreicher Nachhilfelehrer. Beantworte Rückfragen des Schülers zur Korrektur seiner Aufgabe. Sei klar, ermutigend und lehrreich.',
			messages: [
				{
					role: 'user',
					content: `Aufgabenstellung:\n${exercise.generated_content ?? ''}\n\nKorrektur:\n${correction.correction_result}\n\nRückfrage des Schülers: ${question}`
				}
			]
		});

		const answer = msg.content.find((b) => b.type === 'text')?.text ?? '';
		return json({ answer });
	} catch {
		error(502, 'Fehler bei der Antwort');
	}
};
