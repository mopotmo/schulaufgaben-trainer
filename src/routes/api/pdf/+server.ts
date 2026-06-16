import { getDirectus } from '$lib/directus';
import { readItem } from '@directus/sdk';
import { error } from '@sveltejs/kit';
import puppeteer from 'puppeteer';
import { marked } from 'marked';
import { renderMath } from '$lib/renderMath';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const exerciseId = url.searchParams.get('exerciseId');
	if (!exerciseId) error(400, 'Keine Aufgaben-ID');

	const directus = getDirectus();
	const exercise = await directus.request(readItem('exercises', exerciseId));
	if (!exercise) error(404, 'Aufgabe nicht gefunden');

	const profile = await directus.request(readItem('profiles', exercise.profile_id));

	const contentHtml = renderMath(await marked(exercise.generated_content ?? ''));

	const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.css">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Georgia', serif;
    font-size: 12pt;
    color: #1a1a1a;
    padding: 2.5cm 2.5cm 2cm;
    line-height: 1.6;
  }
  .header {
    border-bottom: 2px solid #333;
    padding-bottom: 0.5cm;
    margin-bottom: 0.8cm;
  }
  .header h1 { font-size: 16pt; font-weight: bold; }
  .header .meta { font-size: 10pt; color: #555; margin-top: 0.2cm; }
  .header .name-line {
    display: flex;
    justify-content: space-between;
    margin-top: 0.4cm;
    font-size: 11pt;
  }
  .header .name-line span { min-width: 6cm; border-bottom: 1px solid #999; padding-bottom: 2px; }
  ol { padding-left: 1.5em; }
  li { margin-bottom: 1.2cm; }
  p { margin-bottom: 0.4em; }
  h1, h2, h3 { margin-bottom: 0.3em; margin-top: 0.5em; }
  .answer-space {
    border-bottom: 1px dotted #bbb;
    height: 2.5cm;
    margin-top: 0.3cm;
    width: 100%;
  }
</style>
</head>
<body>
  <div class="header">
    <h1>${exercise.subject} – Übungsaufgaben</h1>
    <div class="meta">Thema: ${exercise.topic} · Klasse ${profile?.grade ?? ''} · ${new Date(exercise.created_at).toLocaleDateString('de-DE')}</div>
    <div class="name-line">
      <div>Name: <span></span></div>
      <div>Datum: <span></span></div>
    </div>
  </div>
  ${contentHtml}
</body>
</html>`;

	const browser = await puppeteer.launch({
		headless: true,
		executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
		args: ['--no-sandbox', '--disable-setuid-sandbox']
	});

	try {
		const page = await browser.newPage();
		await page.setContent(html, { waitUntil: 'load' });
		await page.evaluateHandle('document.fonts.ready');
		const pdf = await page.pdf({
			format: 'A4',
			printBackground: true,
			margin: { top: '1cm', bottom: '1cm', left: '0', right: '0' }
		});

		return new Response(pdf.buffer as ArrayBuffer, {
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `inline; filename="aufgaben-${exerciseId}.pdf"`
			}
		});
	} finally {
		await browser.close();
	}
};
