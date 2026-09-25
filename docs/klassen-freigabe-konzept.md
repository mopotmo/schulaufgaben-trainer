# Klassen-Freigabe: Rechtliches Minimum, Rollenmodell, Umsetzungsplan

Stand: 20.09.2026 · Ziel: Trainer für Klassenkameradinnen öffnen, ohne rechtlich auf dünnes Eis zu geraten.
Umsetzungs-Spec dazu: `docs/spec-gruppen-rollen-einwilligung.md`

> Kein Rechtsrat. Orientierung für ein kleines, kostenloses Privatprojekt. Die Texte für Impressum und
> Datenschutzerklärung mit Mustern gegenprüfen; ein kurzer Check bei einem Fachanwalt IT-Recht wäre die
> sicherste Variante, für diese Größenordnung aber wahrscheinlich Overkill.

---

## 1. Ist-Stand (geprüft am 20.09.2026)

| Bereich | Stand |
|---|---|
| Directus | `families`, `profiles`, `exercises`, `corrections`, `books`, `feedback`, `feature_requests`, `learner_insights`, `logs` — **kein `groups`, kein `memberships`, kein `consents`** |
| Repo | SvelteKit, Routen: `login`, `einrichten`, `generieren`, `loesen`, `korrigieren`, `historie`, `buecher`, `einstellungen` — **keine Rechtsseiten** |
| Session | `src/lib/session.ts`, gruppenbasiert (Familie), Login via Slug + Passwort-Hash |
| Klassen-Feature | konzipiert, **nicht umgesetzt** |
| Hosting | Hetzner, Standort Nürnberg (EU) |
| KI-VO | Transparenzpflichten seit 02.08.2026 anwendbar — siehe §3.8 |

Offen ist alles, was im Frühjahr geplant war: `families` → `groups` mit `type`, Session-Refactor auf
profilbasiert (inkl. Null-Gleichheits-Bug), Klassenbeitritt.

**Dazugekommen bei der Code-Analyse:** eine Berechtigungslücke (IDOR) in den API-Routen — `profilId`
wird ungeprüft aus dem Formular übernommen. Details und Fix in der Spec, §1. Kritischster Punkt vor
der Freigabe.

## 2. Grundentscheidungen

1. **Keine Lehrer-Rolle im ersten Release** — nur im Datenmodell vorgesehen. Sobald Lehrkräfte
   dienstlich Schülerdaten in einem Tool verarbeiten, greift Schulrecht (Bayern: Freigabe durch
   Schule/Kultusministerium, ggf. AVV mit der Schule als Verantwortlicher).
2. **Onboarding hybrid** — Familien werden manuell angelegt, aber beim ersten Login bestätigt ein
   Elternteil die Einwilligung im System. Nachweis liegt in der DB.
3. **Mandantenfähigkeit nur vorbereitet, nicht gebaut** — vier billige Vorkehrungen (§5), echte
   Trennung erst wenn ein zweiter Mandant real existiert.

---

## 3. Rechtliches Minimum

### 3.1 Impressum

Pflicht nach § 5 DDG (löste 2024 das TMG ab) besteht für *geschäftsmäßige, in der Regel gegen Entgelt
angebotene* digitale Dienste. Das Projekt ist kostenlos und privat — streng genommen also **nicht**
impressumspflichtig. Aber „geschäftsmäßig" wird weit ausgelegt (nachhaltige Tätigkeit,
Gewinnerzielungsabsicht nicht nötig) und die Abgrenzung ist unsicher.

**Entscheidung: Impressum wird gemacht.** Inhalt (Minimum für Privatperson):

- Vor- und Nachname
- Ladungsfähige Anschrift (Privatadresse, kein Postfach, keine reine c/o-Adresse)
- E-Mail-Adresse
- Telefon nicht zwingend, wenn ein zweiter schneller Kontaktweg vorhanden ist
- Kein Handelsregister, keine USt-ID, keine Aufsichtsbehörde

Die Seite liegt komplett hinter Login; öffentlich sichtbar ist nur die Login-Seite. Impressumslink
dort platzieren, Suchmaschinen per `robots.txt` + `noindex` aussperren.

### 3.2 Datenschutzerklärung

Die Haushaltsausnahme (Art. 2 Abs. 2 lit. c DSGVO) greift nur bei rein persönlicher/familiärer
Tätigkeit. Sobald fremde Kinder drin sind, besteht Verantwortlichkeit im Sinne der DSGVO und damit
die Informationspflicht nach Art. 13.

Muss rein:

- **Verantwortlicher** namentlich + Kontakt (Verweis aufs Impressum reicht)
- **Zwecke**: Erzeugung von Übungsaufgaben, KI-gestützte Korrektur, Fortschrittsanzeige
- **Rechtsgrundlage**: Einwilligung, Art. 6 Abs. 1 lit. a i. V. m. Art. 8 DSGVO
- **Datenkategorien**: Anzeigename des Kindes, Schulart, Jahrgangsstufe, Bundesland,
  Fach/Thema/Lehrerhinweise, hochgeladene Fotos und PDFs der Lösungen, generierte Aufgaben,
  Korrekturtexte, technische Logs
- **Empfänger**: Anthropic (Auftragsverarbeiter, KI-Generierung und Korrektur),
  Hetzner Online GmbH (Hosting, Rechenzentrum Nürnberg)
- **Drittlandübermittlung** USA an Anthropic: Standardvertragsklauseln + DPA; Hinweis, dass
  API-Daten nicht zum Modelltraining verwendet werden. Hetzner ist EU — kein Drittlandthema.
- **Hinweis auf die Websuche**: `/api/generieren` nutzt das Web-Search-Tool der Anthropic-API.
  Thema und Lehrerhinweise können in Suchanfragen einfließen.
- **Speicherdauer**: hochgeladene Dateien 30 Tage, Korrekturen bis zur Kontolöschung
- **Betroffenenrechte**: Auskunft, Berichtigung, Löschung, Widerruf der Einwilligung, Beschwerde
  bei der Aufsichtsbehörde (Bayern, nicht-öffentlicher Bereich: BayLDA Ansbach)
- **Keine automatisierte Entscheidung mit rechtlicher Wirkung** — explizit hinschreiben
- Kein Datenschutzbeauftragter nötig (weit unter 20 Personen, keine umfangreiche Verarbeitung
  besonderer Kategorien)

### 3.3 Einwilligung der Eltern

Deutschland hat die Altersgrenze aus Art. 8 DSGVO **nicht abgesenkt**: Für Kinder unter 16 ist die
Einwilligung der Sorgeberechtigten nötig.

Umsetzung als Consent-Gate beim ersten Login (Details in der Spec, §7):

```
consents
  id                uuid
  group_id          → groups            (die Familie)
  type              'privacy' | 'terms'
  version           '2026-09-v1'        (Textversion, damit Änderungen nachvollziehbar sind)
  granted_at        timestamp
  granted_by_name   string              (Name des Elternteils)
  granted_by_email  string              (Kontakt für Widerruf/Löschanfragen)
  revoked_at        timestamp nullable
```

Screen beim ersten Login, blockierend:

- „Ich bin sorgeberechtigt für die unten aufgeführten Kinder." (Pflicht-Checkbox)
- „Ich habe die Datenschutzerklärung gelesen und willige in die beschriebene Verarbeitung ein."
  (Pflicht-Checkbox, nicht vorangekreuzt)
- Name + E-Mail des Elternteils
- Beide Dokumente verlinkt

**Bekannte Schwäche:** Ohne E-Mail-Verifikation ist nicht beweisbar, dass ein Elternteil geklickt
hat. Für einen Klassenversuch mit persönlich bekannten Familien und persönlich übergebenen
Zugangsdaten vertretbar. Sobald es darüber hinausgeht: Double-Opt-In nachrüsten (Stufe 2).

**Nachtrag 25.09.2026 — Double-Opt-In vorgezogen.** Neue Familien richten Passwort, E-Mail
und Einwilligung in einem Schritt über den Einladungslink ein (`/einrichten`) und kommen erst
nach dem Klick auf einen Bestätigungslink in die App. Versand über einen Directus-Flow
(Event-Hook auf `email_tokens`), SMTP bei netcup. Dieselbe Infrastruktur trägt „Passwort
vergessen". Die drei Bestandsfamilien gelten als bestätigt. Einrichtung:
`scripts/email-verification.ts`; `CONSENT_VERSION` auf `2026-09-v2`.

**Widerruf** muss so einfach sein wie die Erteilung. Zunächst Hinweistext mit Kontaktadresse und
Zusage einer Löschung binnen weniger Tage; später Button im Eltern-Bereich.

### 3.4 Auftragsverarbeitung

- **Anthropic**: DPA in der Console unterzeichnen, PDF ablegen. Zero-Data-Retention prüfen.
- **Hetzner**: AVV elektronisch über Cloud Console bzw. Robot abschließen, PDF ablegen.
  Standort Nürnberg in der Datenschutzerklärung nennen.
- **Directus** wird selbst betrieben → kein eigener AVV.

### 3.5 Datenminimierung

- Kinderprofile nur mit **Vorname oder Spitzname**. Kein Nachname, kein Geburtsdatum.
  Hinweistext direkt am Eingabefeld.
- Klasse nur als interner Code, **nicht** Schulname + Klasse im Klartext.
- **Hochgeladene Lösungsfotos nach 30 Tagen automatisch löschen** (Directus Flow oder Cronjob).
  Sensibelste Datenkategorie — Handschrift, oft Name auf dem Blatt.
- Korrekturtexte bleiben (Fortschritt), Uploads nicht.
- **Keine Analytics, keine externen Fonts, kein CDN.**
- **Nur technisch notwendiges Session-Cookie** → kein Cookie-Banner nach § 25 TDDDG nötig.
  Diesen Zustand aktiv halten.

### 3.6 Hochgeladene Schulbücher

Ein hochgeladenes Schulbuch ist eine im Wesentlichen vollständige Vervielfältigung und fällt
daher nicht unter die Privatkopie-Ausnahme (§ 53 Abs. 4 lit. b UrhG). Vertretbar ist das
Hochladen nur, wenn das Buch dem nutzenden Haushalt gehört und ausschließlich dort verwendet
wird. Entschieden (Review 22.09.2026, Frist 25.09.2026):

- **Keine Weitergabe, auch nicht innerhalb der App.** Der Freigabepfad über
  `visibility: 'shared'` ist entfernt; Bücher sind nur für die eigene Gruppe sichtbar
  (`repo/books.ts`). Der Generierungs-Prompt verlangt eigene Aufgaben und verbietet, Aufgabentexte,
  Zahlenbeispiele oder Formulierungen wörtlich zu übernehmen (`api/generieren`).
- **Hinweis am Upload-Formular** (`/buecher`, an die Schüler gerichtet, „du") und
  **Abschnitt in den Nutzungsbedingungen** (an die Eltern, „Sie"): nur eigene Bücher, nur für
  den eigenen Haushalt, keine Weitergabe.
- **Löschfrist: 90 Tage ohne Nutzung, spätestens zum Schuljahresende (31.08.).** Ein Buch
  soll für die Dauer eines Kapitels bzw. Schuljahres dienen, nicht als dauerhafte Ablage. Eine
  feste Frist ab Upload (z. B. 30 Tage) wurde verworfen: Sie löscht mitten im Kapitel und
  führt zu wiederholtem Hochladen — also zu mehr Kopien, nicht weniger. „Nutzung" heißt: das
  Buch war Quelle einer Generierung. Dafür braucht `books` ein Feld `last_used_at`. Gelöschte
  Bücher liegen bis zu 30 Tage in den Backups; das steht so in den Nutzungsbedingungen.
- Umgesetzt wird die Löschung im selben Directus-Flow wie die Lösungsfotos (§3.5). Bis dahin
  ist die Zusage in den Texten nicht eingelöst — siehe `backlog.md`.

Die Nutzungsbedingungen wurden ohne Versionssprung geändert (`CONSENT_VERSION` bleibt
`2026-09-v2`): Zum Zeitpunkt der Änderung gab es noch keine aktiv nutzenden fremden Familien.

### 3.7 Nutzungsbedingungen (eine kurze Seite)

- Privates, kostenloses Angebot, **kein Zusammenhang mit der Schule**, keine Leistungsbewertung
- Keine Gewähr für Verfügbarkeit; kann jederzeit eingestellt werden (dann Datenlöschung)
- **KI-Korrekturen können falsch sein** — Eltern sollen gegenlesen
- Ergebnisse werden nicht an die Schule oder Dritte weitergegeben
- Zugang nur für eingeladene Familien, Zugangsdaten nicht weitergeben

### 3.8 KI-Verordnung (EU 2024/1689)

Nachgetragen am 22.09.2026 — im ursprünglichen Konzept fehlte die KI-VO komplett.

Die Transparenzpflichten aus **Art. 50** gelten seit dem **2. August 2026**. Rund um die
Anwendbarkeitstermine gab es zuletzt Diskussionen über Verschiebungen einzelner Teile; der
Stand gehört beim Anwaltstermin gegengeprüft.

**Art. 50 Abs. 1 — Interaktion erkennbar machen.** Wer mit einem KI-System interagiert, muss
das erkennen können, sofern es nicht offensichtlich ist. Der Rückfragen-Chat ist der
Musterfall, und „offensichtlich" trägt hier schlecht: Die Nutzenden sind Kinder, und die
Oberfläche nennt das Gegenüber „Trainer".

*Umgesetzt:* Hinweise an neun Stellen in der Oberfläche (Aufgaben, Korrekturen, Chat,
Historie), dazu eine Fußzeile im PDF und ein eigener Abschnitt in den Nutzungsbedingungen.
Die Hinweise nennen bewusst kein Modell und keinen Anbieter — die Konvention, in der
Oberfläche nicht von „Claude" zu sprechen, bleibt bestehen. Der Modellname muss nicht fallen,
das Wort KI schon.

**Art. 50 Abs. 2 — Kennzeichnung synthetischer Inhalte.** Zielt vor allem auf veröffentlichte
Inhalte und Deepfakes. Für eine geschlossene App mit ausgedruckten Übungsblättern ist die
praktische Relevanz gering; die PDF-Fußzeile deckt den Gedanken ab, weil das Blatt die App
verlässt.

**Art. 4 — KI-Kompetenz.** Verlangt, dass die Beteiligten verstehen, womit sie es zu tun
haben. Der Einwilligungsschirm und der neue Abschnitt in den Nutzungsbedingungen decken das
für Eltern ab.

**Offen: Anhang III Nr. 3 Buchst. b — Hochrisiko?** Die Vorschrift erfasst KI-Systeme, die
„zur Bewertung von Lernergebnissen verwendet werden sollen, auch wenn diese Ergebnisse dazu
dienen, den Lernprozess zu steuern". Die App korrigiert Lösungen, schätzt Noten und speist
`learner_insights` in die Auswahl der nächsten Aufgaben zurück — das ist fast wörtlich der
Tatbestand.

Dagegen spricht:

- Anhang III Nr. 3 zielt auf Einrichtungen der allgemeinen und beruflichen Bildung. Dieses
  Angebot steht ausdrücklich in keinem Zusammenhang mit einer Schule und hat keine
  schulische Wirkung (§3.7).
- Art. 6 Abs. 3 nimmt Systeme aus, die kein erhebliches Risiko für Gesundheit, Sicherheit
  oder Grundrechte bergen.
- Art. 2 Abs. 10 nimmt rein persönliche, nicht-berufliche Nutzung aus — dieselbe Frage wie
  bei der DSGVO-Haushaltsausnahme, die wir für uns bereits verneint haben, seit fremde
  Kinder Zugang haben (§3.2). Die Antwort dürfte hier dieselbe sein.

Das ist keine Frage, die man im Code entscheidet. **Gehört in den Fachanwalt-Check**, den
dieses Konzept ohnehin als sicherste Variante nennt.

### 3.9 Interne Doku

- **Verzeichnis von Verarbeitungstätigkeiten** (Art. 30): eine Seite
- **TOM** (Art. 32): HTTPS/TLS, Passwort-Hashing (bcrypt), Zugriff nur Admin, verschlüsselte
  Backups, keine Produktionsdaten lokal, Rate-Limiting am Login

### 3.10 Bewusste Nicht-Ziele

- Keine Lehrer-Rolle ausliefern
- Nicht öffentlich bewerben, kein offenes Registrierungsformular, `noindex`
- Kein Schullogo, kein Schulname im Branding
- **Kein Geld nehmen** — sobald Entgelt fließt: Gewerbe, volle Impressumspflicht, Verbraucherrecht
- Keine Chat- oder Kommentarfunktion zwischen Kindern — das erzeugt Moderationspflichten

---

## 4. Rollen- und Gruppenmodell

Kernidee: **Identität, Gruppe und Rolle trennen.** Heute ist das vermischt (Familie = Login = Kontext).
Vollständiges Zielmodell mit allen Feldern in der Spec, §3.

```
groups        id, type('family'|'class'|'school'), name, slug,
              parent_group(self-FK), tenant, password_hash,
              invite_token, invite_code, status
profiles      id, group_id, kind('learner'|'adult'),
              name, school_type, grade, state, avatar
memberships   id, profile_id, group_id,
              role('owner'|'parent'|'learner'|'teacher'|'admin'), status
consents      siehe 3.3
```

**Warum `memberships` jetzt schon:** Ohne diese Tabelle ist ein Profil an genau eine Gruppe gebunden.
Mit ihr kann ein Kind gleichzeitig in Familie *und* Klasse sein, eine Lehrkraft später in mehreren
Klassen. Die eine Stelle, an der Vorbauen billiger ist als Nachrüsten.

| Rolle | aktiv? | darf |
|---|---|---|
| `learner` | ja | eigene Aufgaben generieren, eigene Korrekturen und Historie sehen |
| `parent` / `owner` | ja | alles der eigenen Familie: Profile verwalten, Einwilligung, Löschung |
| `teacher` | später | Themen/Vorlagen für eine Klasse — **keine** Schülerergebnisse |
| `admin` | ja (nur Betreiber) | alles, ausschließlich über Directus, keine UI |

Technische Umsetzung an einem Ort:

```
src/lib/server/authz.ts
  can(actor, action): boolean               -- eine Matrix, kein verstreutes if
  assertInScope(actor, resourceGroupId)     -- wirft 403
src/lib/server/repo/*.ts
  jede Funktion nimmt actor als erstes Argument
```

**Session-Refactor:** von gruppenbasiert auf profilbasiert, `kind: 'family' | 'profile'`, signierter
Payload statt signierter ID, Ablauf und Versionierung im Cookie. Der Null-Gleichheits-Bug verschwindet
dabei strukturell, weil `profiles.group_id` nach der Migration `NOT NULL` ist.

---

## 5. Mandantenfähigkeit: die vier billigen Vorkehrungen

1. `groups.parent_group` — Hierarchie Familie → Klasse → Schule möglich
2. `groups.tenant` (String, default `'default'`)
3. Repository-Layer als einzige Directus-Zugriffsstelle → späterer Injektionspunkt für einen
   Mandantenfilter
4. Projektname, Kontakt und Impressumsdaten aus `src/lib/config.ts` statt hartkodiert

Mehr nicht.

---

## 6. Umsetzungsplan

### Stufe 0 — muss vor der ersten fremden Anmeldung stehen

| # | Aufgabe | Aufwand |
|---|---|---|
| 1 | Seiten `/impressum`, `/datenschutz`, `/nutzungsbedingungen` + Links, auch auf der Login-Seite | S |
| 2 | `consents`-Collection + blockierendes Consent-Gate beim ersten Login | M |
| 3 | Profilname auf Vorname/Spitzname umstellen, Hinweistext, Bestandsdaten bereinigen | S |
| 4 | Auto-Löschung der Upload-Dateien nach 30 Tagen (Directus Flow); Schulbücher 90 Tage ohne Nutzung, spätestens 31.08. (§3.6) | M |
| 5 | Audit: externe Fonts/CDN/Analytics raus, nur Session-Cookie, `robots.txt` + `noindex` | S |
| 6 | AVV Anthropic + AVV Hetzner abschließen und ablegen | S |
| 7 | VVT + TOM als internes Dokument | S |
| 8 | Login härten: nicht erratbare Slugs/Codes, Rate-Limiting | S |

### Stufe 1 — der Refactor (Spec liegt vor)

| # | Aufgabe | Aufwand |
|---|---|---|
| 9 | **IDOR-Fix**: Ownership-Prüfung in allen API-Routen | M |
| 10 | `families` → `groups` mit `type`, `parent_group`, `tenant` (Migration) | M |
| 11 | `memberships` einführen, bestehende Profile migrieren | M |
| 12 | Session-Refactor: profilbasiert, signierter Payload, Ablauf | M |
| 13 | `authz.ts` + Repository-Layer | M |
| 14 | Klassenbeitritt über Einladungscode | M |

### Stufe 2 — nach dem Start

- Self-Service-Registrierung (Double-Opt-In ist seit 25.09.2026 umgesetzt, §3.3)
- Eltern-Bereich „Meine Daten ansehen / alles löschen"
- Aktivitäts-Feed für die Klasse — nur Opt-in, nur Vornamen
- Lehrer-Rolle, erst mit Freigabe durch die Schule

**Reihenfolge:** Stufe 1 zuerst (9–13), dann Stufe 0 draufsetzen (1–8), dann freigeben. Das
Consent-Gate an eine Datenstruktur zu hängen, die zwei Tage später umbenannt wird, ist doppelte
Arbeit. Die Rechtstexte (1) hängen an keiner Tabelle und können parallel entstehen.

---

## 7. Geklärt / offen

**Geklärt:**

- Hosting: Hetzner, Nürnberg
- Impressum mit Privatadresse: ok
- Aufbewahrungsdauer Uploads: 30 Tage
- Keine Lehrer-Rolle im ersten Release
- Onboarding: manuell angelegt + Einwilligung beim ersten Login
- KI-Transparenzhinweise nach Art. 50 KI-VO: umgesetzt am 22.09.2026 (§3.8)
- Die drei technischen Detailfragen am Ende der Spec sind am 20.09.2026 entschieden:
  keine Eltern-Profile in Stufe 1, kein Klassenbeitritt in Stufe 1, Migration als Node-Skript.
  Begründungen in der Spec, §10.
- Reihenfolge korrigiert: erst der IDOR-Hotfix (erledigt), dann Stufe 1, dann Stufe 0.
  Grund: es sind bereits drei Familien im System, nicht eine — siehe Spec §1.

**Offen:**

- Stufe 1 ab Aufgabe 10 (Datenmodell, Session, Repo-Layer) und Stufe 0 vollständig
- **KI-VO, Anhang III Nr. 3 Buchst. b**: Ist die Korrektur- und Notenfunktion eine
  „Bewertung von Lernergebnissen"? Argumente in §3.8. Für den Anwaltstermin.
