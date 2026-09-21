import { createDirectus, rest, staticToken } from '@directus/sdk';
import { DIRECTUS_TOKEN, DIRECTUS_URL } from '$env/static/private';

/** @deprecated Geht in `Group` auf. Wird nach der Migration entfernt (Spec §6 Schritt 6). */
export type Family = {
	id: string;
	name: string;
	slug: string;
	email: string | null;
	password_hash: string | null;
	invite_token: string | null;
	created_at: string;
};

export type GroupType = 'family' | 'class' | 'school';

/** Rollen aus `memberships`. In Stufe 1 wird nur `learner` vergeben — siehe Spec §10.1. */
export type Role = 'owner' | 'parent' | 'learner' | 'teacher' | 'admin';

export type Group = {
	id: string;
	type: GroupType;
	name: string;
	slug: string;
	/** Hierarchie Familie → Klasse → Schule. Vorkehrung, in Stufe 1 ungenutzt. */
	parent_group: string | null;
	/** Mandanten-Vorkehrung, vorerst immer 'default'. */
	tenant: string;
	email: string | null;
	/** bcrypt-Hash. Nur bei `type: 'family'` gesetzt. */
	password_hash: string | null;
	invite_token: string | null;
	/** Beitrittscode Klasse. In Stufe 1 ungenutzt. */
	invite_code: string | null;
	status: 'active' | 'archived';
	created_at: string;
};

export type Membership = {
	id: string;
	profile_id: string;
	group_id: string;
	role: Role;
	status: 'active' | 'pending' | 'removed';
	joined_at: string;
};

export type Consent = {
	id: string;
	group_id: string;
	type: 'privacy' | 'terms';
	/** Entspricht CONSENT_VERSION in `src/lib/legal.ts`. */
	version: string;
	granted_at: string;
	granted_by_name: string;
	granted_by_email: string;
	revoked_at: string | null;
};

export type Profile = {
	id: string;
	/**
	 * Nach der Migration `NOT NULL` (Spec §6 Schritt 6). Bis dahin nullable —
	 * deshalb nie ungeprüft in einen Directus-Filter (harte Regel 3).
	 */
	group_id: string | null;
	kind: 'learner' | 'adult';
	/** @deprecated Ersetzt durch `group_id`. Wird nach der Migration entfernt. */
	family_id: string | null;
	name: string;
	school_type: string;
	grade: number;
	state: string;
	avatar: string | null;
};

export type Exercise = {
	id: string;
	profile_id: string;
	subject: string;
	topic: string;
	teacher_notes: string;
	generated_content: string;
	source_file: string | null;
	created_at: string;
	tokens_used: number | null;
};

export type Correction = {
	id: string;
	exercise_id: string;
	solution_file: string | null;
	correction_result: string;
	created_at: string;
	tokens_used: number | null;
};

export type Log = {
	id: string;
	level: 'error' | 'warn' | 'info';
	context: string;
	message: string;
	details: Record<string, unknown> | null;
	created_at: string;
};

export type Feedback = {
	id: string;
	type: 'generation' | 'correction' | 'chat';
	ref_id: string | null;
	profile_id: string | null;
	rating: 'positive' | 'negative';
	comment: string | null;
	created_at: string;
};

export type FeatureRequest = {
	id: string;
	title: string;
	description: string | null;
	count: number;
	profile_ids: string[] | null;
	source: 'chat_auto' | 'feedback_comment' | null;
	created_at: string;
	updated_at: string;
};

export type LearnerInsight = {
	id: string;
	profile_id: string;
	subject: string;
	topic: string;
	strengths: string[];
	weaknesses: string[];
	style_notes: string | null;
	difficulty: 'leichter' | 'passend' | 'schwerer';
	updated_at: string;
};

export type BookChapter = {
	title: string;
	pageStart: number;
	pageEnd: number;
};

export type Book = {
	id: string;
	title: string;
	subject: string;
	grade: number;
	school_type: string | null;
	publisher: string | null;
	isbn: string | null;
	file: string | null;
	chapters: BookChapter[] | null;
	page_count: number | null;
	page_offset: number;
	owner_group: string | null;
	/** @deprecated Ersetzt durch `owner_group`. Wird nach der Migration entfernt. */
	owner_family: string | null;
	visibility: 'family' | 'shared';
	created_at: string;
};

type Schema = {
	groups: Group[];
	memberships: Membership[];
	consents: Consent[];
	/** @deprecated siehe `Family` */
	families: Family[];
	profiles: Profile[];
	exercises: Exercise[];
	corrections: Correction[];
	logs: Log[];
	feedback: Feedback[];
	feature_requests: FeatureRequest[];
	learner_insights: LearnerInsight[];
	books: Book[];
};

export function getDirectus() {
	return createDirectus<Schema>(DIRECTUS_URL).with(staticToken(DIRECTUS_TOKEN)).with(rest());
}
