# Backlog

Kleinere Punkte, die kein eigenes Konzept brauchen. Größere Vorhaben stehen in
`klassen-freigabe-konzept.md` (Stufen 0–2) und `spec-gruppen-rollen-einwilligung.md`.

Konvention: ein Abschnitt pro Punkt, mit Ursache und betroffenen Dateien — damit man
nicht beim Anfassen erst wieder diagnostizieren muss. Erledigtes wandert nach unten.

---

## Offen

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
2. ~~**`email_tokens` wächst unbegrenzt.**~~ *Erledigt 25.09.2026:* `scripts/aufraeumen.ts`
   löscht verbrauchte und abgelaufene Zeilen nach 7 Tagen; die Datenschutzerklärung sagt das.

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
`feedback.profile_id` eine Relation mit `SET NULL` — entschieden am 25.09.2026: Feedback bleibt
anonym erhalten. Dafür prüfen, dass im Feedback-Text selbst nichts Personenbezogenes steht. Lösungsfotos brauchen
nichts Eigenes mehr: Nach der Kaskade verweist nichts mehr auf sie, `scripts/aufraeumen.ts`
löscht sie als verwaiste Dateien 30 Tage nach dem Upload. Vorher Backup.

**Dateien.** `src/lib/server/repo/profiles.ts` (`deleteProfile`), Directus-Relationen

## Erledigt

### Löschfristen für Bücher, Uploads und Einmal-Links — 25.09.2026

Die Datenschutzerklärung und die Nutzungsbedingungen sagten Löschfristen zu, die niemand
einlöste. Jetzt löscht `scripts/aufraeumen.ts` jede Nacht um 01:45 UTC, vor dem Backup
(Regeln in `src/lib/retention.ts`):

- Schulbücher samt PDF: 90 Tage nach `last_used_at`, spätestens Ende des Schuljahres des
  Uploads (Konzept §3.6). `books.last_used_at` legte `scripts/books-last-used.ts` an; gesetzt
  wird es beim Hochladen und nach jeder erfolgreichen Generierung mit dem Buch.
- Aufgabenblätter und Lösungsfotos: 30 Tage nach dem Upload. Der Verweis wird geleert, Aufgabe
  und Korrekturtext bleiben.
- Verwaiste Dateien: 30 Tage nach dem Upload, wenn keine Relation auf `directus_files` auf sie
  zeigt. Deckt auch die Fotos gelöschter Profile ab.
- `email_tokens`: 7 Tage, wenn verbraucht oder abgelaufen.

**Skript statt Directus-Flow** (Abweichung von Konzept und Spec §10.3, dort vermerkt): Die
Flow-Operation „Delete Data" löscht in `directus_files` nur die Zeile, nicht die Datei auf der
Platte. Nur `DELETE /files` über die REST-API entfernt beides.

In der Probe gegen Testdaten für jeden Fall geprüft, einschließlich der Dateien auf der Platte.
Erster Lauf in Produktion: die 5 Lösungsfotos und Aufgabenblätter vom Juni gelöscht, das
Uploads-Volume ist leer. Die Bücherliste zeigt das Löschdatum — mangels Büchern in Produktion
und ohne Anmeldung nicht im Browser gesehen, ebenso wenig das Setzen von `last_used_at` bei
einer echten Generierung.

**Dateien.** `scripts/aufraeumen.ts`, `scripts/books-last-used.ts`, `src/lib/retention.ts`,
`src/lib/server/repo/books.ts`, `src/routes/api/generieren/+server.ts`,
`src/routes/buecher/+page.svelte`, `src/routes/datenschutz/+page.svelte`,
`docs/backup-und-restore.md`

### Backups liefen nur von Hand — 25.09.2026

`scripts/backup.sh` machte ein Backup zu einem Aufruf, aber niemand stieß ihn regelmäßig an.
Jetzt läuft `scripts/backup-cron.sh` als Cronjob auf dem Server (täglich 02:15 UTC): Datenbank
und Uploads, verschlüsselt mit einem öffentlichen gpg-Schlüssel, auf eine Hetzner Storage Box
in Falkenstein, Rotation nach **30 Tagen** (entschieden 25.09.2026). Nach jedem erfolgreichen
Lauf ein Push an Uptime Kuma; bleibt er 26 Stunden aus, gibt es Alarm.

Coolifys geplante Backups wurden verworfen: Sie verschlüsseln nicht selbst und erfassen das
Uploads-Volume nicht. Die Box hat keine äußere Erreichbarkeit; der Mac liest über ein
Unterkonto (nur lesen) per ProxyJump über den Server. Der Server kann Backups schreiben, aber
nicht entschlüsseln — der private Schlüssel liegt nur beim Betreiber.

`scripts/backup.sh --latest` holt den neuesten Stand, stellt ihn wieder her und zählt gegen die
Zählung vom Zeitpunkt des Dumps. Erster Lauf so geprüft: 41 Tabellen, 6 Dateien.
**Mindestens monatlich und vor Migrationen ausführen** — der Cronjob kann das nicht selbst.

Die Datenschutzerklärung nennt Sicherungen, Ort und 30 Tage (§8, §9), ohne neue
`CONSENT_VERSION`, weil es noch keine aktiven Nutzer gibt.

**Dateien.** `scripts/backup-cron.sh`, `scripts/backup.sh`, `docs/backup-und-restore.md`,
`src/routes/datenschutz/+page.svelte`, `src/lib/config.ts`

### Urheberrecht: Hinweise beim Schulbuch-Upload — 25.09.2026

Aus dem Review vom 22.09.2026. Ein hochgeladenes Schulbuch ist eine im Wesentlichen
vollständige Vervielfältigung und nach § 53 Abs. 4 lit. b UrhG nicht von der Privatkopie
gedeckt. Freigabepfad (`visibility: 'shared'`) und Generierungs-Prompt waren schon angepasst.

Ein erster Anlauf (22.09.) hatte Hinweis, Nutzungsbedingungen und Konzept-Abschnitt bereits
geschrieben, aber eine Löschung nach 30 Tagen zugesagt, die weder entschieden noch gebaut war,
die Eltern in den Nutzungsbedingungen geduzt und beim Einschieben von §3.6 fünf Querverweise
verschoben. Korrigiert:

1. **Hinweis am Upload-Formular** (an die Schüler, „du"): nur eigene Bücher, nur die eigene
   Familie sieht sie, keine Weitergabe, Löschfrist.
2. **Löschfrist entschieden**: 90 Tage ohne Nutzung, spätestens 31.08. Die Umsetzung steht
   oben unter „Schulbücher: Löschfrist umsetzen".
3. **Nutzungsbedingungen** (an die Eltern, „Sie") und **Konzept §3.6** mit Begründung und
   verworfener Alternative; Querverweise im Konzept und in `backup-und-restore.md` repariert.
   Kein Versionssprung von `CONSENT_VERSION` — noch keine aktiv nutzenden fremden Familien.

**Dateien.** `src/routes/buecher/+page.svelte`, `src/routes/nutzungsbedingungen/+page.svelte`,
`docs/klassen-freigabe-konzept.md`, `docs/backup-und-restore.md`

### PDF: Antwortplatz entstand über Punkt-Zeilen statt über echten Freiraum — 25.09.2026

Beide Prompts, die ein Blatt erzeugen (Generieren und Nachschärfen), verlangten „ausreichend
Leerzeilen für handschriftliche Antworten". Leerzeilen überleben Markdown nicht, also wich das
Modell aus. In den 20 Blättern in Directus stehen vier Formen: `<br><br>…` (14 Blätter),
Zeilen mit nur `.` (2) — im PDF sichtbare Punktespalten —, mit nur `\` (3) und mit `&nbsp;` (1).

Der Prompt verlangt jetzt nach jeder (Teil-)Aufgabe eine eigene Zeile `[Schreibplatz: N]`,
N = Schreibzeilen passend zum Lösungsweg. Anweisung und Erkennung stehen zusammen in
`schreibplatz.ts`. `renderMarkdown` erkennt die Markierung und die vier alten Formen als
eigenen Block (nicht in Codeblöcken) und macht daraus im PDF `<p class="answer-gap">` mit N
Umbrüchen, höchstens 30. Am Bildschirm fällt er weg — auch die Punkte, die dort bisher über
dem Antwortfeld standen. Die Seitenaufteilung im PDF erkennt den Schreibplatz an der Klasse
statt am Inhalt des Absatzes.

Aufgeräumt: `.answer-space`, `ol` / `li` und ein Kommentar ohne Regel im PDF-CSS.

Geprüft an allen 20 Blättern: Die `<br>`-Blätter sehen am Bildschirm unverändert aus, bei den
übrigen fällt nur der Platzhalter weg. In der Lösen-Ansicht bleiben Gliederung und
Nummerierung gleich. Im PDF alt gegen neu an sechs Blättern, je eines pro Form: Die
`<br>`-Blätter sind pixelgleich (eine einzelne `<br>`-Zeile ist jetzt eine Schreibzeile, ohne
sichtbaren Unterschied), das Punkt-Blatt hat Freiraum statt Punkten und eine Seite weniger.
Eine neue Generierung mit der Markierung ist noch nicht gelaufen.

**Dateien.** `src/lib/schreibplatz.ts`, `src/lib/renderMarkdown.ts`,
`src/routes/api/pdf/+server.ts`, `src/routes/api/generieren/+server.ts`,
`src/routes/api/nachschaerfen/+server.ts`

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
