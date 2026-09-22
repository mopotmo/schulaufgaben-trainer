import puppeteer from 'puppeteer';
import purifySource from 'dompurify/dist/purify.min.js?raw';
import { renderMarkdown } from '$lib/renderMarkdown';
import { requireActor } from '$lib/server/actor';
import { getExercise } from '$lib/server/repo/exercises';
import { getKatexCss } from '$lib/server/katexCss';
import type { RequestHandler } from './$types';

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

export const GET: RequestHandler = async ({ url, locals }) => {
	const actor = requireActor(locals);
	const { exercise, profile } = await getExercise(actor, url.searchParams.get('exerciseId'));

	const contentHtml = renderMarkdown(exercise.generated_content, { schreibplatz: true });

	const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<style>${getKatexCss()}</style>
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
  /* --- Seitenumbrüche ---
     Der gerenderte Inhalt ist eine flache Folge von <p>, <hr>, <table> und <pre>. Ohne
     Gruppierung kann eine Aufgabe mitten im Satz auf die nächste Seite rutschen. Deshalb
     wird der Inhalt vor dem Druck in <section class="task"> je Aufgabe gebündelt (siehe
     page.evaluate weiter unten) und hier zusammengehalten. */
  /* Zusammengehalten wird die Frage, nicht der Schreibplatz: Bliebe der Freiraum im
     Abschnitt, wäre jede Aufgabe fast seitenhoch und es entstünden große Lücken. So
     beginnt die nächste Aufgabe dort, wo Platz ist, und der Freiraum läuft weiter. */
  .task { break-inside: avoid; }
  .answer-gap { break-inside: auto; }
  /* Überschrift nie allein am Seitenfuß. */
  .task > p:first-of-type { break-after: avoid; }
  /* Tabellen und der ASCII-Zeichenblock werden nie zerschnitten. */
  table, pre { break-inside: avoid; }
  /* Keine Einzelzeile eines Absatzes am Seitenanfang oder -ende. */
  p { orphans: 3; widows: 3; }
  /* Eine Trennlinie direkt am Seitenfuß sieht aus wie ein Fehler. */


  /* Transparenzhinweis nach Art. 50 KI-VO – das Blatt verlässt die App. */
  .ai-notice {
    margin-top: 1cm;
    padding-top: 0.3cm;
    border-top: 1px solid #ddd;
    font-size: 8pt;
    color: #777;
  }
</style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(exercise.subject ?? '')} – Übungsaufgaben</h1>
    <div class="meta">Thema: ${escapeHtml(exercise.topic ?? '')} · Klasse ${escapeHtml(String(profile.grade ?? ''))} · ${new Date(exercise.created_at).toLocaleDateString('de-DE')}</div>
    <div class="name-line">
      <div>Name: <span></span></div>
      <div>Datum: <span></span></div>
    </div>
  </div>
  <div id="content"></div>
  <div class="ai-notice">Diese Aufgaben wurden von einer KI erstellt und können Fehler enthalten.</div>
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

		// Der Aufgabentext ist Markdown aus der Generierung bzw. dem Chat und kann rohes HTML
		// enthalten (`marked` lässt es durch). Er wird deshalb erst im Browser durch DOMPurify
		// gereicht und nie in die Seitenquelle geschrieben – sonst liefe fremdes Markup im
		// Renderer mit `--no-sandbox` und hätte Netzzugriff auf interne Dienste.
		await page.addScriptTag({ content: purifySource });
		await page.evaluate((raw: string) => {
			const purify = (globalThis as unknown as {
				DOMPurify: { sanitize: (dirty: string) => string };
			}).DOMPurify;
			const target = document.getElementById('content');
			if (!target) return;
			target.innerHTML = purify.sanitize(raw);

			// Inhalt je Aufgabe in <section> bündeln, damit `break-inside: avoid` etwas hat,
			// woran es greifen kann. Eine vorangehende Trennlinie wandert mit in den
			// Abschnitt — sonst bleibt sie allein am Seitenfuß zurück.
			const isStart = (node: Node): boolean => {
				if (node.nodeType !== 1) return false;
				const el = node as HTMLElement;
				const text = (el.textContent ?? '').trim();
				if (!/^Aufgabe\s+\d+/i.test(text)) return false;
				if (/^H[1-6]$/.test(el.tagName)) return true;

				// Die Generierung setzt Aufgabenköpfe fett — mal als eigenen Absatz
				// (`**Aufgabe 1 (4 P): Thema**`), mal zusammen mit der Einleitung
				// (`**Aufgabe 2 (6 P):** Übersetze …`). Entscheidend ist deshalb nicht die
				// Länge des Absatzes, sondern dass er mit einer fetten „Aufgabe N" beginnt.
				// Ein Fließtext, der zufällig mit „Aufgabe 3 verlangt …" anfängt, tut das nicht.
				const lead = el.firstElementChild;
				if (!lead || !['STRONG', 'B'].includes(lead.tagName)) return false;
				return /^Aufgabe\s+\d+/i.test((lead.textContent ?? '').trim());
			};

			const nodes = Array.from(target.childNodes);
			let section: HTMLElement | null = null;
			let pendingRule: Node | null = null;

			for (const node of nodes) {
				const el = node.nodeType === 1 ? (node as HTMLElement) : null;

				if (el?.tagName === 'HR') {
					// Erst zurückhalten: Gehört sie zur nächsten Aufgabe oder schließt sie ab?
					if (pendingRule) target.appendChild(pendingRule);
					pendingRule = node;
					continue;
				}

				if (isStart(node)) {
					section = document.createElement('section');
					section.className = 'task';
					target.appendChild(section);
					if (pendingRule) {
						section.appendChild(pendingRule);
						pendingRule = null;
					}
				} else if (pendingRule) {
					(section ?? target).appendChild(pendingRule);
					pendingRule = null;
				}

				// Absätze, die nur aus <br> bestehen, sind der Schreibplatz. Sie bleiben außerhalb
				// des Abschnitts, damit sie über die Seitengrenze laufen dürfen.
				const onlyBreaks =
					el?.tagName === 'P' &&
					(el.textContent ?? '').trim() === '' &&
					el.querySelector('br') !== null;

				if (onlyBreaks && section) {
					el.className = 'answer-gap';
					target.appendChild(el);
					section = null;
					continue;
				}

				(section ?? target).appendChild(node);
			}
			if (pendingRule) (section ?? target).appendChild(pendingRule);
		}, contentHtml);

		await page.evaluateHandle('document.fonts.ready');
		const pdf = await page.pdf({
			format: 'A4',
			printBackground: true,
			margin: { top: '1cm', bottom: '1cm', left: '0', right: '0' }
		});

		return new Response(pdf.buffer as ArrayBuffer, {
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `inline; filename="aufgaben-${exercise.id}.pdf"`
			}
		});
	} finally {
		await browser.close();
	}
};
