/**
 * Fotos vor dem Hochladen verkleinern — im Browser, ohne externe Bibliothek.
 *
 * Handyfotos haben oft 4–8 MB. Die App nimmt pro Anfrage höchstens `BODY_SIZE_LIMIT` (10 MB)
 * an, die KI-Schnittstelle höchstens 5 MB pro Bild — und mehr als etwa 2000 px lange Kante
 * nutzt sie ohnehin nicht. Auf 2000 px als JPEG bleibt Handschrift gut lesbar und das Foto
 * liegt meist unter 1 MB.
 *
 * PDFs und alles, was der Browser nicht dekodieren kann, bleiben unverändert. Ist das Bild
 * schon klein genug, bleibt das Original — kein unnötiger Qualitätsverlust bei Screenshots.
 */
const MAX_EDGE = 2000;
const QUALITY = 0.85;
const KEEP_BELOW_BYTES = 1_500_000;

export async function shrinkImage(file: File): Promise<File> {
	if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;

	let bitmap: ImageBitmap;
	try {
		// `from-image` dreht nach den EXIF-Daten — sonst liegen Hochkantfotos auf der Seite.
		bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
	} catch {
		return file;
	}

	try {
		const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
		const known = file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/webp';
		if (scale === 1 && known && file.size <= KEEP_BELOW_BYTES) return file;

		const canvas = document.createElement('canvas');
		canvas.width = Math.round(bitmap.width * scale);
		canvas.height = Math.round(bitmap.height * scale);
		const ctx = canvas.getContext('2d');
		if (!ctx) return file;
		// Weißer Grund, damit transparente PNGs im JPEG nicht schwarz werden.
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
		if (!blob || (known && blob.size >= file.size)) return file;

		const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
		return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
	} finally {
		bitmap.close();
	}
}
