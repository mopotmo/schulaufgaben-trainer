import { getDirectus } from './directus';
import { createItem } from '@directus/sdk';

type LogLevel = 'error' | 'warn' | 'info';

export async function log(
	level: LogLevel,
	context: string,
	message: string,
	details?: Record<string, unknown>
) {
	try {
		const directus = getDirectus();
		await directus.request(
			createItem('logs', { level, context, message, details: details ?? null })
		);
	} catch {
		// never let logging crash the app
		console.error('[logger] failed to write log', { level, context, message });
	}
}

export function logError(context: string, error: unknown, details?: Record<string, unknown>) {
	const message = error instanceof Error ? error.message : String(error);
	const stack = error instanceof Error ? error.stack : undefined;
	return log('error', context, message, { ...details, stack });
}
