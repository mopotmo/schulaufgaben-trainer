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

*Teilweise erledigt 25.09.2026:* Ein Backup ist jetzt ein Aufruf (`scripts/backup.sh`), samt
Wiederherstellung und Gegenzählen. Offen bleibt, dass es niemand regelmäßig anstößt.

`docs/backup-und-restore.md` beschreibt das Vorgehen, aber es stößt niemand an. Entweder
Coolifys geplante Backups nutzen, falls sie Datenbanken im Service-Stack abdecken, oder ein
Cronjob mit Rotation. Dazu fehlt eine Entscheidung zur Aufbewahrungsdauer — die berührt die
Löschzusage aus dem Konzept §3.3.

**Dateien.** keine (Betrieb)

### Lösen-Ansicht: Der Blatt-Fuß landet in der letzten Teilaufgabe

Am Ende eines Blatts steht oft eine Zeile wie `Gesamt: 24 Punkte`, durch `---` vom letzten
Text abgetrennt. Getrennt wird aber am Wort „Aufgabe", und der Trenner steht nicht am Ende —
also zählt beides zum Text der letzten Teilaufgabe und erscheint dort über dem Antwortfeld.

Eine allgemeine Regel „nach einem `---` ist die Aufgabe zu Ende" wäre gefährlich: In
Latein-Blättern trennt derselbe Strich den Übersetzungstext von der Frage. Dann würde die
eigentliche Aufgabe verschwinden. Der Fuß müsste also am Inhalt erkannt werden, nicht an der
Struktur — oder die Generierung dürfte ihn gar nicht erst als Teil des letzten Blocks setzen.

Eine Zeile am Ende des Blatts, ohne Folgen für die Korrektur.

**Dateien.** `src/lib/parseExercises.ts`

---

### E-Mail-Bestätigung: zwei Nacharbeiten

Aus der Umsetzung vom 25.09.2026 (Double-Opt-In und „Passwort vergessen").

1. **Passwort-Reset entwertet keine laufenden Sitzungen.** Das Cookie trägt nur `iat` und
   eine globale Version (`v`), nichts pro Gruppe. Wer ein fremdes Cookie hat, bleibt nach dem
   Reset bis zu 30 Tage angemeldet. Ansatz: `groups.session_version` ins Cookie aufnehmen und
   im Hook vergleichen; der Reset erhöht sie.
2. **`email_tokens` wächst unbegrenzt.** Verbrauchte und abgelaufene Zeilen bleiben bis zur
   Kontolöschung (so steht es auch in der Datenschutzerklärung). Ansatz: den Directus-Flow für
   die 30-Tage-Löschung der Uploads (Konzept Stufe 0 #4) um diese Collection erweitern.

**Dateien.** `src/lib/session.ts`, `src/hooks.server.ts`, `src/lib/server/repo/emailTokens.ts`,
`scripts/email-verification.ts`

### Profil löschen: abhängige Daten werden nicht vollständig mitgelöscht

Festgestellt am 25.09.2026 an den Relationen in Produktion. `deleteProfile` hat noch keinen
Aufrufer, der Fehler ist also nicht sichtbar — wird es aber, sobald Eltern Profile löschen können.

| Collection | Verweis auf das Profil | Beim Löschen |
|---|---|---|
| `memberships` | `profile_id` | `CASCADE` ✓ |
| `exercises` | `profile_id` | `CASCADE` ✓ |
| `corrections` | über `exercise_id` | `CASCADE` ✓ |
| `learner_insights` | `profile_id` | **`NO ACTION`** — das Löschen scheitert am Fremdschlüssel |
| `feedback` | `profile_id` | **keine Relation** — Zeilen bleiben verwaist stehen |

Dazu: `corrections.solution_file` zeigt auf `directus_files`. Die Kaskade löscht die Korrektur,
nicht das hochgeladene Lösungsfoto — Datei und Zeile bleiben im Uploads-Volume.

Aus DSGVO-Sicht sollte mit dem Profil alles gehen, was sich auf das Kind bezieht.

**Ansatz.** In Directus `learner_insights.profile_id` auf `CASCADE` umstellen und für
`feedback.profile_id` eine Relation mit `CASCADE` (oder `SET NULL`, falls Feedback anonym
erhalten bleiben soll — Entscheidung offen). Lösungsfotos entweder in `deleteProfile` vor dem
Löschen einsammeln oder vom Flow für die 30-Tage-Löschung miterfassen lassen. Vorher Backup.

**Dateien.** `src/lib/server/repo/profiles.ts` (`deleteProfile`), Directus-Relationen

## Erledigt

### `groups.invite_token` musste von Hand vergeben werden — 25.09.2026

Beim Anlegen einer Familie in Directus blieb das Token leer, die UUID musste man selbst
eintragen. Jetzt trägt das Feld den Directus-Spezialwert `uuid`: Beim Anlegen entsteht eine
UUID aus `node:crypto`, wenn keine mitkommt. Änderungen und das Leeren beim Einrichten fasst
der Spezialwert nicht an — eine eingerichtete Familie bekommt nie wieder einen gültigen
Einladungslink. Statt des zuerst notierten Filter-Flows, weil es ohne Flow und ohne
Sandbox-Skript auskommt. Die Feldnotiz in Directus zeigt das Muster des Einladungslinks.

**Dateien.** `scripts/email-verification.ts` (Schritt 5)

### Lösen-Ansicht: Aufgabentitel stand über jeder Teilaufgabe — 22.09.2026

Jede Teilaufgabe trug den vollständigen Titel („Aufgabe 2 (6 Punkte) a)", „… b)") und
darunter noch einmal den gemeinsamen Vorspann. So schreibt kein Aufgabenblatt.

`parseExercises` liefert jetzt Gruppen statt einer flachen Liste: eine Überschrift, der
Vorspann einmal, darunter die Teilaufgaben mit `a)` / `b)` und je einem Antwortfeld. Die
Felder bleiben flach durchnummeriert — Entwürfe im localStorage und die Korrektur hängen an
dieser Position, und die Korrektur bekommt weiterhin den vollen Titel je Antwort.

Die Darstellung stand in „Lösen" und in der Vorschau nach dem Generieren doppelt im Code.
Statt die neue Verschachtelung zweimal zu schreiben, liegt sie jetzt in
`ExerciseFields.svelte`. Nebenbei fällt der `---`-Trenner zwischen zwei Aufgaben nicht mehr
in die letzte Teilaufgabe.

**Dateien.** `src/lib/parseExercises.ts`, `src/lib/components/ExerciseFields.svelte`,
`src/routes/loesen/+page.svelte`, `src/routes/generieren/+page.svelte`


### Lernerkenntnisse fanden sich wegen Freitext nicht wieder — 22.09.2026

Fach und Thema werden bei jeder Generierung frei getippt. Der Bestand zeigt `Mathe`,
`Mathematik`, `mathematik` und Themen von `Stochastik` bis
`Laplace-Experimente und Stochastik` — gesucht wurde aber über Profil + Fach + Thema als
exakten Zeichenvergleich. Die Erkenntnisse wurden gesammelt und erreichten die Generierung nie.

In drei Schritten behoben:

1. **Normalisiert verglichen** statt in der Datenbank exakt gefiltert. Groß-/Kleinschreibung,
   angehängte Leerzeichen und Zeilenumbrüche im Thema sind kein Unterschied mehr.
2. **Das Thema als Schlüssel fallen gelassen.** Ein Datensatz je Fach, das zuletzt geübte
   Thema steht weiterhin darin und geht in den Prompt ein, entscheidet aber nicht mehr über
   die Zuordnung. Der Extraktions-Prompt weiß jetzt, dass der Eintrag fürs ganze Fach gilt.
3. **An der Quelle angesetzt.** Das Feld *Fach* schlägt die für dieses Profil schon benutzten
   Fächer vor (`datalist`, schränkt die Eingabe nicht ein). Damit entsteht `Mathe` gegen
   `Mathematik` gar nicht erst — der einzige Unterschied, den Schritt 1 und 2 nicht auffangen,
   weil es verschiedene Wörter sind.

Die dritte erwogene Variante — das Modell zuordnen lassen, welcher Datensatz gemeint ist —
war damit nicht mehr nötig.

**Dateien.** `src/lib/server/repo/insights.ts`, `src/lib/server/learnerInsights.ts`,
`src/lib/server/repo/exercises.ts`, `src/routes/generieren/+page.svelte`


### Lernerkenntnisse wurden wegen Schreibweisen nicht gefunden — 22.09.2026

Gesucht wurde über Profil + Fach + Thema als exakter Zeichenvergleich in der Datenbank —
bei Freitext aus dem Formular. `Mathe ` mit angehängtem Leerzeichen und ein Thema mit
`\r\n` darin fanden sich nie wieder. Verglichen wird jetzt normalisiert im Code, gefiltert
nur noch über das Profil; das erreicht auch Altdatensätze, ohne sie anzufassen. Neue
Datensätze werden aufgeräumt abgelegt.

Was damit **nicht** gelöst ist, steht oben unter „Fach und Thema als Freitext".

**Dateien.** `src/lib/server/repo/insights.ts`


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
