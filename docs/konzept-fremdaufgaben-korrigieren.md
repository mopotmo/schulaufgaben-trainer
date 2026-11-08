# Fremde Aufgaben korrigieren (Hausaufgaben, Übungsblätter)

Stand: 08.11.2026 · Status: **Konzept, nicht umgesetzt** · Issue: #11

Bisher korrigiert der Trainer nur Aufgaben, die er selbst erzeugt hat: Die Korrektur bekommt
`exercises.generated_content` als Aufgabenstellung samt Punkten. Neu: Ein Kind (oder ein
Elternteil) fotografiert eine Aufgabe, die nicht aus dem Trainer stammt — Hausaufgabe aus dem
Buch, Arbeitsblatt der Lehrkraft, Übungsaufgabe aus einem Heft — samt eigener Lösung und
bekommt dieselbe Art Rückmeldung wie bei einer Trainer-Aufgabe.

> Kein Rechtsrat. Die Punkte in §5 gehören zu den offenen Rechtsfragen in
> `docs/klassen-freigabe-konzept.md` §7.

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

Nicht im Umfang: Aufsätze/Erörterungen mit ausführlicher Textkritik (geht technisch, braucht aber
einen eigenen Prompt und eine eigene Diskussion), Klassenarbeiten mit echter Note der Lehrkraft.

## 3. Lösungsansätze

### A — Fremde Aufgabe als `exercises`-Datensatz mit Herkunft *(Empfehlung)*

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
/korrigieren?profil=…  ──►  „Eigene Aufgabe korrigieren"
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
```

### 4.1 Transkription (neuer Endpunkt)

- Eingabe: `profileId` (→ `getProfile`/`assertInScope`), 1–n Bilder oder PDF, optional Text.
- Prompt: Aufgabenstellung wörtlich übernehmen, Nummerierung erhalten, Formeln in KaTeX.
  **Namen, Schulname, Klasse, Lehrkraft nicht übernehmen** (harte Regel 6, §5).
  Fach aus der Liste `listSubjects()` wählen, wenn eine passt (vermeidet neue Schreibweisen,
  vgl. #6).
- Ausgabe strukturiert (Tool-Use/JSON): `content`, `subject`, `topic`, `solution_on_sheet: boolean`,
  `unreadable: string[]` (Stellen, die das Modell nicht lesen konnte — in der Prüfansicht markieren).
- Bilder bleiben im Request für Schritt 5 erhalten (Client hält sie), damit nicht zweimal
  hochgeladen werden muss. Gespeichert wird wie bisher in `source_file` — dabei gleich das
  Problem „nur erste Datei" angehen oder bewusst so lassen (offene Frage).

### 4.2 Korrektur-Prompt für `origin = 'external'`

- **Keine Punkte vorgegeben** → Format „Richtig / Teilweise richtig / Falsch" je Teilaufgabe,
  keine Punktsumme, kein Prozentsatz.
- Keine Musterlösung vorhanden: Das Modell löst selbst. Im Prompt ausdrücklich: bei
  Unsicherheit sagen, statt als falsch zu werten; Rechenweg zeigen.
- Optional: Lösungen aus dem Buchanhang als zusätzliches Foto („Lösungsblatt"), dann wird
  dagegen geprüft.
- Hausaufgabe heißt oft: Das Kind soll es selbst können. Die Korrektur erklärt Fehler, gibt
  aber **nicht die komplette Lösung** der falsch gelösten Teilaufgaben vor, sondern einen Hinweis
  und lässt nachbessern (offene Frage — pädagogische Entscheidung).

### 4.3 Nachgelagerte Funktionen

| Funktion | Verhalten bei `external` |
|---|---|
| Historie | Eintrag mit Kennzeichnung „Eigene Aufgabe" |
| Lernerkenntnisse | wie bisher, Opt-in der Eltern gilt unverändert |
| Chat / Rückfrage | unverändert |
| Folgefrage / Nachschärfen | ausblenden — beides setzt eine vom Trainer erzeugte Aufgabe voraus |
| Lösen im Browser (`/loesen`) | möglich (Schritt 4), PDF-Export ausblenden |
| Nutzungsstatistik | `origin` als zusätzliche Dimension |
| Datenexport / Familie löschen | läuft über `exercises`, nichts zu tun |

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
- **Nutzungsbedingungen:** Satz ergänzen, dass auch eigene Aufgaben korrigiert werden können und
  die Korrektur falsch sein kann. Prüfen, ob das eine neue `CONSENT_VERSION` braucht.

## 6. Datenmodell und Migration

1. In der Probe: `exercises.origin`, Typ String, Dropdown `generated`/`external`,
   Default `generated`, nicht null.
2. `npm run schema:pull`, committen; Typ `Exercise` in `src/lib/server/directus.ts` ergänzen.
3. Bestand: Default greift für neue Zeilen; vorhandene Zeilen per idempotentem Skript
   (`scripts/`, `--dry`) auf `generated` setzen, falls Directus den Default nicht nachträgt.
4. DB-Backup (`scripts/backup.sh --probe`), Lauf gegen die lokale Kopie, dann
   `npm run schema:apply` nach Produktion; Protokoll in `docs/migrationen.md`.

Keine neue Collection, keine neuen Berechtigungen: `learner` hat schon `exercise:create` und
`correction:create`.

## 7. Umsetzungsschritte

1. Schemaänderung (§6)
2. `createExercise` um `origin` erweitern; `listExercises` liefert es mit
3. Endpunkt Transkription + Prüfansicht auf `/korrigieren`
4. Korrektur-Prompt nach `origin` verzweigen
5. Historie-Kennzeichnung, Folgefrage/Nachschärfen/PDF ausblenden
6. Hinweise (Upload, Prüfansicht), Nutzungsbedingungen, Datenschutzerklärung, `vvt-tom.md`
7. `npm run build`, `npm run check`, `grep -rn "getDirectus" src/routes/` leer

## 8. Offene Fragen

- [ ] Ansatz A bestätigen?
- [ ] Wer darf das: nur Kinder, nur Eltern, beide? (Rechte gibt es für beide schon.)
- [ ] Bei Fehlern volle Lösung zeigen oder nur Hinweis + nachbessern lassen?
- [ ] Einstiegspunkt: Schaltfläche auf `/korrigieren?profil=…` oder eigener Menüpunkt?
- [ ] Mehrere Fotos speichern oder weiterhin nur das erste (betrifft auch die bestehende Korrektur)?
- [ ] Freie Textaufgaben (Aufsatz, Übersetzung Latein) gleich mit abdecken oder später?
- [ ] Neue `CONSENT_VERSION` nötig, wenn die Nutzungsbedingungen ergänzt werden?
