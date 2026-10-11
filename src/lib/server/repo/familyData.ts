/**
 * Eltern-Bereich „Meine Daten" (Konzept §6, Stufe 2): Auskunft (Art. 15), Übertragbarkeit
 * (Art. 20) und Löschung (Art. 17) für die ganze Familie.
 *
 * Nur Eltern — `group:manage` gibt es nur in der Familiensitzung, ein angemeldetes Kind
 * kommt hier nicht hin.
 */
import {
	readItem,
	readItems,
	readFiles,
	deleteItem,
	deleteFiles,
	readMe,
	createNotification
} from '@directus/sdk';
import { error } from '@sveltejs/kit';
import { getDirectus, type Group } from '$lib/server/directus';
import { assertCan, currentGroupId, type Actor } from '../authz';
import { listProfiles } from './profiles';
import { listBooks, deleteBook } from './books';
import { log } from '../logger';

/** Felder der Gruppe, die in die Auskunft gehören. Ohne Passwort-Hash und Einladungstoken. */
const GROUP_FIELDS = ['name', 'slug', 'email', 'email_verified_at', 'created_at'] as const;

/** Alle IDs ungleich leer — harte Regel 3: kein Filter aus leeren oder null-Werten. */
const ids = (values: (string | null | undefined)[]): string[] => [
	...new Set(values.filter((v): v is string => typeof v === 'string' && v.length > 0))
];

/**
 * Alles, was zur Familie gespeichert ist. Grundlage für Übersicht und Download.
 *
 * Nicht enthalten, weil ohne Bezug zur Familie: `logs` (technische Fehler, nach 30 Tagen
 * gelöscht) und anonymes Feedback, dessen Bezug `scripts/aufraeumen.ts` schon geleert hat.
 */
export async function collectFamilyData(actor: Actor) {
	assertCan(actor, 'group:manage');
	const directus = getDirectus();
	const groupId = currentGroupId(actor);

	const group = await directus
		.request(readItem('groups', groupId, { fields: [...GROUP_FIELDS] }))
		.catch(() => null);
	if (!group) error(404, 'Gruppe nicht gefunden');

	const profiles = await listProfiles(actor);
	const profileIds = ids(profiles.map((p) => p.id));

	const [exercises, insights, feedback, consents, books] = await Promise.all([
		profileIds.length
			? directus.request(
					readItems('exercises', {
						fields: ['id', 'profile_id', 'subject', 'topic', 'teacher_notes', 'generated_content', 'source_file', 'created_at'],
						filter: { profile_id: { _in: profileIds } },
						sort: ['created_at'],
						limit: -1
					})
				)
			: [],
		profileIds.length
			? directus.request(
					readItems('learner_insights', {
						fields: ['profile_id', 'subject', 'topic', 'strengths', 'weaknesses', 'style_notes', 'difficulty', 'updated_at'],
						filter: { profile_id: { _in: profileIds } },
						limit: -1
					})
				)
			: [],
		profileIds.length
			? directus.request(
					readItems('feedback', {
						fields: ['profile_id', 'type', 'rating', 'comment', 'created_at'],
						filter: { profile_id: { _in: profileIds } },
						sort: ['created_at'],
						limit: -1
					})
				)
			: [],
		directus.request(
			readItems('consents', {
				fields: ['type', 'version', 'granted_at', 'granted_by_name', 'granted_by_email', 'revoked_at'],
				filter: { group_id: { _eq: groupId } },
				sort: ['granted_at'],
				limit: -1
			})
		),
		listBooks(actor, ['id', 'title', 'subject', 'grade', 'school_type', 'publisher', 'isbn', 'page_count', 'file', 'created_at', 'last_used_at'])
	]);

	const exerciseIds = ids(exercises.map((e) => e.id));
	const corrections = exerciseIds.length
		? await directus.request(
				readItems('corrections', {
					fields: ['exercise_id', 'correction_result', 'solution_file', 'created_at'],
					filter: { exercise_id: { _in: exerciseIds } },
					sort: ['created_at'],
					limit: -1
				})
			)
		: [];

	const fileIds = ids([
		...exercises.map((e) => e.source_file),
		...corrections.map((c) => c.solution_file),
		...books.map((b) => b.file)
	]);
	const files = fileIds.length
		? await directus.request(
				readFiles({
					fields: ['id', 'filename_download', 'type', 'filesize', 'uploaded_on'],
					filter: { id: { _in: fileIds } },
					limit: -1
				})
			)
		: [];

	return {
		family: group as Pick<Group, (typeof GROUP_FIELDS)[number]>,
		consents,
		profiles: profiles.map((p) => ({
			id: p.id,
			name: p.name,
			kind: p.kind,
			school_type: p.school_type,
			grade: p.grade,
			state: p.state,
			avatar: p.avatar,
			exercises: exercises
				.filter((e) => e.profile_id === p.id)
				.map(({ profile_id: _, ...e }) => ({
					...e,
					corrections: corrections
						.filter((c) => c.exercise_id === e.id)
						.map(({ exercise_id: __, ...c }) => c)
				})),
			learner_insights: insights.filter((i) => i.profile_id === p.id).map(({ profile_id: _, ...i }) => i),
			feedback: feedback.filter((f) => f.profile_id === p.id).map(({ profile_id: _, ...f }) => f)
		})),
		books,
		files
	};
}

export type FamilyData = Awaited<ReturnType<typeof collectFamilyData>>;

/**
 * Löscht die ganze Familie. Die Datenbank erledigt fast alles per Kaskade an `groups`
 * (`schema/snapshot.json`): Profile, Mitgliedschaften, Einwilligungen, E-Mail-Links, über die
 * Profile Aufgaben, Korrekturen und Lernerkenntnisse. Feedback verliert seinen Bezug
 * (SET NULL) und bleibt anonym.
 *
 * Von Hand, weil die Kaskade sie nicht erfasst:
 * - Bücher: `owner_group` steht auf SET NULL — sie blieben sonst samt PDF als Waisen stehen
 * - hochgeladene Dateien (Aufgaben, Lösungsfotos): sofort, nicht erst als verwaiste Dateien
 *   durch `scripts/aufraeumen.ts`
 *
 * Danach eine Benachrichtigung an den Betreiber (Directus-Notification, geht zugleich per
 * Mail an das Admin-Konto). Ein Fehler dabei hält die Löschung nicht auf.
 */
export async function deleteFamily(actor: Actor): Promise<void> {
	assertCan(actor, 'group:manage');
	const data = await collectFamilyData(actor);
	const directus = getDirectus();
	const groupId = currentGroupId(actor);

	for (const book of data.books) await deleteBook(actor, book.id);

	const uploadIds = ids(
		data.profiles.flatMap((p) => p.exercises.flatMap((e) => [e.source_file, ...e.corrections.map((c) => c.solution_file)]))
	);

	await directus.request(deleteItem('groups', groupId));
	if (uploadIds.length) await directus.request(deleteFiles(uploadIds)).catch(() => undefined);

	await notifyOperator(data).catch((e) =>
		log('warn', 'familyData/notify', 'Benachrichtigung über Familienlöschung fehlgeschlagen', {
			error: e instanceof Error ? e.message : String(e)
		})
	);
}

/**
 * Directus schickt eine Notification an Konten mit `email_notifications` zugleich als Mail.
 * Empfänger ist das Konto hinter dem App-Token (der Admin). Ohne Kinderdaten — nur der
 * Familienname, damit der Betreiber weiß, wer gegangen ist.
 */
async function notifyOperator(data: FamilyData): Promise<void> {
	const directus = getDirectus();
	const me = await directus.request(readMe({ fields: ['id'] }));
	const exercises = data.profiles.reduce((n, p) => n + p.exercises.length, 0);
	await directus.request(
		createNotification({
			recipient: me.id,
			subject: `Familienzugang gelöscht: ${data.family.name}`,
			message:
				`Die Familie „${data.family.name}" hat ihren Zugang am ` +
				`${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} selbst gelöscht ` +
				`(${data.profiles.length} Profil(e), ${exercises} Aufgabe(n), ${data.books.length} Buch/Bücher).\n\n` +
				'In den Sicherungskopien bleiben die Daten bis zu deren Ablauf. Diese Benachrichtigung ' +
				'enthält den Familiennamen — nach Kenntnisnahme bitte löschen.'
		})
	);
}
