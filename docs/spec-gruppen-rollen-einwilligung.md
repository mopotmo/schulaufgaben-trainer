# Implementierungs-Spec: Gruppen, Rollen, Einwilligung

Repo: `mopotmo/schulaufgaben-trainer` (SvelteKit + Directus).
Stand der Analyse: 20.09.2026, Branch `main`.
Vorgelagertes Konzept: `docs/klassen-freigabe-konzept.md`

**Bevor du loslegst:** Stell Rückfragen, wenn etwas unklar ist oder du im Code auf Abweichungen zu
dieser Spec stößt. Nicht raten, nicht stillschweigend anders lösen. Die Fragen in §10 will ich in
jedem Fall beantwortet haben.

---

## 0. Ziel und Nicht-Ziele

**Ziel:** Die App so umbauen, dass sie sicher für Familien außerhalb des eigenen Haushalts geöffnet
werden kann — mit Gruppen-/Rollenmodell, harter Trennung auf Query-Ebene und dokumentierter
Einwilligung.

**Nicht-Ziele in diesem Durchgang:**

- Lehrer-Rolle als UI (nur im Datenmodell vorsehen)
- Self-Service-Registrierung, E-Mail-Versand, Double-Opt-In — *Nachtrag 25.09.2026:
  E-Mail-Versand und Double-Opt-In sind vorgezogen, siehe Konzept §3.3. Self-Service bleibt
  draußen: Familien legt weiterhin nur der Betreiber in Directus an.*
- Echte Mandantenfähigkeit (nur die Vorkehrungen, §6)
- Aktivitäts-/Präsenz-Feed

---

## 1. Kritischer Befund — bitte zuerst lesen

Beim Durchsehen des Codes ist eine **Berechtigungslücke (IDOR)** aufgefallen.

`src/routes/api/generieren/+server.ts` nimmt `profilId` aus dem Formular und macht direkt:

```ts
const profile = await directus.request(readItem('profiles', profilId));
```

**Ohne Prüfung, ob dieses Profil zur eingeloggten Familie gehört.** Jede eingeloggte Familie kann mit
einer fremden Profil-ID Aufgaben generieren und über `profile.school_type`, `profile.state`,
`profile.grade` Daten fremder Kinder auslesen.

> **Korrektur vom 20.09.2026:** Der ursprüngliche Satz „Solange nur eine Familie Zugang hat,
> folgenlos" stimmt nicht. In `families` stehen seit dem 13.06.2026 **drei** Familien — Robledo,
> Beyer und Bartels — mit eigenen Profilen und Aufgaben. Zwei Haushalte außerhalb des eigenen sind
> also bereits drauf. Die Lücke war offen, nicht bevorstehend. Deshalb §10.4: erst Hotfix, dann
> Refactor.

**Zu prüfen und zu fixen in allen API-Routen** (`chat`, `feedback`, `folgefrage`, `generieren`,
`korrigieren`, `nachschaerfen`, `note`, `pdf`) sowie in den Load-Funktionen von `historie`, `loesen`,
`korrigieren`, `einstellungen`, `buecher`. Überall, wo eine ID aus Request-Daten kommt, muss gegen den
Session-Scope geprüft werden.

Positiv: `canAccessBook(storedBook, locals.familyId)` macht es in `generieren` für Bücher bereits
richtig. Genau dieses Muster braucht es überall — aber zentral, nicht per Hand pro Route.

**Priorität: Dieser Fix ist wichtiger als das saubere Datenmodell.** Wenn die Zeit knapp wird, zuerst
§4 (authz + repo), dann der Rest.

**Stand 20.09.2026 — Hotfix umgesetzt.** Alle acht API-Routen und alle Load-Funktionen prüfen den
Scope über `src/lib/server/scope.ts`; Abnahmekriterium §8.1 ist erfüllt (Familie A → Ressource von
Familie B ⇒ 403, ohne Session ⇒ 401). Drei Befunde aus der Code-Analyse gingen über diese Spec
hinaus und sind mit erledigt:

- Die Lücke war auch **schreibend** — `api/chat` überschrieb fremde `generated_content`,
  `korrigieren` und `nachschaerfen` schrieben unter fremdem `profile_id`.
- `api/feedback` stand in `PUBLIC_PATHS` und nahm `profileId` und `refId` ungeprüft entgegen:
  ohne Login ließ sich damit über `upsertInsight` der Lernstand eines beliebigen Kindes
  überschreiben — der später in den Generierungs-Prompt einfließt.
- `marked`-Ausgabe ging ohne Sanitizing in `{@html}`; zusammen mit dem Schreibzugriff ergab das
  Stored XSS über Familiengrenzen. Behoben in `src/lib/renderMarkdown.ts`.

`src/lib/server/scope.ts` ist die Vorstufe von §4 und geht in `authz.ts` + `repo/*` auf. **Noch
offen bleibt harte Regel 1:** `getDirectus()` steht weiterhin in Route-Handlern.

---

## 2. Ist-Stand

```
Directus:  families, profiles, exercises, corrections, books,
           feedback, feature_requests, learner_insights, logs

families:  id(uuid,pk) name slug(unique) email password_hash
           invite_token created_at
profiles:  id(uuid,pk) name school_type grade state
           family_id(uuid, NULLABLE) avatar
books:     … owner_family(nullable) visibility('family'|'shared')
exercises: … profile_id   (kein family_id!)
```

Session (`src/lib/session.ts`): Cookie `session = <familyId>.<hmac(familyId)>`.
Hook (`src/hooks.server.ts`): setzt `event.locals.familyId`, redirectet auf `/login` außer bei
`PUBLIC_PATHS = ['/login','/einrichten','/api/feedback']`.

Drei Schwächen der aktuellen Session:

1. Signiert wird nur die ID — kein Ausstellungszeitpunkt, keine Version. Ein einmal ausgestelltes
   Cookie ist **unbegrenzt gültig** und nicht widerrufbar.
2. `sig !== expected` ist ein nicht-konstantzeitiger Vergleich.
3. `locals.familyId` ist `string | null`, wird aber überall mit `!` durchgereicht. In Kombination mit
   dem **nullable** `profiles.family_id` ist das der Null-Guard-Bug: ein Filter
   `{ family_id: { _eq: null } }` matcht in Directus alle Zeilen mit `family_id = null` statt keiner.

---

## 3. Zielmodell (Directus)

### 3.1 Neue Collection `groups`

| Feld | Typ | Anmerkung |
|---|---|---|
| `id` | uuid, pk | |
| `type` | string | `'family' \| 'class' \| 'school'` — Dropdown, erweiterbar |
| `name` | string, not null | Anzeigename |
| `slug` | string, unique, not null | Login-/URL-Namespace über alle Typen hinweg |
| `parent_group` | uuid, nullable, FK → groups.id | Hierarchie, vorerst ungenutzt |
| `tenant` | string, not null, default `'default'` | Vorkehrung, vorerst ungenutzt |
| `email` | string, nullable | wie bisher |
| `password_hash` | text, nullable | nur bei `type='family'` |
| `invite_token` | uuid, nullable | Einrichtungslink Familie |
| `invite_code` | string, nullable | Beitrittscode Klasse |
| `status` | string, default `'active'` | `'active' \| 'archived'` |
| `created_at` | timestamp | `date-created` |

### 3.2 Neue Collection `memberships`

| Feld | Typ | Anmerkung |
|---|---|---|
| `id` | uuid, pk | |
| `profile_id` | uuid, **not null**, FK → profiles.id | |
| `group_id` | uuid, **not null**, FK → groups.id | |
| `role` | string, not null | `'owner' \| 'parent' \| 'learner' \| 'teacher' \| 'admin'` |
| `status` | string, default `'active'` | `'active' \| 'pending' \| 'removed'` |
| `joined_at` | timestamp | `date-created` |

Unique-Constraint auf (`profile_id`, `group_id`, `role`).

### 3.3 Neue Collection `consents`

| Feld | Typ | Anmerkung |
|---|---|---|
| `id` | uuid, pk | |
| `group_id` | uuid, **not null**, FK → groups.id | die Familie |
| `type` | string, not null | `'privacy' \| 'terms'` |
| `version` | string, not null | z. B. `'2026-09-v1'` |
| `granted_at` | timestamp, not null | |
| `granted_by_name` | string, not null | Name des Elternteils |
| `granted_by_email` | string, not null | Kontakt für Widerruf |
| `revoked_at` | timestamp, nullable | |

### 3.4 Änderungen an bestehenden Collections

- `profiles.group_id` (uuid, **not null** nach Migration, FK → groups.id) ersetzt `family_id`
- `profiles.kind` (string, default `'learner'`): `'learner' \| 'adult'`
- `books.owner_group` ersetzt `books.owner_family`
- `exercises`, `corrections`, `feedback`, `learner_insights` bleiben unverändert — Scope läuft über
  `profile_id` → `profiles.group_id`

---

## 4. Der Kern: `authz.ts` + Repository-Layer

Ziel: **Kein Route-Handler baut mehr selbst Directus-Filter oder ruft `getDirectus()` direkt auf.**

### 4.1 `src/lib/server/authz.ts` (neu)

```ts
export type Role = 'owner' | 'parent' | 'learner' | 'teacher' | 'admin';

export type Session =
  | { kind: 'family'; groupId: string }
  | { kind: 'profile'; groupId: string; profileId: string };

/** Session + aufgelöste Mitgliedschaften. Wird einmal pro Request im Hook gebaut. */
export type Actor = {
  session: Session;
  /** alle group_ids, auf die der Actor zugreifen darf */
  groupIds: string[];
  roles: Role[];
};

export type Action =
  | 'profile:read' | 'profile:create' | 'profile:update' | 'profile:delete'
  | 'exercise:read' | 'exercise:create'
  | 'correction:read' | 'correction:create'
  | 'book:read' | 'book:create'
  | 'insight:read'
  | 'group:manage'
  | 'consent:grant';

export function can(actor: Actor, action: Action): boolean;

/** wirft error(403) statt false zurückzugeben */
export function assertCan(actor: Actor, action: Action): void;

/** wirft error(403), wenn die Ressource nicht im Scope des Actors liegt */
export function assertInScope(actor: Actor, resourceGroupId: string | null): void;
```

**Rollen-Matrix (Stufe 1):**

| Action | `learner` | `parent`/`owner` | `teacher` (inaktiv) | `admin` |
|---|:-:|:-:|:-:|:-:|
| `profile:read` | eigenes | alle der Gruppe | – | alle |
| `profile:create/update/delete` | – | ja | – | ja |
| `exercise:read/create` | eigenes | alle der Gruppe | – | alle |
| `correction:read/create` | eigenes | alle der Gruppe | – | alle |
| `insight:read` | eigenes | alle der Gruppe | – | alle |
| `book:read` | Gruppe + shared | Gruppe + shared | Gruppe | alle |
| `group:manage` | – | eigene Gruppe | – | ja |
| `consent:grant` | – | ja | – | – |

`teacher` steht in der Matrix, wird in Stufe 1 aber nirgends vergeben. `admin` läuft ausschließlich
über Directus, keine App-UI.

**Null-Guard:**

```ts
function requireId(id: string | null | undefined): string {
  if (!id || typeof id !== 'string') error(401, 'Keine gültige Sitzung');
  return id;
}
```

Harte Regel: **Nie einen Directus-Filter aus einem möglicherweise null-wertigen Wert bauen.**
`{ _eq: null }` matcht in Directus die NULL-Zeilen. Nach der Migration ist `profiles.group_id`
zusätzlich `NOT NULL`, damit die Falle strukturell verschwindet.

### 4.2 `src/lib/server/repo/*.ts` (neu)

Ein Modul pro Collection. Jede Funktion nimmt `actor` als erstes Argument und prüft Scope, bevor sie
Daten zurückgibt.

```ts
// src/lib/server/repo/profiles.ts
export async function listProfiles(actor: Actor): Promise<Profile[]>;
export async function getProfile(actor: Actor, profileId: string): Promise<Profile>; // 403 wenn fremd
export async function createProfile(actor: Actor, data: NewProfile): Promise<Profile>;

// src/lib/server/repo/exercises.ts
export async function getExercise(actor: Actor, id: string): Promise<Exercise>;
export async function createExercise(actor: Actor, profileId: string, data: NewExercise): Promise<Exercise>;
export async function listExercises(actor: Actor, profileId?: string): Promise<Exercise[]>;

// analog: corrections.ts, books.ts, insights.ts, groups.ts, consents.ts
```

Implementierungsregel für `getX`: erst laden, dann `assertInScope(actor, groupIdOfResource)`. Für
Ressourcen, die nur `profile_id` haben (exercises, corrections, insights, feedback), erst das Profil
auflösen und dessen `group_id` prüfen — am besten über ein pro Request gecachtes
`resolveProfileGroup(profileId)`.

`getDirectus()` wird **nur noch** aus `src/lib/server/repo/*` und `src/lib/server/directus.ts`
aufgerufen. Prüfen mit:

```sh
grep -rn "getDirectus" src/routes/   # muss leer sein
```

---

## 5. Session-Refactor

`src/lib/session.ts` neu schreiben:

```ts
type SessionPayload = {
  v: 1;                        // Schema-Version, Bump invalidiert alle Cookies
  kind: 'family' | 'profile';
  groupId: string;
  profileId?: string;
  iat: number;                 // Unix-Sekunden
};
```

- Cookie-Wert: `base64url(JSON.stringify(payload)) + '.' + hmac(dieser base64url-String)`
- **Signiert wird der komplette Payload**, nicht nur die ID
- Beim Lesen: Signatur prüfen → parsen → `v === 1` prüfen → `iat` gegen `MAX_AGE` prüfen → sonst `null`
- Signaturvergleich **konstantzeitig** (`crypto.timingSafeEqual`, vorher Längenprüfung)
- `setSession` / `getSession(): SessionPayload | null` / `clearSession`
- `switchProfile(cookies, profileId)` für den Wechsel `family` → `profile`

`src/app.d.ts`:

```ts
declare global {
  namespace App {
    interface Locals {
      actor: Actor | null;   // ersetzt familyId komplett
    }
  }
}
```

`src/hooks.server.ts`:

1. Session lesen → bei ungültigem Cookie: `clearSession` + weiter als anonym
2. `actor` bauen: `groupIds` und `roles` aus `memberships` laden (bei `kind='family'` gilt `parent`)
3. Public Paths erweitern:
   `['/login','/einrichten','/api/feedback','/impressum','/datenschutz','/nutzungsbedingungen','/logout']`
4. **Consent-Gate:** Wenn Actor vorhanden, Pfad nicht public und nicht `/einwilligung` → prüfen, ob
   für `actor.session.groupId` ein `consents`-Eintrag mit `type='privacy'`, aktueller `version` und
   `revoked_at IS NULL` existiert. Wenn nein → `redirect(303, '/einwilligung')`
5. Ergebnis der Consent-Prüfung pro Request cachen

`locals.familyId` ersatzlos streichen. Das ist die Gelegenheit, die IDOR-Lücken aus §1 gleich mit zu
schließen: überall, wo vorher `familyId!` stand, steht jetzt ein Repo-Aufruf mit `actor`.

---

## 6. Migration

Directus kann Collections nicht sauber umbenennen. Deshalb: neue Collection anlegen, Daten **unter
Beibehaltung der IDs** kopieren, umstellen, alt löschen. Weil die IDs gleich bleiben, müssen keine
Fremdschlüssel repariert werden.

1. **Backup der Postgres-DB.** Nicht optional. Hetzner-Snapshot zusätzlich.
2. `groups`, `memberships`, `consents` in Directus anlegen (§3.1–3.3)
3. Migrationsskript (`scripts/migrate-groups.ts`, einmalig, idempotent):
   - für jede Zeile in `families`: `groups`-Zeile mit **identischer id**, `type='family'`,
     `tenant='default'`, `status='active'`, Felder 1:1 übernehmen
   - `profiles.group_id` anlegen (zunächst nullable) und mit `family_id` befüllen
   - `profiles.kind = 'learner'` für alle bestehenden Profile
   - für jedes Profil: `memberships`-Zeile (`profile_id`, `group_id`, `role='learner'`,
     `status='active'`)
   - `books.owner_group` anlegen und aus `owner_family` befüllen
   - Verifikation ausgeben: Zeilenzahlen `families` vs. `groups`, Profile ohne `group_id`,
     Bücher ohne `owner_group`
4. Code umstellen (§4, §5) — `profiles.group_id` wird gelesen, `family_id` nicht mehr
5. Verifizieren: Abnahmekriterien §8
6. Erst danach: `profiles.group_id` auf `NOT NULL`, dann `profiles.family_id`, `books.owner_family`
   und `families` löschen — *erledigt 25.09.2026 mit `scripts/cleanup-families.ts`, vorher
   geprüftes Backup und Probelauf gegen die wiederhergestellte Kopie.*

**Nicht** per SQL-Rename direkt in Postgres — Directus' Metadaten (`directus_fields`,
`directus_relations`) laufen dann auseinander.

### Mandanten-Vorkehrungen (nur diese vier)

1. `groups.parent_group` vorhanden, ungenutzt
2. `groups.tenant` vorhanden, immer `'default'`
3. Repository-Layer als einzige Directus-Zugriffsstelle
4. Projektname, Kontakt und Impressumsdaten aus `src/lib/config.ts`

---

## 7. Consent-Gate (`/einwilligung`)

Neue Route, erreichbar nur mit gültiger Session, `kind='family'`.

- Zeigt die zu bestätigenden Punkte im Klartext, verlinkt `/datenschutz` und `/nutzungsbedingungen`
- Felder: Name des Elternteils (Pflicht), E-Mail (Pflicht), zwei Checkboxen — **nicht vorangekreuzt**:
  - „Ich bin sorgeberechtigt für die unten aufgeführten Kinder."
  - „Ich habe die Datenschutzerklärung gelesen und willige in die beschriebene Verarbeitung ein."
- Listet die Profile der Familie namentlich auf
- Beim Absenden: `consents`-Zeile mit `type='privacy'`, `version = CONSENT_VERSION`,
  `granted_at = now()`
- `CONSENT_VERSION` als Konstante in `src/lib/legal.ts`. Ein Bump zwingt alle Familien erneut durch
  das Gate — so gewollt, wenn sich die Datenschutzerklärung ändert.
- Widerruf: vorerst nur Hinweistext mit Kontaktadresse, kein Button

Ohne Einwilligung darf **keine** geschützte Seite und **keine** API-Route erreichbar sein. Das Gate
gehört in den Hook, nicht in einzelne Load-Funktionen.

---

## 8. Abnahmekriterien

1. **IDOR geschlossen:** Familie A schickt an `/api/generieren` eine `profilId` von Familie B → `403`.
   Gleiches für `korrigieren`, `chat`, `folgefrage`, `nachschaerfen`, `note`, `pdf` und alle
   Load-Funktionen, die IDs aus Params oder Forms nehmen.
2. `grep -rn "getDirectus" src/routes/` liefert nichts.
3. `grep -rn "familyId" src/` liefert nichts.
4. **Consent-Gate:** frische Familie ohne `consents`-Zeile → jede geschützte Route redirectet auf
   `/einwilligung`; API-Routen antworten `403`.
5. **Session:** Cookie mit manipulierter Signatur oder verändertem Payload → ausgeloggt, kein Crash.
   Cookie älter als `MAX_AGE` → ausgeloggt.
6. **Null-Guard:** kein Directus-Filter im Code, der einen möglicherweise null-wertigen Wert in `_eq`
   schreibt.
7. **Datenintegrität:** nach Migration sind alle bestehenden Profile, Aufgaben, Korrekturen und
   Bücher in der App unverändert sichtbar.
8. `npm run build` und `npm run check` laufen sauber durch.

---

## 9. Dateien, die voraussichtlich angefasst werden

```
neu:   src/lib/server/authz.ts
       src/lib/server/directus.ts          (umgezogen aus src/lib/directus.ts)
       src/lib/server/repo/{profiles,exercises,corrections,books,insights,groups,consents}.ts
       src/lib/legal.ts                    (CONSENT_VERSION)
       src/lib/config.ts                   (Projektname, Kontakt)
       src/routes/einwilligung/+page.svelte, +page.server.ts
       scripts/migrate-groups.ts

um:    src/lib/session.ts                  (komplett neu)
       src/hooks.server.ts                 (Actor + Consent-Gate)
       src/app.d.ts                        (locals.actor)
       src/lib/books.ts                    (canAccessBook → owner_group, Actor statt familyId)
       src/routes/+page.server.ts
       src/routes/{login,einrichten,einstellungen,historie,loesen,korrigieren,buecher}/**
       src/routes/api/{chat,feedback,folgefrage,generieren,korrigieren,nachschaerfen,note,pdf}/+server.ts
```

---

## 10. Offene Fragen — entschieden am 20.09.2026

Die Fragen bleiben samt Begründung stehen, damit nachvollziehbar ist, warum es so und nicht
anders gebaut wird.

### 10.1 Eltern-Profile

**Frage:** Sollen Eltern ein eigenes `profiles`-Objekt mit `kind='adult'` bekommen, oder bleibt
„Eltern" der Session-Typ `family` ohne eigenes Profil?

**Entscheidung: Session-Typ `family`, kein Eltern-Profil in Stufe 1.**

- Es gibt fünf Profile, alle Kinder. Ein Eltern-Profil erzeugt UI (Anlegen, Auswählen, Wechseln),
  ohne dass eine Funktion daran hängt.
- Der rechtlich relevante Nachweis „welcher Erwachsene hat eingewilligt" steht in
  `consents.granted_by_name` / `granted_by_email`, nicht in `profiles`.
- `profiles.kind` wird trotzdem jetzt angelegt (Default `'learner'`, §3.4). Stufe 2 ist dann eine
  Datenänderung, keine Migration.

**Folge für `memberships`:** `profile_id` ist **not null** (§3.2). Ohne Eltern-Profil kann eine
Zeile mit `role='parent'` deshalb nicht existieren — die Rolle ist nicht „vorerst ungenutzt",
sondern strukturell unmöglich. Daraus folgt verbindlich:

> `learner` kommt aus `memberships`. `parent` / `owner` wird aus `session.kind === 'family'`
> abgeleitet, an genau einer Stelle: beim Bauen des `Actor` in `authz.ts`. Sobald Eltern-Profile
> existieren, übernimmt `memberships` ohne Schemaänderung.

`memberships.profile_id` wird **nicht** nullable gemacht — das holte die NULL-Falle aus §4.1 zurück.

### 10.2 Klassenbeitritt

**Frage:** In diesen Durchgang rein, oder erst nachdem Gruppen und Rollen stehen?

**Entscheidung: raus aus Stufe 1, nur vorbereiten.**

Der Zweck „für Klassenkameradinnen öffnen" ist mit `type='family'` erfüllt — eine Gruppe pro
Familie. Eine Klassen-Gruppe fügt jeder Repo-Query eine zweite Scope-Dimension hinzu, bevor die
erste im Betrieb war. Dazu kommen ungeklärte Fragen: Wer sieht in einer Klasse was? Deckt die
Familien-Einwilligung die Klassen-Sichtbarkeit ab? (Nach Konzept §3.3 eher nicht — das wäre ein
eigener `consents`-Typ.)

Mitgebaut wird trotzdem, weil es später teuer wird:

- `groups.invite_code` als Spalte, ungenutzt (§3.1)
- `Actor.groupIds` konsequent als Array, auch wenn es in Stufe 1 immer genau ein Element hat —
  dann ändert der Klassenbeitritt später keine einzige Repo-Signatur
- die Rollen-Matrix so, dass `book:read` für `teacher` bereits ausdrückbar ist (§4.1)

### 10.3 Migration

**Frage:** Einmaliges Node-Skript gegen die Directus-REST-API oder ein Directus-Flow?

**Entscheidung: Node-Skript**, `scripts/migrate-groups.ts` wie in §6.

- Der Bestand ist winzig (3 Familien, 5 Profile, 17 Aufgaben, 0 Bücher) — Laufzeit in Sekunden.
- Das Skript liegt in git: reviewbar, diffbar, gegen ein wiederhergestelltes Backup wiederholbar.
  Ein Flow lebt nur in der DB und taucht in keinem Diff auf.
- Idempotenz lässt sich in Code ausdrücken und testen.
- Flows sind für Wiederkehrendes: die **30-Tage-Löschung der Uploads** (Konzept, Stufe 0 #4)
  gehört dorthin, die Migration nicht.

Zwei Auflagen: Das Skript bekommt einen `--dry`-Modus, und der erste echte Lauf geht gegen eine
wiederhergestellte Kopie des Backups, nicht gegen Produktion.

### 10.4 Reihenfolge

**Entscheidung: erst Hotfix, dann Refactor.** Begründung in §1.
