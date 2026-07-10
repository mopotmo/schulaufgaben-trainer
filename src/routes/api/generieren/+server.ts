import { getDirectus } from '$lib/directus';
import { createItem, uploadFiles, readItem } from '@directus/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { json, error } from '@sveltejs/kit';
import Anthropic from '@anthropic-ai/sdk';
import { logError } from '$lib/logger';
import { getInsightPrompt } from '$lib/learnerInsights';
import { fetchBookPdf, slicePdfPages, canAccessBook } from '$lib/books';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const form = await request.formData();
	const profilId = form.get('profilId') as string;
	const subject = form.get('subject') as string;
	const topic = form.get('topic') as string;
	const teacherNotes = (form.get('teacherNotes') as string) ?? '';
	const book = (form.get('book') as string) ?? '';
	const bookId = (form.get('bookId') as string) ?? '';
	let bookRanges: { from: number; to: number; title: string }[] = [];
	try {
		const raw = form.get('bookRanges') as string;
		if (raw) bookRanges = JSON.parse(raw);
	} catch {
		error(400, 'Ungültige Kapitelauswahl');
	}
	bookRanges = bookRanges.filter(
		(r) => Number.isFinite(r.from) && Number.isFinite(r.to) && r.from >= 1 && r.from <= r.to
	);
	const count = parseInt(form.get('count') as string) || 5;
	const difficulty = (form.get('difficulty') as string) ?? 'mittel';
	const durationMinutes = parseInt(form.get('durationMinutes') as string) || 0;
	const sourceFiles = (form.getAll('sourceFiles') as File[]).filter((f) => f && f.size > 0);

	if (!profilId || !subject || !topic) error(400, 'Pflichtfelder fehlen');

	const directus = getDirectus();
	const profile = await directus.request(readItem('profiles', profilId));
	const insightPrompt = await getInsightPrompt(profilId, subject, topic);

	const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

	const userContentParts: Anthropic.MessageParam['content'] = [];

	// Hinterlegtes Buch: gewählte Seitenbereiche aus dem PDF schneiden und als Dokumente mitgeben.
	// Claude akzeptiert max. 100 PDF-Seiten pro Request (über alle Dokumente hinweg).
	const MAX_BOOK_PAGES = 100;
	let storedBookNote = '';
	if (bookId && bookRanges.length > 0) {
		const totalPages = bookRanges.reduce((sum, r) => sum + (r.to - r.from + 1), 0);
		if (totalPages > MAX_BOOK_PAGES) {
			error(400, `Maximal ${MAX_BOOK_PAGES} Buchseiten pro Generierung (aktuell ${totalPages})`);
		}

		const storedBook = await directus.request(readItem('books', bookId)).catch(() => null);
		if (!storedBook || !canAccessBook(storedBook, locals.familyId)) {
			error(403, 'Kein Zugriff auf dieses Buch');
		}
		if (!storedBook.file) error(400, 'Für dieses Buch ist kein PDF hinterlegt');
		try {
			const pdfBytes = await fetchBookPdf(storedBook.file);
			const offset = storedBook.page_offset ?? 0;
			const noteParts: string[] = [];
			for (const range of bookRanges) {
				const slice = await slicePdfPages(pdfBytes, range.from + offset, range.to + offset);
				noteParts.push(
					range.title
						? `Kapitel „${range.title}" (Buchseiten ${range.from}–${range.to})`
						: `Buchseiten ${range.from}–${range.to}`
				);
				userContentParts.push({
					type: 'document',
					source: { type: 'base64', media_type: 'application/pdf', data: slice.base64 }
				});
			}
			// Cache-Breakpoint auf dem letzten Dokument deckt alle Buch-Auszüge davor mit ab
			const lastDoc = userContentParts[userContentParts.length - 1];
			if (lastDoc && typeof lastDoc !== 'string' && lastDoc.type === 'document') {
				lastDoc.cache_control = { type: 'ephemeral' };
			}
			storedBookNote = `Auszüge aus dem Schulbuch „${storedBook.title}": ${noteParts.join('; ')}`;
			userContentParts.push({ type: 'text', text: `Anbei: ${storedBookNote}.` });
		} catch (e) {
			await logError('api/generieren/buch', e, { bookId, bookRanges });
			error(502, 'Die Buchseiten konnten nicht geladen werden');
		}
	}

	if (sourceFiles.length > 0) {
		if (sourceFiles.length > 1) {
			userContentParts.push({
				type: 'text',
				text: `Hier sind ${sourceFiles.length} Seiten aus dem Schulbuch / Arbeitsblatt als Referenz:`
			});
		}
		for (let i = 0; i < sourceFiles.length; i++) {
			const file = sourceFiles[i];
			const mediaType = (file.type || 'image/jpeg') as
				| 'image/jpeg'
				| 'image/png'
				| 'image/gif'
				| 'image/webp';
			if (!mediaType.startsWith('image/')) continue;
			const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
			if (sourceFiles.length > 1) userContentParts.push({ type: 'text', text: `Seite ${i + 1}:` });
			userContentParts.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } });
		}
	}

	userContentParts.push({
		type: 'text',
		text: [
			`Thema: ${topic}`,
			teacherNotes ? `Hinweis vom Lehrer: ${teacherNotes}` : '',
			book ? `Lehrbuch/Quelle: ${book}` : '',
			storedBookNote ? `Als PDF angehängt: ${storedBookNote}.` : '',
			`Erstelle ${count} Übungsaufgaben, Schwierigkeitsgrad ${difficulty}.`,
			durationMinutes > 0
				? `Die Aufgaben sollen in ${durationMinutes} Minuten lösbar sein – passe Anzahl und Umfang der Aufgaben entsprechend an, auch wenn das von der gewünschten Anzahl abweicht.`
				: '',
			`Format: Jede Aufgabe beginnt mit "Aufgabe X (Y Punkte):" – vergib sinnvolle Punktzahlen passend zur Schwierigkeit und zum Umfang der Aufgabe (z.B. 2–6 Punkte pro Aufgabe). Am Ende eine Zeile: "Gesamt: Z Punkte"`,
			`Darunter ausreichend Leerzeilen für handschriftliche Antworten.`,
			`Wichtig: Nur die Aufgaben ausgeben, keine Musterlösungen.`
		]
			.filter(Boolean)
			.join('\n')
	});

	let generatedContent = '';
	let tokensUsed = 0;

	try {
		const stream = await anthropic.messages.stream({
			model: 'claude-opus-4-8',
			max_tokens: 4096,
			thinking: { type: 'adaptive' },
			tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
			system: [
			`Du bist ein erfahrener Lehrer für ${subject} an einem ${profile.school_type} in ${profile.state}, Klasse ${profile.grade}. Erstelle Übungsaufgaben, die sich zum Ausdrucken eignen (klare Struktur, ausreichend Platz zum Schreiben).`,
			`Du hast Zugriff auf eine Websuche. Nutze sie, wenn es hilfreich ist, um zum angegebenen Thema oder Lehrbuch zu recherchieren (z.B. Kapitelstruktur, Lehrplanbezug in ${profile.state}, typische Aufgabenstellungen), damit die Aufgaben besser zum tatsächlichen Stoff passen. Suche nur bei Bedarf, nicht bei trivialen Themen.`,
			book ? `Als Quelle wurde "${book}" angegeben – recherchiere gezielt danach, bevor du Aufgaben erstellst.` : '',
			storedBookNote
				? `Ein Kapitel aus dem tatsächlichen Schulbuch ist als PDF angehängt. Nutze es als primäre Vorlage für Aufgabentypen, Notation, Begriffe und Schwierigkeitsgrad – die Aufgaben sollen sich anfühlen wie aus diesem Buch. Nutze die Websuche höchstens ergänzend.`
				: '',
			`Gib am Ende ausschließlich die fertigen Aufgaben aus – keine Kommentare zur Recherche, keine Zwischenschritte.`,
			insightPrompt
		].filter(Boolean).join('\n\n'),
			messages: [{ role: 'user', content: userContentParts }]
		});

		const message = await stream.finalMessage();
		const textBlocks = message.content.filter((b) => b.type === 'text');
		generatedContent = textBlocks[textBlocks.length - 1]?.text ?? '';
		tokensUsed = (message.usage.input_tokens ?? 0) + (message.usage.output_tokens ?? 0);
	} catch (e) {
		await logError('api/generieren', e, { profilId, subject, topic, book });
		error(502, 'Fehler bei der Aufgabengenerierung');
	}

	let sourceFileId: string | null = null;
	if (sourceFiles.length > 0) {
		try {
			const uploadForm = new FormData();
			uploadForm.append('file', sourceFiles[0]);
			const uploaded = await directus.request(uploadFiles(uploadForm));
			sourceFileId = (uploaded as any).id ?? null;
		} catch (e) {
			await logError('api/generieren/upload', e, { profilId });
		}
	}

	const exercise = await directus.request(
		createItem('exercises', {
			profile_id: profilId,
			subject,
			topic,
			teacher_notes: teacherNotes,
			generated_content: generatedContent,
			source_file: sourceFileId,
			tokens_used: tokensUsed
		})
	);

	return json({ exerciseId: exercise.id, content: generatedContent, tokensUsed });
};
