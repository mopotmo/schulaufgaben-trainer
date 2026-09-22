/**
 * Schulbücher. **Ausschließlich die eigene Gruppe.**
 *
 * Urheberrecht: Ein hochgeladenes Schulbuch ist eine im Wesentlichen
 * vollständige Vervielfältigung und damit nach § 53 Abs. 4 lit. b UrhG nicht von der
 * Privatkopie gedeckt. Solange es im eigenen Haushalt bleibt, ist die Lage diskutabel;
 * eine Weitergabe an fremde Familien wäre es nicht. Deshalb gibt es hier keinen Pfad,
 * der ein Buch gruppenübergreifend freigibt.
 *
 * Die Spalte `visibility` bleibt in Directus bestehen, wird aber nicht mehr ausgewertet —
 * ein dort gesetztes 'shared' bleibt wirkungslos.
 */
import { readItem, readItems, createItem, updateItem, deleteItem, deleteFile, uploadFiles } from '@directus/sdk';
import { error } from '@sveltejs/kit';
import { getDirectus, type Book } from '$lib/server/directus';
import { assertCan, currentGroupId, type Actor } from '../authz';
import { requireUuid } from './profiles';

/** Darf dieser Actor das Buch nutzen? Nur, wenn es der eigenen Gruppe gehört. */
export function canAccessBook(book: Book, actor: Actor): boolean {
	return !!book.owner_group && actor.groupIds.includes(book.owner_group);
}

export async function listBooks(actor: Actor, fields?: string[]): Promise<Book[]> {
	assertCan(actor, 'book:read');
	return getDirectus().request(
		readItems('books', {
			filter: { owner_group: { _in: actor.groupIds } },
			...(fields ? { fields: fields as never } : {}),
			sort: ['subject', 'grade', 'title'],
			limit: -1
		})
	);
}

export async function getBook(actor: Actor, bookId: unknown): Promise<Book> {
	assertCan(actor, 'book:read');
	const id = requireUuid(bookId, 'Buch-ID');

	const book = await getDirectus().request(readItem('books', id)).catch(() => null);
	if (!book) error(404, 'Buch nicht gefunden');
	if (!canAccessBook(book, actor)) error(403, 'Kein Zugriff auf dieses Buch');
	return book;
}

/** Nur der Eigentümer darf ändern oder löschen — geteilte Bücher fremder Gruppen nicht. */
async function getOwnBook(actor: Actor, bookId: unknown): Promise<Book> {
	const book = await getBook(actor, bookId);
	if (!book.owner_group || !actor.groupIds.includes(book.owner_group)) {
		error(403, 'Kein Zugriff auf dieses Buch');
	}
	return book;
}

export type NewBook = {
	title: string;
	subject: string;
	grade: number;
	school_type: string | null;
	publisher: string | null;
	isbn: string | null;
	file: string;
	chapters: Book['chapters'];
	page_count: number;
};

export async function createBook(actor: Actor, data: NewBook): Promise<Book> {
	assertCan(actor, 'book:create');
	return getDirectus().request(
		createItem('books', {
			...data,
			page_offset: 0,
			owner_group: currentGroupId(actor),
			// Bleibt aus Gründen der Abwärtskompatibilität gesetzt, wird nicht mehr ausgewertet.
			visibility: 'family'
		})
	);
}

export async function uploadBookFile(actor: Actor, form: FormData): Promise<string> {
	assertCan(actor, 'book:create');
	const uploaded = await getDirectus().request(uploadFiles(form));
	return (uploaded as { id: string }).id;
}

export async function updatePageOffset(actor: Actor, bookId: unknown, offset: number): Promise<void> {
	assertCan(actor, 'book:update');
	const book = await getOwnBook(actor, bookId);
	await getDirectus().request(updateItem('books', book.id, { page_offset: offset }));
}

export async function deleteBook(actor: Actor, bookId: unknown): Promise<Book> {
	assertCan(actor, 'book:delete');
	const book = await getOwnBook(actor, bookId);
	const directus = getDirectus();
	await directus.request(deleteItem('books', book.id));
	if (book.file) await directus.request(deleteFile(book.file)).catch(() => undefined);
	return book;
}
