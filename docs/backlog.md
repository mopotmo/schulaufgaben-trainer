# Backlog

Kleinere Punkte, die kein eigenes Konzept brauchen. Größere Vorhaben stehen in
`klassen-freigabe-konzept.md` (Stufen 0–2) und `spec-gruppen-rollen-einwilligung.md`.

Konvention: ein Abschnitt pro Punkt, mit Ursache und betroffenen Dateien — damit man
nicht beim Anfassen erst wieder diagnostizieren muss. Erledigtes wandert nach unten.

---

## Offen

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

### Lösen-Ansicht: Vorspann wird je Teilaufgabe wiederholt

Beim Zerlegen in einzelne Antwortfelder wird ein gemeinsamer Vorspann — etwa das
Gleichungssystem oder der Einleitungssatz über a) / b) / c) — vor jeder Teilaufgabe erneut
ausgegeben. Inhaltlich richtig, weil jedes Antwortfeld für sich lesbar bleiben muss, aber
untereinander sichtbar als Dopplung.

Denkbar wäre, den Vorspann einmal über die Gruppe zu setzen statt in jede Teilaufgabe.
Das ändert die Struktur der Lösen-Ansicht, ist also kein Einzeiler.

(Das zugehörige `**`-Artefakt ist am 22.09.2026 behoben.)

**Dateien.** `src/lib/parseExercises.ts`, `src/routes/loesen/+page.svelte`

---

## Erledigt

### `learner_insights` blieb seit Juni leer — 22.09.2026

Zwei Anläufe, dieselbe Ursache. Das Modell sollte „ausschließlich JSON ohne Markdown-Codeblock"
antworten und lieferte trotzdem einen Codeblock; das Herausschneiden des ersten JSON-Objekts
half, bis ein Anführungszeichen *innerhalb* eines Stichpunkts den Wert zerriss
(`Verwechselt "nodes" und "connections"`).

Die Erkenntnisse kommen jetzt über ein Werkzeug mit Schema zurück, nicht als Text. Damit gibt
es nichts mehr zu parsen. Was ankommt, wird trotzdem auf die erwartete Form zurechtgestutzt —
es fließt in den System-Prompt der Generierung.

**Dateien.** `src/lib/server/learnerInsights.ts`


### Schreibplatz stand auch im Browser — 22.09.2026

Die `<br>`-Blöcke sind Platz zum Schreiben auf Papier. Seit sie fürs PDF wieder
durchgelassen werden, klaffte dieselbe Lücke am Bildschirm zwischen Aufgabenstellung und
Antwortfeld. `renderMarkdown` unterscheidet die Medien jetzt über `schreibplatz: true`,
das nur das PDF setzt; der sonst verbleibende leere Absatz wird mitentfernt.

**Dateien.** `src/lib/renderMarkdown.ts`, `src/routes/api/pdf/+server.ts`


### PDF: Aufgaben brachen über Seiten unschön um — 22.09.2026

Der Inhalt wird vor dem Druck je Aufgabe in `<section class="task">` gebündelt, darauf
`break-inside: avoid`. Der Schreibplatz (Absätze, die nur aus `<br>` bestehen) bleibt
bewusst **außerhalb** des Abschnitts und darf über die Seitengrenze laufen — sonst wäre jede
Aufgabe fast seitenhoch und es entstünden große Lücken. Dazu `orphans` / `widows` und
`break-inside: avoid` für Tabellen und Codeblöcke.

Zwei Fallen dabei: `hr { break-after: avoid }` schob den gesamten Inhalt auf Seite 2, und die
Klasse `answer-space` existierte bereits mit `height: 2.5cm` — die eigene Klasse heißt
deshalb `answer-gap`.

Geprüft an acht Blättern: jede Folgeseite beginnt mit einer Aufgabe.


### `marked` warf weiche Zeilenumbrüche weg — 21.09.2026

`breaks: false` (Voreinstellung) ließ mehrzeilige Blöcke ohne Markdown-Zeilenumbruch in
einem `<p>` auf einer Sichtzeile landen: Gleichungssysteme als `(I) …` / `(II) …` und
Teilaufgaben als `a)` / `b)` / `c)`. Behoben mit `breaks: true` in
`src/lib/renderMarkdown.ts`. Prosa wird vom Modell nicht hart umbrochen, Absätze und Listen
bleiben unverändert.
