import { createDirectus, rest, staticToken } from '@directus/sdk';
import { DIRECTUS_TOKEN, DIRECTUS_URL } from '$env/static/private';

export type Family = {
	id: string;
	name: string;
	slug: string;
	email: string | null;
	password_hash: string | null;
	invite_token: string | null;
	created_at: string;
};

export type Profile = {
	id: string;
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
	owner_family: string | null;
	visibility: 'family' | 'shared';
	created_at: string;
};

type Schema = {
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
