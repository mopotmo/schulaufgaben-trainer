# Migrationen

Stand: 26.09.2026. Das Datenmodell steht als Datei im Repo: `schema/snapshot.json`.
Directus folgt ihr, nicht umgekehrt. Werkzeug: `scripts/schema.ts`.

## Was wohin gehört

| Änderung | Weg |
|---|---|
| Collections, Felder, Relationen, Feld-Metadaten (Notiz, Interface, Pflicht …) | Snapshot |
| Daten (Backfill, Umrechnen, Aufräumen) | Skript in `scripts/` mit `--dry`, Gerüst aus `scripts/lib/cli.ts` |
| Flows, Berechtigungen, Policies | Skript — nicht im Snapshot enthalten |

## Ablauf einer Schemaänderung

1. **Probe aufsetzen**: `scripts/backup.sh --probe` (eigenes Terminal, gpg fragt nach der
   Passphrase). Die Probe muss dieselbe Directus-Version fahren wie Produktion — sonst
   verweigert Directus den Vergleich (`docs/backup-und-restore.md`).
2. **Vorher prüfen**: `npm run schema:check -- --url=http://localhost:8055` muss „stimmt
   überein" melden. Sonst weicht schon die Produktion vom Repo ab (Handänderung?) — erst klären.
3. **In der Probe ändern**, in der Directus-Oberfläche auf `http://localhost:8055`.
4. **Übernehmen**: `npm run schema:pull -- --url=http://localhost:8055`, dann
   `git diff schema/` — genau das wird Produktion bekommen.
5. **Code anpassen**, Typen in `src/lib/server/directus.ts` mitziehen, gegen die Probe testen
   (`dev-probe` in `.claude/launch.json`).
6. **Commit, Review.** Der Snapshot-Diff gehört in denselben Commit wie der Code.
7. **Produktion**: Backup (`scripts/backup.sh`), dann

   ```sh
   npm run schema:apply -- --produktion --dry
   npm run schema:apply -- --produktion
   ```

   Schemaänderung **vor** dem Deploy des Codes, der das neue Feld liest.
8. **Protokoll** unten ergänzen.

## Felder löschen

`apply` löscht nie von sich aus. Fehlt ein Feld im Snapshot, meldet es `!! … bleibt stehen`
und lässt es in der Datenbank. Reihenfolge (CLAUDE.md):

1. Code, der das Feld nicht mehr liest, deployen.
2. Feld in der Probe löschen, `schema:pull`, committen.
3. Backup, dann `npm run schema:apply -- --produktion --mit-loeschen --dry` — die Liste
   „würde löschen" genau lesen — und ohne `--dry`.

## Abweichung feststellen

`npm run schema:check` vergleicht Produktion mit dem Repo; Exit-Code 1 bei Abweichung.
Die Richtung steht aus Sicht der Instanz: *fehlt dort* (im Repo, nicht in Directus),
*nur dort* (in Directus, nicht im Repo), *weicht ab*. Dann entscheiden: Gilt das Repo →
`apply`. Ist die Handänderung in Directus richtig → `pull` gegen Produktion und committen.

## Rückweg

Ein Backup einspielen — nicht `apply` mit einem älteren Snapshot. Directus ändert beim Abgleich
erst die Felder, dann die Relationen; eine Spalte, an der ein Fremdschlüssel hängt, lässt sich
so nicht zurückstellen (am 27.09.2026 beim Profil-Löschen gesehen: `feedback.profile_id`
UUID → Text scheiterte). Der Abbruch ist vollständig — es bleibt nichts halb angewendet.

## Directus-Update

Der Snapshot trägt die Directus-Version. Nach einem Update (erst Probe, dann Produktion)
`npm run schema:pull` gegen Produktion und committen — ohne inhaltliche Änderung nur die
Versionszeile, sonst zeigt der Diff, was die Directus-Migrationen am Datenmodell geändert haben.

## Protokoll

Neueste oben. Die Einmal-Skripte vor dem Snapshot sind idempotent; ihre Produktionsläufe
wurden nicht datiert festgehalten, das Datum ist das des letzten Commits am Skript.

| Datum | Was | Probe | Produktion |
|---|---|---|---|
| 29.09.2026 | `feature_requests` gelöscht (0 Zeilen; Code liest sie seit f9eb5f7 nicht mehr) | ✓ 29.09. | ✓ 29.09. (Backup 08:01 desselben Tages, vor dem Deploy) |
| 28.09.2026 | `accountability` aller 12 Collections und des Mail-Flows `all` → `activity` (keine Datensatz-Kopien mehr in `directus_revisions`); Directus-Fristen per Umgebung: Revisionen und Flow-Protokolle 1 Tag, Aktivität 90 Tage | ✓ 28.09. | ✓ (am 29.09. per `schema:check` bestätigt, Datum der Anwendung nicht festgehalten) |
| 27.09.2026 | `consents.type`: Auswahl `insights` (Opt-in Lernerkenntnisse); Daten: Test-Erkenntnis in `learner_insights` gelöscht | ✓ 27.09. | ✓ 27.09. |
| 27.09.2026 | Profil löschen: `learner_insights` CASCADE, `feedback.profile_id` UUID + SET NULL, `feedback.id`/`feature_requests.id` mit `uuid` | ✓ 27.09. | ✓ 27.09. |
| 26.09.2026 | Erster Snapshot aus Produktion (Directus 12.4.1, 12 Collections, 104 Felder, 11 Relationen) | — | Quelle |
| 26.09.2026 | Directus 11.17.4 → 12.4.1 (8 Directus-Migrationen) | ✓ 26.09. | ✓ 26.09. |
| 25.09.2026 | `scripts/books-last-used.ts` — `books.last_used_at` samt Backfill | ✓ | ✓ |
| 25.09.2026 | `scripts/email-verification.ts` — `email_tokens`, Flow, `groups.email_verified_at`, `invite_token`/`invite_link` | ✓ | ✓ |
| 25.09.2026 | `scripts/cleanup-families.ts` — Altlasten `families` entfernt | ✓ | ✓ |
| 21.09.2026 | `scripts/migrate-groups.ts` — `families` → `groups`, `memberships` (nicht mehr lauffähig) | ✓ | ✓ |
