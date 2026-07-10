import { getDirectus } from '$lib/directus';
import { createItem, deleteItem, readItem, readItems, updateItem, uploadFiles, deleteFile } from '@directus/sdk';
import { fail } from '@sveltejs/kit';
import { extractChapters, getPdfPageCount } from '$lib/books';
import { logError } from '$lib/logger';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const directus = getDirectus();
	const books = await directus.request(
		readItems('books', {
			filter: {
				_or: [{ owner_family: { _eq: locals.familyId! } }, { visibility: { _eq: 'shared' } }]
			},
			sort: ['subject', 'grade', 'title']
		})
	);
	return { books, familyId: locals.familyId };
};

export const actions: Actions = {
	upload: async ({ request, locals }) => {
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

		const directus = getDirectus();

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
			const uploaded = await directus.request(uploadFiles(uploadForm));
			fileId = (uploaded as any).id;
		} catch (e) {
			await logError('buecher/upload', e, { title });
			return fail(502, { error: 'Der Upload zu Directus ist fehlgeschlagen.' });
		}

		// Inhaltsverzeichnis indexieren – Fehler hier sind nicht fatal, das Buch wird trotzdem angelegt
		let chapters: Awaited<ReturnType<typeof extractChapters>> = [];
		try {
			chapters = await extractChapters(pdfBytes, pageCount);
		} catch (e) {
			await logError('buecher/indexierung', e, { title });
		}

		await directus.request(
			createItem('books', {
				title,
				subject,
				grade,
				school_type: schoolType,
				publisher,
				isbn,
				file: fileId,
				chapters,
				page_count: pageCount,
				page_offset: 0,
				owner_family: locals.familyId,
				visibility: 'family'
			})
		);

		return {
			success:
				chapters.length > 0
					? `„${title}" wurde hochgeladen – ${chapters.length} Kapitel erkannt.`
					: `„${title}" wurde hochgeladen. Es konnten keine Kapitel erkannt werden – beim Generieren kannst du den Seitenbereich manuell angeben.`
		};
	},

	updateOffset: async ({ request, locals }) => {
		const form = await request.formData();
		const id = form.get('id') as string;
		const offset = parseInt(form.get('page_offset') as string);
		if (!id || !Number.isFinite(offset)) return fail(400, { error: 'Ungültige Eingabe.' });

		const directus = getDirectus();
		const book = await directus.request(readItem('books', id));
		if (!book || book.owner_family !== locals.familyId) return fail(403, { error: 'Kein Zugriff auf dieses Buch.' });

		await directus.request(updateItem('books', id, { page_offset: offset }));
		return { success: 'Seiten-Versatz gespeichert.' };
	},

	delete: async ({ request, locals }) => {
		const form = await request.formData();
		const id = form.get('id') as string;
		if (!id) return fail(400, { error: 'Ungültige Eingabe.' });

		const directus = getDirectus();
		const book = await directus.request(readItem('books', id));
		if (!book || book.owner_family !== locals.familyId) return fail(403, { error: 'Kein Zugriff auf dieses Buch.' });

		await directus.request(deleteItem('books', id));
		if (book.file) {
			try {
				await directus.request(deleteFile(book.file));
			} catch (e) {
				await logError('buecher/delete-file', e, { bookId: id });
			}
		}
		return { success: `„${book.title}" wurde gelöscht.` };
	}
};
