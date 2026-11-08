# Fremde Aufgaben korrigieren (Hausaufgaben, Übungsblätter)

Stand: 08.11.2026 · Status: **Konzept, Grundsatzfragen entschieden, nicht umgesetzt** · Issue: #11

Bisher korrigiert der Trainer nur Aufgaben, die er selbst erzeugt hat: Die Korrektur bekommt
`exercises.generated_content` als Aufgabenstellung samt Punkten. Neu: Ein Kind (oder ein
Elternteil) fotografiert eine Aufgabe, die nicht aus dem Trainer stammt — Hausaufgabe aus dem
Buch, Arbeitsblatt der Lehrkraft, Übungsaufgabe aus einem Heft — samt eigener Lösung und
bekommt dieselbe Art Rückmeldung wie bei einer Trainer-Aufgabe.

> Kein Rechtsrat. Die Punkte in §5 gehören zu den offenen Rechtsfragen in
> `docs/klassen-freigabe-konzept.md` §7.

## 0. Entscheidungen (08.11.2026)

| Frage | Entscheidung |
|---|---|
| Ansatz | **A** — fremde Aufgabe als `exercises`-Datensatz mit `origin` (§3) |
| Wer darf das | Kinder **und** Eltern (Rechte `exercise:create`/`correction:create` gibt es für beide) |
| Fehler in der Lösung | **Nur Hinweise** statt vollständiger Lösung, das Kind bessert nach. **Pro Profil einstellbar**, gilt dann für fremde *und* generierte Aufgaben (§4.4, §4.7) |
| Einstieg | **Eigener Menüpunkt** (§4) |
| Mehrere Fotos | **Alle speichern**, auch bei der bestehenden Korrektur und beim Aufgabenblatt der Generierung (§4.5) |
| Freie Textaufgaben | **Mit abdecken** — Aufsatz, Erörterung, Übersetzung (§4.6) |
| `CONSENT_VERSION` | **Keine neue** Version; Nutzungsbedingungen werden ergänzt, ohne Neueinwilligung |
| Mehrere Fotos, Ablage | **Zwei Junctions** `exercises_files`, `corrections_files` (Ansatz M, §4.5) |
| Aufgabentyp | **Eigenes Feld** `exercises.task_kind` (§4.6) |

---

## 1. Ist-Stand (geprüft am 08.11.2026)

| Bereich | Stand |
|---|---|
| Korrektur | `src/routes/api/korrigieren/+server.ts` verlangt eine `exerciseId`; die Aufgabenstellung kommt immer aus `exercise.generated_content`. Drei Eingabewege: aufgabenweise (Text/Stift), Freitext, Fotos. |
| Ablage | `corrections.exercise_id` ist Pflicht, der Scope läuft Korrektur → Aufgabe → Profil (`src/lib/server/repo/corrections.ts`). |
| Uploads | Aufgabenblatt in `exercises.source_file`, Lösungsfoto in `corrections.solution_file` — jeweils **nur die erste Datei** wird gespeichert. Beide Felder löscht `scripts/aufraeumen.ts` nach 30 Tagen (`UPLOAD_RETENTION_DAYS`). |
| Bewertung | Prompt verlangt Punkte je Aufgabe und Prozentsatz. Die Notenschätzung ist seit 08.11.2026 aus der App entfernt. |
| Nachgelagert | `upsertInsight` (Lernerkenntnisse je Fach), Historie, Chat, Folgefrage, Nachschärfen und PDF lesen `generated_content`. |
| Directus | 11 Collections (Core-Tarif erlaubt 25). |

## 2. Anwendungsfälle

1. **Arbeitsblatt mit eingetragener Lösung** — ein Foto enthält Aufgabe und Lösung.
2. **Buchaufgabe + Heft** — Foto der Buchseite (Aufgabe) und Foto vom Heft (Lösung).
3. **Aufgabe abgetippt** — Kind tippt die Aufgabenstellung ab oder kopiert sie, löst im Browser.
4. **Mehrseitig** — zwei, drei Seiten Arbeitsblatt.

5. **Freie Textaufgabe** — Aufsatz, Erörterung, Bildbeschreibung, Übersetzung (§4.6).

Nicht im Umfang: Klassenarbeiten mit echter Note der Lehrkraft.

## 3. Lösungsansätze

### A — Fremde Aufgabe als `exercises`-Datensatz mit Herkunft *(entschieden)*

Neues Feld `exercises.origin` (`generated` | `external`, Default `generated`). Eine fremde
Aufgabe wird beim Hochladen zu einem normalen Aufgaben-Datensatz: Das Modell **transkribiert**
die Aufgabenstellung aus dem Foto in `generated_content`, Fach und Thema schlägt es vor.
Danach läuft die bestehende Korrektur unverändert weiter.

- \+ Scope-Kette, `assertInScope`, Repository, Historie, Chat, Insights, Löschfristen und
  Datenexport („Meine Daten") funktionieren ohne Umbau.
- \+ Ein einziges neues Feld, keine neue Collection.
- \+ Das Transkript kann vor der Korrektur geprüft und korrigiert werden — das ist der größte
  Hebel gegen falsche Korrekturen (schlecht lesbares Foto → falsche Aufgabe → falsche Korrektur).
- − Der Feldname `generated_content` passt nicht mehr ganz. Umbenennen lohnt nicht; ein
  Kommentar im Typ reicht.
- − Zwei Modellaufrufe statt einem (Transkription + Korrektur).

### B — Korrektur ohne Aufgabe

`corrections.exercise_id` optional, dafür `corrections.profile_id` und ein Feld für die
Aufgabenstellung.

- − Zweiter Scope-Pfad für Korrekturen; genau die Art Sonderfall, die bei der IDOR-Lücke weh
  getan hat. Jede Stelle, die heute über `exercise_id` scoped, braucht eine Verzweigung.
- − Historie, Insights und Chat müssten beide Formen kennen.
- \+ Ein Aufruf, kein Zwischenschritt.

### C — Eigene Collection `external_tasks`

- − Doppelte Repository-Funktionen, doppelte Löschlogik, eigener Export. Kein Vorteil gegenüber A.

**Empfehlung: A.** B und C erkaufen nichts, was A nicht auch kann, und B schwächt die Datentrennung.

## 4. Ablauf (Ansatz A)

```
Startseite, Profilkarte  ──►  neuer Menüpunkt „Eigene Aufgabe"  ──►  /eigene-aufgabe?profil=…
        │
        ▼
1. Aufgabe erfassen        Fotos (Aufgabe, ggf. mit Lösung) oder Text
        │                  POST /api/aufgabe-erfassen
        ▼
2. Modell transkribiert    Aufgabenstellung als Markdown/KaTeX wie bei generierten Aufgaben,
                           Vorschlag für Fach und Thema, Hinweis „Lösung ist mit auf dem Foto"
        │                  → createExercise(actor, profileId, { origin: 'external', … })
        ▼
3. Prüfen                  Kind/Elternteil sieht das Transkript, kann es bearbeiten
        │                  (updateExerciseContent — gibt es schon)
        ▼
4. Lösung                  vorhandene Wege: Foto, Text, aufgabenweise; entfällt, wenn die
        │                  Lösung schon auf dem Aufgabenfoto ist
        ▼
5. Korrektur               POST /api/korrigieren mit exerciseId — wie bisher, Prompt je nach origin
        │
        ▼
6. Nachbessern             nur bei external: Hinweise lesen, korrigierte Lösung erneut
                           einreichen → zweite Korrektur zur selben Aufgabe (§4.4)
```

Der Menüpunkt sitzt neben „Generieren", „Korrigieren" und „Historie" auf der Profilkarte, weil
eine Aufgabe immer einem Profil gehört. `profil` aus der Query wird wie überall per
`getProfile(actor, …)` geprüft. Die Route bekommt eine eigene Seite statt eines Modus von
`/korrigieren`; die Korrektur selbst läuft trotzdem über denselben Endpunkt.

### 4.1 Transkription (neuer Endpunkt)

- Eingabe: `profileId` (→ `getProfile`/`assertInScope`), 1–n Bilder oder PDF, optional Text.
- Prompt: Aufgabenstellung wörtlich übernehmen, Nummerierung erhalten, Formeln in KaTeX.
  **Namen, Schulname, Klasse, Lehrkraft nicht übernehmen** (harte Regel 6, §5).
  Fach aus der Liste `listSubjects()` wählen, wenn eine passt (vermeidet neue Schreibweisen,
  vgl. #6).
- Ausgabe strukturiert (Tool-Use/JSON): `content`, `subject`, `topic`, `solution_on_sheet: boolean`,
  `unreadable: string[]` (Stellen, die das Modell nicht lesen konnte — in der Prüfansicht markieren).
- Die Fotos werden beim Erfassen gespeichert und hängen an der Aufgabe (§4.5). Liegt die
  Lösung mit auf dem Blatt, verweist die Korrektur in Schritt 5 auf dieselben Dateien, statt
  sie erneut hochzuladen.

### 4.2 Korrektur-Prompt für `origin = 'external'`

- **Keine Punkte vorgegeben** → Format „Richtig / Teilweise richtig / Falsch" je Teilaufgabe,
  keine Punktsumme, kein Prozentsatz.
- Keine Musterlösung vorhanden: Das Modell löst selbst. Im Prompt ausdrücklich: bei
  Unsicherheit sagen, statt als falsch zu werten. Die eigene Lösung dient nur dem Abgleich und
  wird nicht ausgegeben.
- Optional: Lösungen aus dem Buchanhang als zusätzliches Foto („Lösungsblatt"), dann wird
  dagegen geprüft.
- **Nur Hinweise** bei Fehlern (§4.4).

### 4.4 Hinweise statt Lösung, Nachbessern

Ist für das Profil „nur Hinweise" eingestellt (§4.7), zeigt die Korrektur **nicht die richtige
Lösung** — bei fremden wie bei generierten Aufgaben. Hausaufgaben sollen selbst gelöst werden;
eine fertige Lösung zum Abschreiben wäre das Gegenteil. Ist die Einstellung aus, erklärt die
Korrektur wie heute auch die richtige Lösung.

- Je Teilaufgabe: richtig / teilweise richtig / falsch (bei generierten Aufgaben mit Punkten), **wo** der Fehler steckt (Zeile,
  Rechenschritt, Satz) und ein **Hinweis**, der in die richtige Richtung zeigt, ohne das
  Ergebnis zu nennen. Beispiel: „Prüf noch mal das Vorzeichen beim Ausmultiplizieren der
  zweiten Klammer" statt „richtig wäre −6x".
- Richtig gelöste Teilaufgaben werden bestätigt, gern mit kurzem Warum.
- **Der Prompt allein reicht nicht als Garantie.** Modelle rutschen in die Lösung. Darum
  zweistufig: Die Korrektur liefert strukturiert (Tool-Use) `verdict`, `location`, `hint` je
  Teilaufgabe; die Oberfläche rendert nur diese Felder. Ein freies Feld „Lösung" gibt es nicht.
- **Nachbessern:** Nach der Korrektur kann das Kind eine überarbeitete Lösung einreichen. Das
  wird eine weitere Zeile in `corrections` zur selben Aufgabe. Der Prompt bekommt die vorige
  Korrektur mit und bewertet nur noch die offenen Teilaufgaben. Heute geht das UI von genau
  einer Korrektur je Aufgabe aus (`hasCorrection`, „Bereits korrigiert") — für `external`
  und bei „nur Hinweise" aufheben, die Historie zeigt dann alle Durchgänge. Das betrifft auch
  `/loesen` und den Lösen-Teil von `/generieren`.
- **Rückfragen-Chat:** Der Chat zur Korrektur (`/api/chat`) und `/api/folgefrage` bekommen bei „nur Hinweise" dieselbe
  Vorgabe — erklären, Fragen stellen, Lösung nicht verraten. Sonst ist der Chat der Weg um
  die Regel herum.
- Wie viele Durchgänge? Kein festes Limit vorgesehen; die Tokenkosten fallen je Durchgang an.
  Wenn das teuer wird, später ein Limit pro Aufgabe.
- Eltern sehen in der Historie dieselben Hinweise. Eine Taste „Lösung anzeigen" nur für Eltern
  wäre denkbar, ist aber **nicht** Teil dieser Umsetzung.

### 4.5 Mehrere Fotos speichern

Heute speichern `generieren` und `korrigieren` nur die **erste** Datei (`validFiles[0]`,
`sourceFiles[0]`), obwohl alle ans Modell gehen. Bei mehrseitigen Lösungen fehlt danach der Rest
— in der Historie, im Export und für das Nachbessern. Das wird für alle Wege behoben.

`exercises.source_file` und `corrections.solution_file` sind einzelne Verweise (M2O auf
`directus_files`). Drei Möglichkeiten:

| | Ansatz | Bewertung |
|---|---|---|
| **M** | Zwei M2M-Junctions in Directus: `exercises_files`, `corrections_files` (je `file`, Eltern-FK, `sort`) | Directus-Standard, jede Junction hat genau einen Eigentümer → Scope eindeutig über die Aufgabe bzw. Korrektur; Löschen der Aufgabe kaskadiert. +2 Collections (11 → 13 von 25). **Empfehlung.** |
| U | Eine Collection `uploads` mit `file`, `exercise_id` *oder* `correction_id` | Eine Collection weniger, aber „genau eins von zwei" muss der Code sicherstellen; zwei Scope-Pfade in einer Tabelle |
| J | JSON-Feld mit Datei-IDs | Keine Relation, die Directus kennt. `scripts/aufraeumen.ts` würde die Dateien nicht als verwiesen erkennen — **gefährlich**, verworfen |

Folgen für **M**:

- `scripts/aufraeumen.ts`: Das Skript liest alle Relationen auf `directus_files` und **löscht
  nie eine Datei mit unbekanntem Verweis**. Die neuen Felder `exercises_files.file` und
  `corrections_files.file` müssen in `UPLOAD_REFS`, sonst greift die 30-Tage-Frist nicht. Nach
  der Änderung von Hand auf den Server kopieren (CLAUDE.md, Cronjobs).
- Nach Ablauf der Frist: Datei löschen **und** die Junction-Zeile (sonst verwaiste Zeilen).
- `familyData.ts` (Export, Familie löschen): Datei-IDs aus den Junctions statt aus den
  Einzelfeldern sammeln.
- `files.ts`: `uploadFiles` mehrfach; die Datei hängt erst nach dem Anlegen der Junction-Zeile
  an einer geprüften Ressource — Reihenfolge Upload → Aufgabe/Korrektur → Junction, bei Fehler
  hochgeladene Dateien wieder löschen.
- **Altfelder:** `source_file`/`solution_file` per Skript (`--dry`) in die Junctions
  übernehmen. Entfernen in der vorgeschriebenen Reihenfolge: erst Code, der sie nicht mehr
  liest, deployen, dann in Directus löschen (`schema:apply --mit-loeschen`).
- Das ist der größte Teil der Migration und **unabhängig von fremden Aufgaben** — sinnvoll als
  eigener erster Schritt.

### 4.6 Freie Textaufgaben

Aufsatz, Erörterung, Inhaltsangabe, Bildbeschreibung, Übersetzung (Latein/Englisch). Hier gibt
es kein „richtig/falsch" je Teilaufgabe.

- Beim Erfassen erkennt das Modell den Typ: `task_kind: 'structured' | 'free_text'`. Kein
  eigenes Datenbankfeld nötig, wenn der Typ im Transkript als Kopf steht — besser aber als
  Feld `exercises.task_kind`, weil der Korrektur-Prompt davon abhängt (Entscheidung beim Bau).
- Korrektur bei `free_text`, ebenfalls nur Hinweise:
  - **Aufgabe erfüllt?** Thema, Textsorte, Umfang, Operator („erörtere", „beschreibe").
  - **Aufbau** — Einleitung, Hauptteil, Schluss; Gliederung, Absätze.
  - **Inhalt** — Argumente, Belege, roter Faden.
  - **Sprache** — Ausdruck, Satzbau; Rechtschreibung und Grammatik als markierte Stellen mit
    Hinweis auf die Regel, **nicht** als korrigierter Text.
  - **Übersetzung:** Stellen markieren, an denen Grammatik oder Wortwahl nicht stimmt
    (Kasus, Tempus, Konstruktion), Hinweis auf das Phänomen, keine Musterübersetzung.
  - Zwei, drei Stärken und die zwei wichtigsten Baustellen — nicht 30 Anmerkungen.
- Handschrift: lange Texte als Foto sind die schwierigste Eingabe. In der Prüfansicht (Schritt 3)
  wird bei `free_text` **auch die Lösung transkribiert** und angezeigt, damit Lesefehler nicht als
  Rechtschreibfehler gewertet werden.
- Insights: Hinweise aus Aufsätzen sind für `learner_insights` wertvoll (wiederkehrende
  Fehler), laufen aber wie bisher nur mit Opt-in.

### 4.7 Einstellung „Nur Hinweise" je Profil

- Neues Feld `profiles.hints_only` (Boolean, nicht null).
- Einstellen dürfen **nur Eltern** (`profile:update`; `learner` hat das Recht nicht — sonst
  schaltet das Kind es selbst ab). Ort: `/einstellungen`, je Kinderprofil ein Schalter.
  Heute gibt es dort keine Profilbearbeitung; `updateProfile` existiert im Repo, wird aber von
  keiner Route genutzt.
- Gelesen wird die Einstellung **serverseitig** aus dem Profil der Aufgabe
  (`getExercise` → `profile`), nie aus dem Formular. Sonst könnte das Kind sie per Request
  umgehen (harte Regel 2 sinngemäß).
- Wirkt auf: Korrektur-Prompt und Ausgabeformat (§4.4), Chat, Folgefrage, Nachbessern.
  Generierte Aufgaben enthalten ohnehin keine Musterlösungen (Prompt in `/api/generieren`).
- Bereits gespeicherte Korrekturen bleiben, wie sie sind; die Einstellung wirkt ab der nächsten
  Korrektur.

### 4.8 Nachgelagerte Funktionen

| Funktion | Verhalten bei `external` |
|---|---|
| Historie | Eintrag mit Kennzeichnung „Eigene Aufgabe" |
| Lernerkenntnisse | wie bisher, Opt-in der Eltern gilt unverändert |
| Chat / Rückfrage | mit der Vorgabe „keine Lösung verraten" (§4.4) |
| Folgefrage / Nachschärfen | ausblenden — beides setzt eine vom Trainer erzeugte Aufgabe voraus |
| Lösen im Browser (`/loesen`) | möglich (Schritt 4), PDF-Export ausblenden |
| Nutzungsstatistik | `origin` als zusätzliche Dimension |
| Datenexport / Familie löschen | läuft über `exercises`; Dateien aus den Junctions (§4.5) |

## 5. Datenschutz und KI-VO

- **Neue Datenkategorie im Upload:** Arbeitsblätter tragen oft Name des Kindes, Klasse,
  Schulname, Name der Lehrkraft, mitunter Noten. Das Foto selbst fällt unter die 30-Tage-Frist
  (`source_file`, schon abgedeckt). Das **Transkript bleibt** bis zur Kontolöschung — deshalb
  die Anweisung im Prompt, solche Angaben wegzulassen, und die Prüfansicht vor dem Speichern.
  Hinweis direkt am Upload: „Name und Schule vorher abdecken oder abschneiden".
- **Fremde Personen:** Name der Lehrkraft auf dem Blatt = Daten eines Dritten an Anthropic.
  Gering, aber in `docs/vvt-tom.md` und ggf. der Datenschutzerklärung (Kategorien) nachziehen.
- **Urheberrecht:** Buchseiten und Arbeitsblätter werden kopiert und an Anthropic übermittelt.
  Gleiche Lage wie beim bestehenden Upload von Buchseiten bei der Generierung; das Transkript
  ist eine private Vervielfältigung. Kein neues Thema, aber für den Anwaltstermin mitnehmen.
- **KI-VO Anhang III Nr. 3 b:** Bisher argumentieren wir, dass das Angebot keinen Bezug zur
  Schule hat (§3.8). Eine Korrektur **echter Hausaufgaben** rückt näher an den schulischen
  Lernprozess. Deshalb: keine Punktsumme (Noten gibt die App ohnehin nicht mehr aus), Ergebnis
  geht nirgendwohin außer an die Familie. Den Punkt im Anwaltstermin ausdrücklich ansprechen.
- **Art. 50:** Der bestehende KI-Hinweis auf der Korrekturseite gilt auch hier; zusätzlich in der
  Prüfansicht („Text wurde von der KI aus dem Foto gelesen").
- **Nutzungsbedingungen:** Satz ergänzen, dass auch eigene Aufgaben (Hausaufgaben, Arbeitsblätter)
  korrigiert werden können und die Korrektur falsch sein kann. **Keine neue `CONSENT_VERSION`**
  (entschieden 08.11.2026): Zweck, Empfänger und Datenkategorien bleiben gleich.

## 6. Datenmodell und Migration

Zwei getrennte Migrationen, in dieser Reihenfolge:

**6a — Mehrere Dateien (§4.5)**

1. In der Probe: Junctions `exercises_files` und `corrections_files` (M2M auf `directus_files`,
   `sort`, Löschen der Aufgabe/Korrektur kaskadiert auf die Junction).
2. `schema:pull`, Typen in `directus.ts`, Skript für die Übernahme der Altfelder (`--dry`).
3. Code umstellen (Lesen und Schreiben), `aufraeumen.ts` und `familyData.ts`, deployen,
   Skript laufen lassen, Cronjob-Skript auf den Server.
4. Erst danach `source_file`/`solution_file` in der Probe löschen, `schema:pull`, `schema:apply
   --mit-loeschen`.

**6b — Fremde Aufgaben und Hinweis-Modus**

1. In der Probe: `exercises.origin`, Typ String, Dropdown `generated`/`external`,
   Default `generated`, nicht null; `exercises.task_kind` (`structured`/`free_text`, Default
   `structured`, nicht null); `profiles.hints_only` (Boolean, Default siehe §8).
2. `npm run schema:pull`, committen; Typ `Exercise` in `src/lib/server/directus.ts` ergänzen.
3. Bestand: Default greift für neue Zeilen; vorhandene Zeilen per idempotentem Skript
   (`scripts/`, `--dry`) auf `generated` setzen, falls Directus den Default nicht nachträgt.
4. DB-Backup (`scripts/backup.sh --probe`), Lauf gegen die lokale Kopie, dann
   `npm run schema:apply` nach Produktion; Protokoll in `docs/migrationen.md`.

Für jeden Lauf: DB-Backup, erst gegen die lokale Kopie, Protokoll in `docs/migrationen.md`.
Keine neuen Berechtigungen: `learner` und Eltern haben schon `exercise:create` und
`correction:create`.

## 7. Umsetzungsschritte

Schritt 1 lässt sich unabhängig ausliefern und behebt einen bestehenden Mangel.

1. **Mehrere Fotos** (§4.5, §6a) — für Generierung und bestehende Korrektur
2. Schema `origin`, `task_kind`, `hints_only` (§6b); Repo-Funktionen und Typen erweitern;
   Schalter „Nur Hinweise" je Profil in `/einstellungen`
3. Route `/eigene-aufgabe`, Menüpunkt auf der Profilkarte
4. Endpunkt Transkription + Prüfansicht (bei `free_text` inkl. Lösungstranskript)
5. Korrektur-Prompt nach `origin`, `task_kind` und `hints_only`, strukturierte Hinweise statt
   Lösung (§4.4, §4.6); Vorgabe für Chat und Folgefrage
6. Nachbessern: mehrere Korrekturen je Aufgabe, Historie zeigt Durchgänge
7. Historie-Kennzeichnung, Folgefrage/Nachschärfen/PDF ausblenden
8. Hinweise (Upload, Prüfansicht), Nutzungsbedingungen, Datenschutzerklärung, `vvt-tom.md`
9. Nach jedem Schritt `npm run build`, `npm run check`, `grep -rn "getDirectus" src/routes/` leer

## 8. Offene Fragen

- [ ] Default für `profiles.hints_only`: Empfehlung **an** für neue Profile (passt zur
      Entscheidung, dass Hausaufgaben nicht vorgelöst werden). Bestehende Profile: **aus**
      lassen, damit sich für laufende Profile nichts unbemerkt ändert, und die Eltern per Hinweis
      in den Einstellungen auf den neuen Schalter aufmerksam machen — oder ebenfalls an?
