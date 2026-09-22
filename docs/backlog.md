# Backlog

Kleinere Punkte, die kein eigenes Konzept brauchen. Größere Vorhaben stehen in
`klassen-freigabe-konzept.md` (Stufen 0–2) und `spec-gruppen-rollen-einwilligung.md`.

Konvention: ein Abschnitt pro Punkt, mit Ursache und betroffenen Dateien — damit man
nicht beim Anfassen erst wieder diagnostizieren muss. Erledigtes wandert nach unten.

---

## Offen

### PDF: Aufgaben brechen über Seiten unschön um

Gemeldet am 21.09.2026 beim Review eines generierten Aufgabenblatts.

**Ursache.** Der Generator trennt Aufgaben durch eine Unterstrich-Zeile, aus der `marked`
ein `<hr>` macht. Das Dokument ist danach eine flache Folge aus `<hr>` und `<p>` — es gibt
kein Element pro Aufgabe, auf das `break-inside: avoid` wirken könnte. Eine Aufgabe kann
deshalb mitten im Satz auf die nächste Seite rutschen.

**Ansatz.** Die HTML-Ausgabe an den `<hr>` in `<section>` gruppieren, darauf dann
`break-inside: avoid`. In der PDF-CSS stehen außerdem bisher überhaupt keine Umbruchregeln,
auch kein `orphans` / `widows`; der ASCII-Koordinatengitter-Block (Markdown-Codeblock) wird
dadurch quer durchgeschnitten.

**Dateien.** `src/routes/api/pdf/+server.ts` (CSS und HTML-Gerüst)

### PDF: Antwortplatz entsteht über Punkt-Zeilen statt über echten Freiraum

Der System-Prompt verlangt „ausreichend Leerzeilen für handschriftliche Antworten". Das
Modell liefert daraufhin Zeilen mit einem einzelnen `.`, die im PDF als sichtbare
Punktespalten stehen.

Gleichzeitig laufen zwei CSS-Regeln ins Leere: `.answer-space` und `li { margin-bottom: 1.2cm }`
greifen nie, weil der Generator weder die Klasse noch `<ol>` / `<li>` erzeugt.

**Ansatz.** Entweder den Prompt auf eine explizite Markierung umstellen, die beim Rendern zu
`.answer-space` wird, oder die Punkt-Zeilen beim Rendern in Freiraum übersetzen.

**Dateien.** `src/routes/api/generieren/+server.ts` (Format-Teil des System-Prompts),
`src/routes/api/pdf/+server.ts` (CSS)

### Urheberrecht: drei offene Punkte beim Schulbuch-Upload

Aus dem Review vom 22.09.2026. Der Freigabepfad über `visibility: 'shared'` ist entfernt und
der Generierungs-Prompt entschärft; offen bleibt:

1. **Hinweis am Upload-Formular** in `src/routes/buecher/+page.svelte`: nur eigene Bücher,
   nur für den eigenen Haushalt, keine Weitergabe.
2. **Löschfrist für hochgeladene Bücher.** Ein dauerhaft gespeichertes Schulbuch ist etwas
   anderes als eines, das für die Dauer eines Kapitels dient. Gehört zum selben Directus-Flow
   wie die 30-Tage-Löschung der Lösungsfotos und sollte zusammen gebaut werden.
3. **Abschnitt in Nutzungsbedingungen und Konzept**, damit die Entscheidung dokumentiert ist
   wie die übrigen rechtlichen Punkte. Im Konzept als eigener Abschnitt unter §3.

Hintergrund: Ein hochgeladenes Schulbuch ist eine im Wesentlichen vollständige
Vervielfältigung und damit nach § 53 Abs. 4 lit. b UrhG nicht von der Privatkopie gedeckt.

**Dateien.** `src/routes/buecher/+page.svelte`, `src/routes/nutzungsbedingungen/+page.svelte`,
`docs/klassen-freigabe-konzept.md`

### Backups laufen nur von Hand

`docs/backup-und-restore.md` beschreibt das Vorgehen, aber es stößt niemand an. Entweder
Coolifys geplante Backups nutzen, falls sie Datenbanken im Service-Stack abdecken, oder ein
Cronjob mit Rotation. Dazu fehlt eine Entscheidung zur Aufbewahrungsdauer — die berührt die
Löschzusage aus dem Konzept §3.3.

**Dateien.** keine (Betrieb)

### Lösen-Ansicht: `**` bleibt als Artefakt stehen, Vorspann wird je Teilaufgabe wiederholt

Beim Zerlegen in einzelne Antwortfelder wird an `Aufgabe \d` getrennt. Die schließenden
Sternchen der fett gesetzten Überschrift landen dadurch im vorherigen Block und erscheinen
als eigenständiges `**`. Außerdem wird ein gemeinsamer Vorspann — etwa das Gleichungssystem
über a) / b) / c) — vor jeder Teilaufgabe erneut ausgegeben.

Kosmetisch, aber in jeder mehrteiligen Aufgabe sichtbar.

**Dateien.** `src/lib/parseExercises.ts`

---

## Erledigt

### `marked` warf weiche Zeilenumbrüche weg — 21.09.2026

`breaks: false` (Voreinstellung) ließ mehrzeilige Blöcke ohne Markdown-Zeilenumbruch in
einem `<p>` auf einer Sichtzeile landen: Gleichungssysteme als `(I) …` / `(II) …` und
Teilaufgaben als `a)` / `b)` / `c)`. Behoben mit `breaks: true` in
`src/lib/renderMarkdown.ts`. Prosa wird vom Modell nicht hart umbrochen, Absätze und Listen
bleiben unverändert.
