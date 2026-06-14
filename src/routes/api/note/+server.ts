import { ANTHROPIC_API_KEY } from '$env/static/private';
import { json, error } from '@sveltejs/kit';
import Anthropic from '@anthropic-ai/sdk';
import type { RequestHandler } from './$types';

const GRADE_SCALE = `
Notenschlüssel (bayerisches Gymnasium):
- Note 1 (sehr gut):       ≥ 87 %
- Note 2 (gut):            ≥ 75 %
- Note 3 (befriedigend):   ≥ 60 %
- Note 4 (ausreichend):    ≥ 45 %
- Note 5 (mangelhaft):     ≥ 20 %
- Note 6 (ungenügend):     < 20 %`;

export const POST: RequestHandler = async ({ request }) => {
	const { correctionResult } = await request.json();
	if (!correctionResult) error(400, 'correctionResult fehlt');

	const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

	try {
		const msg = await anthropic.messages.create({
			model: 'claude-haiku-4-5-20251001',
			max_tokens: 256,
			messages: [
				{
					role: 'user',
					content: `Berechne anhand des folgenden Korrekturberichts die Note nach dem bayerischen Gymnasium-Notenschlüssel und gib sie in einem einzigen kurzen Satz aus (z.B. "Note: 2 (gut) – 78 %").\n\n${GRADE_SCALE}\n\nKorrektur:\n${correctionResult}`
				}
			]
		});

		const grade = msg.content.find((b) => b.type === 'text')?.text ?? '';
		return json({ grade });
	} catch {
		error(502, 'Fehler bei der Notenberechnung');
	}
};
