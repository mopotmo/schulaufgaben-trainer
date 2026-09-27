# Backlog

Kleinere Punkte, die kein eigenes Konzept brauchen. Größere Vorhaben stehen in
`klassen-freigabe-konzept.md` (Stufen 0–2) und `spec-gruppen-rollen-einwilligung.md`.

Konvention: ein Abschnitt pro Punkt, mit Ursache und betroffenen Dateien — damit man
nicht beim Anfassen erst wieder diagnostizieren muss. Erledigtes wandert nach unten.

---

## Offen

### Donate-Button

Eltern sollen den Betrieb freiwillig unterstützen können (Wunsch vom 27.09.2026).

Rahmen, der schon feststeht:

- **Nur ein Link**, kein eingebettetes Widget oder SDK — harte Regel 4 (keine externen
  Ressourcen, sonst Cookie-Banner). Ziel z. B. PayPal.me, Ko-fi oder Buy Me a Coffee.
- **Nur für Eltern sichtbar**, also in der Familiensitzung, nicht in Ansichten der Kinder.
  Eine direkte Zahlungsaufforderung an Kinder ist unlauter (UWG, Anhang Nr. 28).
- **Nicht „Spende" nennen**, solange kein gemeinnütziger Träger dahintersteht — das Wort
  weckt die Erwartung einer Spendenquittung. „Unterstützen" oder „Kaffee spendieren".

**Offen.** Anbieter, Platzierung (Startseite, Einstellungen, Fußzeile), ob die
Datenschutzerklärung den externen Anbieter nennen muss (reiner Link: eher nein).

**Dateien.** `src/routes/+page.svelte` oder `src/routes/einstellungen/+page.svelte`,
`src/lib/config.ts` (Link)

---

### Statistiken über die Nutzung

Wunsch vom 27.09.2026: sehen, wie die App genutzt wird.

Kein Tracking im Frontend — harte Regel 4 (keine Analytics) und Regel 5 (nur das
Session-Cookie). Die Zahlen stecken ohnehin schon in Directus: `exercises`, `corrections`,
`feedback`, `books` mit Zeitstempeln und Profil- bzw. Gruppenbezug.

**Ansatz.** Zuerst das eingebaute Insights-Modul von Directus (Dashboards mit Panels,
nur für den Admin, kein Code, keine Collection): generierte Blätter und Korrekturen pro Woche,
aktive Familien, Fächer, Daumen hoch/runter. Reicht das nicht, eine Admin-Seite in der App.
Nur aggregiert anzeigen, keine Ranglisten einzelner Familien oder Kinder.

**Offen.** Welche Fragen sollen die Zahlen beantworten (Kosten je Familie? Welche Fächer?
Wird korrigiert oder nur generiert?) — danach richten sich die Panels. Eine Auswertung zu
eigenen Zwecken muss die Datenschutzerklärung nennen, falls sie über den Betrieb hinausgeht.

**Dateien.** Directus (Insights), ggf. `src/routes/admin/`

---

### Schuljahreswechsel: Klassen hochstufen oder nachfragen

Wunsch vom 27.09.2026. `profiles.grade` ist eine feste Zahl und bleibt über den
Schuljahreswechsel stehen — Aufgaben würden danach für die alte Jahrgangsstufe erzeugt. Für
die bestehenden Familien stuft der Betreiber zum Schuljahr 2026/27 von Hand um; gebaut werden
muss es bis zum nächsten Wechsel (Sommer 2027).

Einfach hochzählen reicht nicht: Wiederholung, Übertritt nach der 4. Klasse (Grundschule →
Gymnasium, Real- oder Mittelschule), Wechsel der Schulart, Abschluss nach der letzten Stufe.
Deshalb nachfragen statt still ändern.

**Ansatz.**

- Ein Feld am Profil, für welches Schuljahr die Stufe bestätigt ist (z. B.
  `profiles.grade_school_year`, Wert `2026/27`) — über den Snapshot-Weg. Das Schuljahr kommt
  aus `schoolYearEnd` in `src/lib/retention.ts` (Wechsel am 31.08., wie bei den Büchern).
- Ab dem 1. September fragt die Startseite die Eltern für jedes Profil mit altem Schuljahr:
  „Ist Jakob jetzt in Klasse 9?" — vorausgewählt die nächste Stufe, änderbar samt Schulart.
  Behutsam formulieren, eine Wiederholung ist ein gleichwertiger Knopf, kein Sonderfall.
- Nur Eltern (Familiensitzung, `profile:update`), nicht in Ansichten der Kinder.
- Bis zur Antwort nicht blockieren, sondern beim Generieren auf die unbestätigte Stufe
  hinweisen.

**Offen.** Was passiert nach der letzten Stufe (Profil archivieren, löschen, Hinweis)?
Bundesländer mit abweichendem Schuljahresbeginn — reicht der 1. September als Stichtag? Die
Lernerkenntnisse gelten je Fach und bleiben; soll die Generierung sie nach einem Wechsel der
Schulart zurückstellen?

**Dateien.** `src/routes/+page.svelte`, `src/routes/+page.server.ts`,
`src/lib/server/repo/profiles.ts`, `src/lib/retention.ts`, `schema/snapshot.json`

---

### Logs haben keine Löschfrist

Festgestellt am 27.09.2026 beim Profil-Löschen. `logs` wächst unbegrenzt, `scripts/aufraeumen.ts`
fasst die Collection nicht an. `learnerInsights/persist` schreibt bei Fehlern die `profileId`
in `details`; nach dem Löschen des Profils bleibt sie dort stehen. Dazu stehen Stacktraces mit
Fach und Thema drin. Stand Produktion: 5 Zeilen, keine mit Profil-ID.

**Ansatz.** Frist festlegen (Vorschlag: 30 Tage), in `src/lib/retention.ts` und
`scripts/aufraeumen.ts` aufnehmen, in der Datenschutzerklärung nennen. Danach das Skript neu
auf den Server kopieren (CLAUDE.md).

**Dateien.** `scripts/aufraeumen.ts`, `src/lib/retention.ts`, `src/routes/datenschutz/+page.svelte`

## Erledigt

### Lösen-Ansicht: Der Blatt-Fuß landete in der letzten Teilaufgabe — 27.09.2026

`Gesamt: 26 Punkte` am Blattende stand, durch `---` abgetrennt, im Text der letzten
Teilaufgabe über ihrem Antwortfeld. Getrennt wird nur an „Aufgabe", und eine Regel „nach `---`
ist Schluss" hätte in Latein-Blättern die Frage nach dem Übersetzungstext verschluckt.

`splitFooter` erkennt den Fuß am Inhalt: vom Blattende rückwärts nur Leerzeilen, Trennstriche
und Zeilen wie „Gesamt/Insgesamt … Punkte" oder „Viel Erfolg/Glück", bei der ersten anderen
Zeile ist Schluss. `ExerciseFields` zeigt ihn einmal unter der letzten Aufgabe, ohne
Antwortfeld. Das PDF rendert weiter den ganzen Text.

An allen 20 Blättern alt gegen neu geprüft: Anzahl und Titel der Antwortfelder gleich (Entwürfe
im localStorage passen weiter), in 19 Blättern ändert sich nur die letzte Teilaufgabe, das Blatt
ohne Fuß bleibt unverändert. Dazu Prüfungen für Latein (Frage nach dem Strich bleibt), doppelte
Trenner und „Punkte" mitten in einer Aufgabe.

**Dateien.** `src/lib/parseExercises.ts`, `src/lib/components/ExerciseFields.svelte`,
`src/routes/loesen/+page.svelte`, `src/routes/generieren/+page.svelte`

### Lernerkenntnisse nur mit Opt-in der Eltern — 27.09.2026

Aus Lösungen und Freitext-Feedback leitete das Modell für jedes Profil Stärken und Schwächen
je Fach ab und gab sie in jede Generierung. Die Datenschutzerklärung nannte das nur als
„daraus abgeleitete Lernhinweise", ohne Zweck und ohne eigene Einwilligung. Umgesetzt, solange
in Produktion nur Testdaten lagen, als zwei Ebenen:

| Ebene | Wer | Art |
|---|---|---|
| Lernerkenntnisse überhaupt | Eltern — Einwilligung, Einrichten, Einstellungen | **Opt-in**, nie vorangekreuzt, getrennt von der Pflicht-Einwilligung |
| Diese eine Lösung | wer einreicht, auch das Kind | **Opt-out**-Schalter, nur sichtbar mit Opt-in |

Begründung (entschieden 27.09.2026): Einwilligung nur als aktive Handlung (ErwG 32, EuGH
*Planet49*), Datenschutz durch Voreinstellung für Kinder (Art. 25 Abs. 2), der Dienst läuft
ohne (Art. 7 Abs. 4), und Kinder können nicht selbst einwilligen (Art. 8). Ob es Profiling
nach Art. 4 Nr. 4 ist, bleibt für den Anwaltstermin.

- Opt-in als eigene Zeile in `consents` (`type: 'insights'`) mit Name, Adresse, Zeitpunkt;
  versionsunabhängig, gilt bis zum Widerruf.
- **Eine Sperre für alles**: `upsertInsight` und `getInsightPrompt` prüfen das Opt-in der
  Familie des Profils. Ohne Opt-in geht nichts ans Modell und nichts in die Generierung.
- **Widerruf löscht** alle Erkenntnisse der Familie sofort (Art. 17 Abs. 1 lit. b, entschieden
  27.09.2026).
- Datenschutzerklärung: neuer Abschnitt 4 „Lernerkenntnisse (freiwillig)", folgende Abschnitte
  um eins verschoben. `CONSENT_VERSION` → `2026-09-v3` mit Eintrag in `CONSENT_HISTORY`.

In der Probe geprüft: über den Repo-Code ohne Opt-in keine Erkenntnisse in der Generierung und
kein Modellaufruf beim Auswerten, mit Opt-in wieder da; im Browser Einwilligung ohne Opt-in
(keine `insights`-Zeile, kein Schalter beim Lösen), Einschalten unter Einstellungen (Name als
Pflicht), Schalter beim Lösen standardmäßig an, Widerruf löscht die Erkenntnis und setzt
`revoked_at`; Einrichten bietet das Häkchen an.

**Dateien.** `src/lib/server/learnerInsights.ts`, `src/lib/server/repo/consents.ts`,
`src/lib/server/repo/insights.ts`, `src/lib/server/consentForm.ts`,
`src/lib/components/ConsentChecks.svelte`, `src/routes/einwilligung/*`,
`src/routes/einrichten/*`, `src/routes/einstellungen/*`, `src/routes/loesen/*`,
`src/routes/korrigieren/*`, `src/routes/api/korrigieren/+server.ts`,
`src/routes/datenschutz/+page.svelte`, `src/lib/legal.ts`, `src/lib/server/directus.ts`,
`schema/snapshot.json`

### Profil löschen nahm abhängige Daten nicht vollständig mit — 27.09.2026

`learner_insights.profile_id` stand auf `NO ACTION` (das Löschen wäre am Fremdschlüssel
gescheitert), `feedback.profile_id` hatte keine Relation. Erste Änderung über den
Snapshot-Weg (`docs/migrationen.md`):

- `learner_insights.profile_id` → `ON DELETE CASCADE`
- `feedback.profile_id`: Spalte von Text auf UUID, Relation auf `profiles` mit
  `ON DELETE SET NULL` — das Feedback bleibt anonym erhalten (entschieden 25.09.2026).
  Die Prüfung auf Personenbezogenes im Bestand entfiel: 0 Zeilen in Produktion.
- `feature_requests.profile_ids` ist JSON, dafür gibt es keine Kaskade: `deleteProfile`
  nimmt die ID vorher selbst heraus.
- Aufgabenblätter und Lösungsfotos brauchen nichts Eigenes: `scripts/aufraeumen.ts` führt
  beide Felder als Upload-Verweise und löscht die Dateien 30 Tage nach dem Upload.

**Nebenbei behoben:** `feedback.id` und `feature_requests.id` fehlte der Spezialwert `uuid`.
Die App schickt keine ID mit — jedes Feedback wäre mit „Fehler beim Speichern" gescheitert,
Wünsche aus dem Chat gingen still verloren. In Produktion nie aufgetreten (0 Zeilen, kein
Log-Eintrag).

In der Probe über den echten Repo-Code geprüft (Vites SSR-Loader): fremde Familie abgewiesen,
Profil samt Mitgliedschaft, Aufgabe, Korrektur und Erkenntnis weg, Feedback mit leerem
`profile_id` erhalten, Wunsch ohne die ID bei gleichem Zähler, Lösungsfoto ohne Verweis.

In Produktion am 27.09.2026 per `schema:apply` (15 Änderungen, danach `schema:check` ohne
Abweichung, Fremdschlüssel in Postgres nachgesehen).

`deleteProfile` hat weiterhin keinen Aufrufer. Die Log-Löschfrist steht oben als eigener Punkt.

**Dateien.** `schema/snapshot.json`, `src/lib/server/repo/profiles.ts`,
`src/lib/server/repo/featureRequests.ts`

### Passwort-Reset entwertete keine laufenden Sitzungen — 26.09.2026

Aus der Umsetzung vom 25.09.2026 (Double-Opt-In und „Passwort vergessen"). Das Cookie trug
nur `iat` und eine globale Version, nichts, was sich pro Familie ändert. Wer ein fremdes
Cookie hatte, blieb nach dem Reset bis zu 30 Tage angemeldet.

Das Cookie trägt jetzt einen Fingerabdruck des Passwort-Hashs (HMAC mit `SESSION_SECRET`,
der Hash selbst verlässt den Server nicht). Der Hook vergleicht ihn bei jeder Anfrage mit
Cookie gegen den aktuellen Hash — in derselben Abfrage, die vorher nur den Bestätigungsstatus
las. Jede Passwortänderung entwertet damit alle vorher ausgestellten Cookies, auch die
Änderung unter Einstellungen; das Gerät, auf dem geändert wird, bekommt ein frisches.

**Fingerabdruck statt `groups.session_version`** (entschieden 26.09.2026): keine
Schemaänderung, keine Migration. Dafür lässt sich eine Familie nicht per Hand in Directus
abmelden, und die freiwillige Änderung meldet die anderen Geräte zwangsläufig mit ab — so
gewollt. Das Cookie steht auf `v: 2`; alte Cookies ohne Fingerabdruck gelten nicht mehr,
nach dem Deploy meldet sich also jede Familie einmal neu an.

Fällt Directus aus, schlägt der Hook mit einem Fehler durch, statt die Sitzung zu löschen
(`getSessionState` fängt nur „Gruppe nicht gefunden" ab).

In der Probe mit einer Testfamilie und zwei Geräten (Browser und `curl`) geprüft: Nach dem
Reset und nach der Änderung unter Einstellungen ist das zweite Gerät abgemeldet (Seiten
leiten auf `/login`, API antwortet 401, Cookie gelöscht), das ändernde bleibt angemeldet.

**Dateien.** `src/lib/session.ts`, `src/hooks.server.ts`, `src/lib/server/repo/groups.ts`,
`src/routes/login/+page.server.ts`, `src/routes/einrichten/+page.server.ts`,
`src/routes/passwort-zuruecksetzen/+page.server.ts`, `src/routes/einstellungen/+page.server.ts`,
`src/routes/einstellungen/+page.svelte`

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
   oben unter „Löschfristen für Bücher, Uploads und Einmal-Links".
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

Was damit **nicht** gelöst ist, steht oben unter „Lernerkenntnisse fanden sich wegen Freitext
nicht wieder".

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
