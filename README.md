# Schulaufgaben Check

Ein privater, kostenloser Übungstrainer für Schulkinder. Er erzeugt Übungsblätter passend zu
Schulart, Jahrgangsstufe und Bundesland, korrigiert eingereichte Lösungen – getippt, gezeichnet
oder fotografiert – und gibt die Blätter als PDF zum Ausdrucken aus. Genutzt wird er von einigen
Familien aus dem Bekanntenkreis; jede Familie sieht nur ihre eigenen Daten.

Weil es um Daten von Kindern geht, ist Datenschutz die Leitplanke für jede Änderung: Einwilligung
der Eltern, keine Klarnamen der Kinder, keine externen Ressourcen, ein einziges Cookie,
automatische Löschfristen. Die Regeln dazu stehen in [`CLAUDE.md`](CLAUDE.md).

## Funktionen

- **Generieren** – Übungsblätter per KI, auf Wunsch mit einem hochgeladenen Schulbuch als Quelle
- **Lösen** – Antworten tippen oder zeichnen, mit Stoppuhr und mathematischen Symbolen
- **Korrigieren** – Korrektur und Notenschätzung durch die KI, auch für Fotos handschriftlicher
  Lösungen; Rückfragen im Chat
- **Historie** – alle Blätter und Korrekturen je Kind
- **PDF** – Blätter mit Schreibplatz zum Ausdrucken
- **Lernerkenntnisse** – optional und nur mit Einwilligung der Eltern: Stärken und Schwächen je
  Fach fließen in neue Blätter ein
- **Familienzugang** – Einladung, Einwilligung und bestätigte E-Mail-Adresse, Passwort vergessen

## Stack

| | |
|---|---|
| App | [SvelteKit](https://svelte.dev/docs/kit) mit `adapter-node`, Svelte 5, TypeScript |
| Oberfläche | Tailwind CSS, KaTeX für Formeln |
| Daten | [Directus](https://directus.io) 12 auf Postgres – Datenhaltung, Dateien, Mail-Flow |
| KI | Anthropic-API (Generierung, Korrektur, Lernerkenntnisse) |
| PDF | Puppeteer mit Chromium |
| Betrieb | Coolify mit Nixpacks, Hetzner (Deutschland) |

## Lokal einrichten

Voraussetzungen: Node.js 22.12 oder neuer, eine erreichbare Directus-Instanz mit dem
Datenmodell aus [`schema/snapshot.json`](schema/snapshot.json) und ein Anthropic-API-Schlüssel.

```sh
npm install
cp .env.example .env   # dann ausfüllen
npm run dev
```

| Variable | Wozu |
|---|---|
| `DIRECTUS_URL` | Adresse der Directus-Instanz |
| `DIRECTUS_TOKEN` | statischer Token eines Directus-Kontos mit Vollzugriff; die App greift nur serverseitig zu |
| `ANTHROPIC_API_KEY` | Schlüssel für die Anthropic-API |
| `SESSION_SECRET` | zufälliger, langer Wert zum Signieren des Sitzungs-Cookies |
| `BODY_SIZE_LIMIT` | Obergrenze für Uploads in Bytes (empfohlen 10 MB) |

**PDF lokal:** `.npmrc` unterdrückt den Chrome-Download von Puppeteer, weil der Server Chromium
aus Nixpacks nutzt. Lokal einmalig Chrome holen – oder `PUPPETEER_EXECUTABLE_PATH` auf einen
vorhandenen Chrome/Chromium setzen:

```sh
npx puppeteer browsers install chrome
```

`DIRECTUS_URL` und die übrigen Werte werden beim Build fest eingebaut
(`$env/static/private`) – nach einer Änderung neu bauen.

## Befehle

| Befehl | |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm run check` | Typ- und Svelte-Prüfung |
| `npm run build` / `npm start` | Produktions-Build bauen und starten |
| `npm run schema:check` | Datenmodell einer Directus-Instanz gegen `schema/snapshot.json` prüfen |
| `npm run schema:pull` | Datenmodell einer Instanz nach `schema/snapshot.json` übernehmen |
| `npm run schema:apply` | Instanz an `schema/snapshot.json` angleichen (löscht nur mit `--mit-loeschen`) |

Die `schema:*`-Befehle arbeiten standardmäßig gegen `DIRECTUS_URL`; eine andere Instanz mit
`-- --url=http://localhost:8055`. Gegen alles außer `localhost` verlangt `schema:apply`
zusätzlich `--produktion`.

## Aufbau

```
src/
  hooks.server.ts        Sitzung, Einwilligungs- und E-Mail-Gate für jede Anfrage
  lib/server/repo/       einziger Weg zu Directus – jede ID wird gegen die Sitzung geprüft
  lib/server/authz.ts    Rollen und Rechte
  lib/session.ts         signiertes Sitzungs-Cookie
  routes/                Seiten und API-Routen (api/generieren, api/korrigieren, api/pdf …)
schema/snapshot.json     Datenmodell von Directus – die Quelle, Directus folgt ihr
scripts/                 Datenmodell, Einmal-Migrationen, Löschfristen, Backups
docs/                    Konzept, Spezifikation, Backlog, Betrieb
```

Kein Route-Handler spricht Directus direkt an; alles läuft über `src/lib/server/repo/*`. Die
übrigen harten Regeln – etwa zu IDs aus Anfragen, Filtern mit leeren Werten und Cookies – stehen
in [`CLAUDE.md`](CLAUDE.md).

## Dokumentation

- [`CLAUDE.md`](CLAUDE.md) – Arbeitsregeln und aktueller Stand
- [`docs/klassen-freigabe-konzept.md`](docs/klassen-freigabe-konzept.md) – rechtlicher Rahmen,
  Rollenmodell, Umsetzungsplan
- [`docs/spec-gruppen-rollen-einwilligung.md`](docs/spec-gruppen-rollen-einwilligung.md) –
  Spezifikation für Gruppen, Rollen und Einwilligung
- [`docs/migrationen.md`](docs/migrationen.md) – wie sich das Datenmodell ändert, mit Protokoll
- [`docs/backup-und-restore.md`](docs/backup-und-restore.md) – Sicherung, Wiederherstellung,
  lokale Probeumgebung
- [`docs/backlog.md`](docs/backlog.md) – offene und erledigte kleinere Punkte

## Betrieb

Coolify baut die App bei jedem Push auf `main` mit Nixpacks (`nixpacks.toml`) und startet sie
neu. Änderungen am Datenmodell kommen nicht mit dem Deploy, sondern über `schema:apply` –
vorher Backup und ein Probelauf gegen eine wiederhergestellte Kopie
([`docs/migrationen.md`](docs/migrationen.md)).
