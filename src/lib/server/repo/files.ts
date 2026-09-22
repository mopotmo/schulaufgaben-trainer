/**
 * Datei-Uploads nach Directus. Eigene Datei, weil zwei Routen hochladen und `getDirectus()`
 * laut harter Regel 1 nur hier und in den übrigen Repos vorkommen darf.
 *
 * Die Dateien selbst tragen keine Gruppenzuordnung — sie hängen über `exercises.source_file`
 * bzw. `corrections.solution_file` an einer Ressource, die geprüft ist.
 */
import { uploadFiles } from '@directus/sdk';
import { getDirectus } from '../directus';
import type { Actor } from '../authz';

export async function uploadFile(_actor: Actor, form: FormData): Promise<string | null> {
	const uploaded = await getDirectus().request(uploadFiles(form));
	return (uploaded as { id?: string }).id ?? null;
}
