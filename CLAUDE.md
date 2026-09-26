# Schulaufgaben Check — Arbeitsanweisungen

SvelteKit + Tailwind + Directus + Anthropic API. Deployment über Coolify auf Hetzner (Nürnberg).
PDF-Erzeugung mit Puppeteer.

## Kontext

Die App wird demnächst für Familien außerhalb des eigenen Haushalts geöffnet (Klassenkameradinnen).
Damit gelten DSGVO-Pflichten und die Datentrennung zwischen Familien muss belastbar sein.

Vor größeren Änderungen lesen:

- `docs/klassen-freigabe-konzept.md` — rechtlicher Rahmen, Rollenmodell, Gesamtplan
- `docs/spec-gruppen-rollen-einwilligung.md` — konkrete Umsetzungs-Spec für den aktuellen Umbau

Kleinere Punkte ohne eigenes Konzept stehen in `docs/backlog.md`.

## Harte Regeln

1. **Kein `getDirectus()` in Route-Handlern.** Jeder Datenzugriff läuft über `src/lib/server/repo/*`.
   Prüfbar mit `grep -rn "getDirectus" src/routes/` — muss leer bleiben.
2. **Jede ID aus Request-Daten ist nicht vertrauenswürdig.** Wenn eine `profileId`, `exerciseId`,
   `bookId` o. ä. aus Form, Query oder Params kommt, muss vor der Nutzung gegen den Session-Scope
   geprüft werden (`assertInScope`). Nie `readItem()` direkt auf eine übergebene ID.
3. **Nie einen Directus-Filter aus einem möglicherweise null-wertigen Wert bauen.**
   `{ _eq: null }` matcht in Directus alle NULL-Zeilen statt keiner. Erst validieren, dann filtern.
4. **Keine externen Ressourcen im Frontend.** Keine CDN-Skripte, keine Google Fonts, keine Analytics.
   Alles selbst ausliefern — sonst wird ein Cookie-Banner nötig.
5. **Nur technisch notwendige Cookies.** Aktuell genau eines: die Session.
6. **Keine Klarnamen von Kindern.** Profile tragen Vorname oder Spitzname. Kein Nachname,
   kein Geburtsdatum, kein Schulname im Klartext.
7. **Keine Lehrer-Funktionen ausliefern.** Die Rolle existiert im Datenmodell, bekommt aber
   vorerst keine UI und keine Berechtigungen.

## Arbeitsweise

- **Erst fragen, dann bauen.** Bei unklarer oder unvollständiger Aufgabenstellung, oder wenn der
  Code von der Spec abweicht: nachfragen statt raten.
- Änderungen am Datenmodell immer zuerst in Directus, dann im Code — und die Typen in
  `src/lib/server/directus.ts` mitziehen. **Beim Entfernen umgekehrt:** erst den Code, der das
  Feld nicht mehr liest, dann in Directus löschen.
- Schemaänderungen als idempotentes Skript in `scripts/` mit `--dry`, nicht von Hand in Directus —
  so sind sie reviewbar und gegen eine Backup-Kopie wiederholbar (Muster: `scripts/email-verification.ts`).
- Vor jeder Migration: DB-Backup. Nicht optional — Vorgehen in `docs/backup-und-restore.md`.
  Der erste echte Lauf geht gegen eine lokal wiederhergestellte Kopie, erst dann Produktion.
- Nach größeren Änderungen `npm run build` und `npm run check` laufen lassen.
- Mehrere Lösungsansätze vorschlagen, wenn es mehr als einen sinnvollen gibt.

## Bekannte offene Punkte

Stand 25.09.2026. Stufe 1 der Spec ist vollständig umgesetzt: `authz.ts`, Repository-Layer,
`groups` / `memberships` / `consents`, profilbasierte Session; die Altlasten (`families`,
`family_id`, `owner_family`) sind entfernt. Alle harten Regeln gelten.

Backup vor Migrationen: `scripts/backup.sh --probe` im eigenen Terminal (gpg fragt nach der
Passphrase) — erzeugt zugleich die lokale Probeumgebung. Consent-Gate und
Rechtsseiten stehen, ebenso Double-Opt-In und „Passwort vergessen" (Mailversand über einen
Directus-Flow, Konzept §3.3).

Directus läuft seit 26.09.2026 auf `directus/directus:12.4.1` (fester Tag, Core-Tarif ohne
Lizenzschlüssel: 25 Collections, 3 Studio-Nutzer). Updates erst in der Probe, dann in Coolify
den Tag ändern — die Probe muss dieselbe Version fahren (`docs/backup-und-restore.md`).

Zwei Cronjobs auf dem Server, nicht Teil des App-Deploys: `scripts/aufraeumen.ts` (Löschfristen,
01:45 UTC) und `scripts/backup-cron.sh` (Backup auf die Storage Box, 02:15 UTC). Nach einer
Änderung an ihnen oder an `src/lib/retention.ts` von Hand neu auf den Server kopieren —
Pfade in `docs/backup-und-restore.md`.

Neue Familien legt nur der Admin in Directus an; Einladungslink und Token vergibt Directus selbst.
Es gibt keine App-UI zum Einladen — so gewollt.

Offen:

- Profil löschen nimmt `learner_insights` und `feedback` nicht mit (Backlog) — folgenlos, solange
  `deleteProfile` keinen Aufrufer hat.
- Übrige Punkte aus Stufe 0 und 2: `docs/klassen-freigabe-konzept.md` §6/§7 und `docs/backlog.md`.
