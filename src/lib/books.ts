import { PDFDocument } from 'pdf-lib';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY, DIRECTUS_TOKEN, DIRECTUS_URL } from '$env/static/private';
import type { Book, BookChapter } from './directus';

// Claude-API-Limit: max. 100 Seiten pro PDF-Dokument im Request
const MAX_CLAUDE_PAGES = 100;
// So viele Seiten vom Buchanfang werden für die Inhaltsverzeichnis-Erkennung verwendet
const TOC_PAGES = 14;

export async function fetchBookPdf(fileId: string): Promise<Uint8Array> {
	const url = new URL(`assets/${fileId}`, DIRECTUS_URL);
	const res = await fetch(url, { headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` } });
	if (!res.ok) throw new Error(`Buch-PDF konnte nicht geladen werden (${res.status})`);
	return new Uint8Array(await res.arrayBuffer());
}

/** Schneidet einen 1-basierten, inklusiven Seitenbereich aus dem PDF (gekappt auf 100 Seiten). */
export async function slicePdfPages(
	pdfBytes: Uint8Array,
	from: number,
	to: number
): Promise<{ base64: string; pageCount: number; from: number; to: number }> {
	const src = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
	const total = src.getPageCount();
	const start = Math.min(Math.max(1, from), total);
	const end = Math.min(Math.max(start, to), total, start + MAX_CLAUDE_PAGES - 1);

	const out = await PDFDocument.create();
	const indices = Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i);
	const pages = await out.copyPages(src, indices);
	for (const page of pages) out.addPage(page);
	const bytes = await out.save();
	return { base64: Buffer.from(bytes).toString('base64'), pageCount: indices.length, from: start, to: end };
}

export async function getPdfPageCount(pdfBytes: Uint8Array): Promise<number> {
	const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
	return doc.getPageCount();
}

/**
 * Extrahiert die Kapitelstruktur aus den ersten Seiten des Buchs (Inhaltsverzeichnis).
 * Die Seitenangaben sind gedruckte Buchseiten – der Versatz zur PDF-Seite steht in `page_offset`.
 */
export async function extractChapters(
	pdfBytes: Uint8Array,
	pageCount: number
): Promise<BookChapter[]> {
	const { base64 } = await slicePdfPages(pdfBytes, 1, Math.min(TOC_PAGES, pageCount));
	const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

	const message = await anthropic.messages.create({
		model: 'claude-sonnet-5',
		max_tokens: 2048,
		system:
			'Du extrahierst die Kapitelstruktur aus dem Inhaltsverzeichnis eines Schulbuchs. Antworte ausschließlich mit einem JSON-Array, ohne Markdown-Codeblock und ohne Erklärungen.',
		messages: [
			{
				role: 'user',
				content: [
					{
						type: 'document',
						source: { type: 'base64', media_type: 'application/pdf', data: base64 }
					},
					{
						type: 'text',
						text: [
							`Das sind die ersten Seiten eines Schulbuchs (das vollständige Buch hat ${pageCount} PDF-Seiten).`,
							`Extrahiere aus dem Inhaltsverzeichnis die Hauptkapitel als JSON-Array im Format:`,
							`[{"title": "Kapitelname", "pageStart": 12, "pageEnd": 41}]`,
							`Regeln:`,
							`- Nur Hauptkapitel, keine Unterkapitel.`,
							`- pageStart/pageEnd sind die gedruckten Seitenzahlen aus dem Inhaltsverzeichnis.`,
							`- pageEnd eines Kapitels = Seite vor pageStart des nächsten Kapitels; beim letzten Kapitel die letzte inhaltliche Buchseite (Anhang/Register ausnehmen, falls erkennbar).`,
							`- Falls kein Inhaltsverzeichnis erkennbar ist, antworte mit [].`
						].join('\n')
					}
				]
			}
		]
	});

	const text = message.content.find((b) => b.type === 'text')?.text ?? '';
	const jsonMatch = text.match(/\[[\s\S]*\]/);
	if (!jsonMatch) return [];

	try {
		const parsed = JSON.parse(jsonMatch[0]) as BookChapter[];
		return parsed.filter(
			(c) =>
				typeof c.title === 'string' &&
				Number.isFinite(c.pageStart) &&
				Number.isFinite(c.pageEnd) &&
				c.pageStart <= c.pageEnd
		);
	} catch {
		return [];
	}
}

/** Darf diese Familie das Buch nutzen? (eigenes Buch oder geteilt) */
export function canAccessBook(book: Book, familyId: string | null): boolean {
	return book.visibility === 'shared' || (!!familyId && book.owner_family === familyId);
}
