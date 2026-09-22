import { fail } from '@sveltejs/kit';
import { extractChapters, getPdfPageCount } from '$lib/books';
import { logError } from '$lib/server/logger';
import { requireActor } from '$lib/server/actor';
import { assertCan, currentGroupId } from '$lib/server/authz';
import { listBooks, createBook, uploadBookFile, updatePageOffset, deleteBook } from '$lib/server/repo/books';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const actor = requireActor(locals);
	return { books: await listBooks(actor), groupId: currentGroupId(actor) };
};

export const actions: Actions = {
	upload: async ({ request, locals }) => {
		const actor = requireActor(locals);
		// Vor dem PDF-Parsen und vor extractChapters — letzteres ruft die Anthropic-API auf
		// und würde sonst auf unsere Rechnung laufen, bevor die Berechtigung geprüft ist.
		assertCan(actor, 'book:create');

		const form = await request.formData();
		const title = (form.get('title') as string)?.trim();
		const subject = (form.get('subject') as string)?.trim();
		const grade = parseInt(form.get('grade') as string);
		const schoolType = (form.get('school_type') as string)?.trim() || null;
		const publisher = (form.get('publisher') as string)?.trim() || null;
		const isbn = (form.get('isbn') as string)?.trim() || null;
		const file = form.get('file') as File;

		if (!title || !subject || !grade) return fail(400, { error: 'Bitte Titel, Fach und Klasse angeben.' });
		if (!file || file.size === 0) return fail(400, { error: 'Bitte ein PDF auswählen.' });
		if (file.type !== 'application/pdf') return fail(400, { error: 'Nur PDF-Dateien werden unterstützt.' });

		let pdfBytes: Uint8Array;
		let pageCount: number;
		try {
			pdfBytes = new Uint8Array(await file.arrayBuffer());
			pageCount = await getPdfPageCount(pdfBytes);
		} catch (e) {
			await logError('buecher/upload', e, { title });
			return fail(400, { error: 'Das PDF konnte nicht gelesen werden.' });
		}

		let fileId: string;
		try {
			const uploadForm = new FormData();
			uploadForm.append('title', title);
			uploadForm.append('file', file);
			fileId = await uploadBookFile(actor, uploadForm);
		} catch (e) {
			await logError('buecher/upload', e, { title });
			return fail(502, { error: 'Der Upload zu Directus ist fehlgeschlagen.' });
		}

		// Indexierung ist nicht fatal — das Buch wird auch ohne Kapitel angelegt.
		let chapters: Awaited<ReturnType<typeof extractChapters>> = [];
		try {
			chapters = await extractChapters(pdfBytes, pageCount);
		} catch (e) {
			await logError('buecher/indexierung', e, { title });
		}

		await createBook(actor, {
			title, subject, grade, school_type: schoolType, publisher, isbn,
			file: fileId, chapters, page_count: pageCount
		});

		return {
			success:
				chapters.length > 0
					? `„${title}" wurde hochgeladen – ${chapters.length} Kapitel erkannt.`
					: `„${title}" wurde hochgeladen. Es konnten keine Kapitel erkannt werden – beim Generieren kannst du den Seitenbereich manuell angeben.`
		};
	},

	updateOffset: async ({ request, locals }) => {
		const actor = requireActor(locals);
		const form = await request.formData();
		const offset = parseInt(form.get('page_offset') as string);
		if (!Number.isFinite(offset)) return fail(400, { error: 'Ungültige Eingabe.' });

		await updatePageOffset(actor, form.get('id'), offset);
		return { success: 'Seiten-Versatz gespeichert.' };
	},

	delete: async ({ request, locals }) => {
		const actor = requireActor(locals);
		const form = await request.formData();
		const book = await deleteBook(actor, form.get('id'));
		return { success: `„${book.title}" wurde gelöscht.` };
	}
};
