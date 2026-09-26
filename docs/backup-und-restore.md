# Backup und Wiederherstellung

Stand: 21.09.2026 · Erprobt an diesem Tag, die Befehle sind gelaufen und nicht geraten.

Pflicht vor jeder Migration (`CLAUDE.md`). Ein Backup gilt erst als Backup, wenn es
**zurückgespielt und gegengezählt** wurde — Schritt 5 ist nicht optional.

## Kurzweg: ein Aufruf

Seit 25.09.2026 erledigt `scripts/backup.sh` die Schritte 2–5 (und auf Wunsch 7) vom Mac aus:

```sh
scripts/backup.sh --probe
```

- findet den Postgres-Container über die Domain aus `DIRECTUS_URL` — auf dem Server laufen
  mehrere Directus-Stacks
- zieht den Dump per SSH direkt in `gpg`; Klartext landet weder auf dem Server noch lokal auf
  der Platte (strenger als Schritt 3/4 unten)
- stellt ihn in `trainer-restore` wieder her und zählt jede Tabelle gegen die Produktion
- `--probe` lässt Postgres (:55432) und Directus (:8055) für Migrations-Probeläufe stehen,
  `--uploads` sichert zusätzlich das Uploads-Volume, `--check` prüft nur ohne Dump

Voraussetzungen: SSH-Zugang als `groovemanager-coolify` ohne Passwortabfrage (sonst
`BACKUP_SERVER=…`), `gpg` und Docker lokal. Die Einzelschritte unten bleiben als Referenz und
für den Fall, dass das Skript scheitert.

**Der Directus-Container der Probe** (`trainer-directus`) wird nicht vom Skript angelegt, nur
gestartet. Er muss **dieselbe Version wie die Produktion** fahren — sonst laufen beim Start
Migrationen, und die Probe prüft etwas anderes als das, was in Produktion passiert. Einmalig:

```sh
docker network create trainer-net   # falls noch nicht vorhanden
docker run -d --name trainer-directus --network trainer-net -p 8055:8055 \
  -e DB_CLIENT=pg -e DB_HOST=trainer-restore -e DB_PORT=5432 -e DB_DATABASE=directus \
  -e DB_USER=postgres -e DB_PASSWORD=test -e KEY=probe -e SECRET=probe \
  -e CACHE_ENABLED=false -e TELEMETRY=false -e IP_TRUST_PROXY=true \
  directus/directus:12.4.1
```

Nach einem Directus-Update in Produktion den Container mit dem neuen Tag neu anlegen. Der
statische Token aus `.env` gilt auch lokal, weil er im Dump mitkommt.

## Automatisch: täglich auf die Storage Box

*Stand 25.09.2026: eingerichtet und in Betrieb, täglich 02:15 UTC. Log auf dem Server in
`/var/log/trainer-backup.log`, Konfiguration in `/etc/trainer-backup.env`, Cronjob in
`/etc/cron.d/trainer-backup`.*

`scripts/backup-cron.sh` läuft als Cronjob **auf dem Server**. Es sichert Datenbank und
Uploads, verschlüsselt mit einem **öffentlichen** Schlüssel, lädt beides auf eine Hetzner
Storage Box und löscht dort Stände, die älter als 30 Tage sind (Aufbewahrung entschieden am
25.09.2026). Der Server kann Backups also schreiben, aber nicht lesen. Nach jedem erfolgreichen
Lauf meldet er sich bei Uptime Kuma; bleibt die Meldung aus, schlägt der Monitor an.

Ein Satz auf der Box besteht aus drei Dateien:

| Datei | Inhalt |
|---|---|
| `trainer-<stamp>.dump.gpg` | pg_dump im Custom-Format, verschlüsselt |
| `uploads-<stamp>.tar.gz.gpg` | Uploads-Volume, verschlüsselt |
| `trainer-<stamp>.counts` | Zeilenzahl je Tabelle und Dateizahl zum Zeitpunkt des Dumps, Klartext ohne Personenbezug |

Die `.counts`-Datei wird zuletzt hochgeladen. Nur ein Satz mit ihr ist vollständig.

**Wiederherstellung prüfen** — der Cronjob kann das nicht, weil ihm der private Schlüssel
fehlt. Deshalb mindestens monatlich und vor jeder Migration auf dem Mac:

```sh
scripts/backup.sh --latest
```

Holt den neuesten Satz, spielt ihn in `trainer-restore` ein und zählt gegen die `.counts`-Datei
statt gegen die inzwischen weitergelaufene Produktion. Mit `--probe` bleibt die Probeumgebung
stehen. Vor einer Migration trotzdem `scripts/backup.sh` für einen frischen Stand.

### Einrichtung

1. **Storage Box buchen** (Hetzner-Konsole, kleinste Größe reicht, Standort **Falkenstein** —
   Deutschland wie der Server, nicht Helsinki). Nur **SSH-Support** an; SMB, WebDAV und
   **„Äußere Erreichbarkeit" aus** (entschieden 25.09.2026) — die Box ist dann nur aus dem
   Hetzner-Netz erreichbar, der Mac kommt über den Server als Zwischenstation hin.
   Automatische Snapshots der Box **aus** lassen — sie würden die 30 Tage unterlaufen.
2. **Unterkonto nur zum Lesen** für den Mac anlegen, Basisverzeichnis `trainer`,
   „Nur lesen" an, „Äußere Erreichbarkeit" auch hier aus. Der Mac braucht keinen
   Schreibzugriff.
3. **Schlüsselpaar auf dem Mac** erzeugen, mit Passphrase:

   ```sh
   gpg --quick-gen-key "Schulaufgaben Backup" ed25519 cert never
   gpg --quick-add-key <Fingerprint> cv25519 encr never
   gpg --armor --export "Schulaufgaben Backup" > trainer-backup.pub.asc
   ```

   Den privaten Schlüssel zusätzlich offline sichern (`gpg --export-secret-keys --armor`,
   z. B. im Passwortmanager). **Ohne ihn sind alle Backups wertlos.**
4. **Server:** `trainer-backup.pub.asc` nach `/etc/trainer-backup.pub.asc`, das Skript nach
   `/usr/local/bin/trainer-backup`. Für root ein SSH-Schlüssel ohne Passphrase, dessen
   öffentlicher Teil auf die Box kommt (Hauptkonto, Port 23):

   ```sh
   ssh-keygen -t ed25519 -f /root/.ssh/storagebox -N ''
   ```

   In `/root/.ssh/config` für den Box-Host `Port 23` und `IdentityFile /root/.ssh/storagebox`
   eintragen. Vorher auf dem Server prüfen, dass `gpg`, `sftp` und `curl` vorhanden sind.
5. **Konfiguration** `/etc/trainer-backup.env`, Rechte `600`:

   ```sh
   DIRECTUS_HOST=schulaufgaben-trainer-directus.coolify.groovemanager.com
   BOX=u123456@u123456.your-storagebox.de
   PUSH_URL=https://<uptime-kuma>/api/push/<token>
   ```

6. **Uptime Kuma:** Monitor vom Typ *Push*, Intervall 26 Stunden. Die URL ohne Parameter
   in `PUSH_URL`.
7. **Probelauf:** `trainer-backup --dry` prüft Konfiguration, Container und Box. Danach einmal
   ohne `--dry` und auf dem Mac `scripts/backup.sh --latest` — erst dann den Cronjob anlegen.
8. **Cronjob** in `/etc/cron.d/trainer-backup` (Serverzeit ist UTC):

   ```
   15 2 * * * root /usr/local/bin/trainer-backup >> /var/log/trainer-backup.log 2>&1
   ```

   Das Log enthält nur Container-Namen, Größen und Dateinamen.

Auf dem Mac `BACKUP_BOX=<unterkonto>@<box-host>` in `.env` eintragen und den
SSH-Schlüssel des Macs beim Unterkonto hinterlegen.

**So eingerichtet am 25.09.2026** — Box `u676898`, Unterkonto `u676898-sub1` (nur lesen):

- Die Konsole bietet kein Feld für SSH-Schlüssel. Der Server-Schlüssel kam per
  `ssh-copy-id -s -i /root/.ssh/storagebox.pub` mit einmaliger Passworteingabe auf die Box.
- Der Mac-Schlüssel `~/.ssh/storagebox_trainer` liegt über das Hauptkonto in
  `trainer/.ssh/authorized_keys` — dort sucht Hetzner die Schlüssel des Unterkontos.
- Das Unterkonto startet **in** `trainer`; für den Mac ist der Ordner deshalb `.`
  (Standard von `BACKUP_BOX_DIR`).
- Den Host-Schlüssel der Box hat der Mac aus `known_hosts` des Servers übernommen
  (ED25519 `SHA256:XqONwb1S0zuj5A1CDxpOSuD2hnAArV1A3wKY7Z3sdgM`), nicht blind akzeptiert.
- Erster Lauf `trainer-2026-09-25-181402`: 41 Tabellen, 6 Dateien, mit `--latest`
  wiederhergestellt und gegengezählt. `backup.sh --latest` geht per `ProxyJump`
über `groovemanager-coolify` (`BACKUP_BOX_JUMP`, Standard `BACKUP_SERVER`). Der Server reicht
nur die Verbindung durch; angemeldet wird mit dem Schlüssel des Macs, der Inhalt bleibt
verschlüsselt. Auf dem Server muss dafür `AllowTcpForwarding` erlaubt sein (Standard bei OpenSSH).

## Aufräumen: Löschfristen

`scripts/aufraeumen.ts` läuft jede Nacht vor dem Backup und löscht, was nach den zugesagten
Fristen weg sein muss. Regeln in `src/lib/retention.ts`:

| Was | Frist |
|---|---|
| Aufgabenblätter und Lösungsfotos | 30 Tage nach Upload; Aufgabe und Korrekturtext bleiben, der Verweis wird geleert |
| Schulbücher (Zeile und PDF) | 90 Tage nach `last_used_at`, spätestens Ende des Schuljahres des Uploads (31.08.) |
| Verwaiste Dateien | 30 Tage nach Upload, wenn keine Relation auf `directus_files` auf sie zeigt |
| `email_tokens` | 7 Tage, wenn verbraucht oder abgelaufen |

Eine Datei, auf die etwas anderes verweist (etwa ein Avatar), fasst das Skript nie an. Kein
Directus-Flow, weil dessen „Delete Data" in `directus_files` nur die Zeile löscht und die
Datei auf der Platte liegen lässt; `DELETE /files` über die REST-API entfernt beides.

Ausgabe nur IDs und Zahlen. `--dry` zeigt, was gelöscht würde.

```sh
node --experimental-strip-types --env-file=.env scripts/aufraeumen.ts --dry
```

**Auf dem Server** läuft es in `node:24-alpine`, ohne `node_modules` — deshalb `fetch` statt SDK:

| | |
|---|---|
| Dateien | `/opt/trainer-aufraeumen/` mit `scripts/aufraeumen.ts`, `src/lib/retention.ts` und `package.json` (`{"type":"module"}`) |
| Konfiguration | `/etc/trainer-aufraeumen.env` (600): `DIRECTUS_URL`, `DIRECTUS_TOKEN`, `PUSH_URL` |
| Cronjob | `/etc/cron.d/trainer-aufraeumen`, 01:45 UTC — vor dem Backup um 02:15 |
| Log | `/var/log/trainer-aufraeumen.log` |

```
45 1 * * * root docker run --rm --env-file /etc/trainer-aufraeumen.env -v /opt/trainer-aufraeumen:/app:ro -w /app node:24-alpine node --experimental-strip-types --no-warnings scripts/aufraeumen.ts >> /var/log/trainer-aufraeumen.log 2>&1
```

Nach einer Änderung an Skript oder Regeln beide Dateien neu nach `/opt/trainer-aufraeumen/`
kopieren — der Cronjob kommt nicht mit dem App-Deploy.

---

## 1. Ausgangslage

| | |
|---|---|
| Hosting | Hetzner, Nürnberg · Coolify 4.1.2, ein Server |
| Directus | Service-Stack vom Typ `directus-with-postgresql`, `directus/directus:12.4.1` (fester Tag, seit 26.09.2026) |
| Postgres | **innerhalb** des Service-Stacks, keine Standalone-Datenbank |
| Uploads | eigenes Docker-Volume, **nicht** in Postgres |

Das Postgres läuft nicht als eigenständige Coolify-Datenbank, sondern im Compose-Stack des
Services. Coolifys geplante Backups zielen auf Standalone-Datenbanken; ob 4.1.2 das auch für
Datenbanken innerhalb eines Service-Stacks anbietet, ist in der Oberfläche beim Service zu
prüfen (Backup-Tab). Für ein Migrationsbackup ist der Dump von Hand ohnehin der richtige Weg,
weil er anschließend lokal wiederhergestellt werden soll.

**Zwei Dinge, die der Postgres-Dump nicht abdeckt:**

- Die hochgeladenen Schulbuch-PDFs und Lösungsfotos liegen im Directus-Uploads-Volume.
- Der Hetzner-Snapshot ist crash-konsistent und taugt als Rettungsanker, wenn die ganze VM
  stirbt — nicht für ein gezieltes „stell `profiles` von vor der Migration zurück".

---

## 2. Container und Zugangsdaten finden

Die Befehle laufen **auf dem Server**, nicht lokal. Per SSH oder über das Web-Terminal in
Coolify (Server → Terminal).

```sh
docker ps --format '{{.Names}}\t{{.Image}}' | grep -i postgres
```

Der richtige Container trägt das UUID-Suffix des Schulaufgaben-Services.

```sh
docker exec <container> env | grep ^POSTGRES_
```

Liefert `POSTGRES_USER`, `POSTGRES_DB` und das Passwort.

```sh
docker exec <container> postgres --version
docker inspect <container> --format '{{.Config.Image}}'
```

Beides notieren — Version und Image braucht Schritt 5.

---

## 3. Dump ziehen

```sh
docker exec <container> pg_dump -U <user> -d <db> -Fc > ~/trainer-$(date +%F).dump
```

- **Kein `-t`.** Ein TTY schreibt Zeilenenden um und beschädigt den binären Dump lautlos.
  Das fällt erst beim Zurückspielen auf — deshalb die Prüfung in Schritt 5.
- `-Fc` (Custom-Format) statt Plaintext: komprimiert und selektiv wiederherstellbar
  (`pg_restore -t profiles`). Für ein Rollback nach einer halb gelaufenen Migration ist das
  der entscheidende Unterschied.

---

## 4. Verschlüsseln und herunterladen

In der Datenbank stehen Vornamen, Klassenstufen und Korrekturtexte fremder Kinder. Der
TOM-Abschnitt im Konzept (§3.9) verlangt verschlüsselte Backups — das gilt ab dem Moment, in
dem die Datei den Container verlässt.

```sh
gpg --symmetric --cipher-algo AES256 ~/trainer-$(date +%F).dump
```

```sh
scp root@<server>:~/trainer-*.dump.gpg ~/backups/
```

Die unverschlüsselte Zwischendatei danach auf dem Server löschen. Ein Dump auf derselben
Platte wie die Datenbank ist kein Backup.

---

## 5. Wiederherstellung prüfen — der Schritt, der es zum Backup macht

Nebeneffekt: Am Ende steht die Postgres-Instanz, gegen die ein Migrationsskript laufen kann,
bevor es Produktion anfasst.

```sh
gpg --decrypt ~/backups/trainer-2026-09-21.dump.gpg > ~/backups/trainer-2026-09-21.dump
```

```sh
file ~/backups/trainer-2026-09-21.dump
```

Muss `PostgreSQL custom database dump` ergeben. **Hier** zeigt sich eine `-t`-Beschädigung —
nicht erst drei Schritte später.

```sh
docker run --rm -d --name trainer-restore -e POSTGRES_PASSWORD=test -p 55432:5432 <image aus Schritt 2>
```

Das Image muss zur Quelle passen, siehe Stolperfalle B. Dann:

```sh
docker exec trainer-restore pg_isready -U postgres
```

```sh
docker cp ~/backups/trainer-2026-09-21.dump trainer-restore:/tmp/backup.dump
```

```sh
docker exec trainer-restore pg_restore -U postgres -d postgres --no-owner --no-acl /tmp/backup.dump
```

`--no-owner --no-acl`, weil im Wegwerf-Container nur die Rolle `postgres` existiert.

```sh
docker exec trainer-restore psql -U postgres -d postgres -c "select 'families' t, count(*) from families union all select 'profiles', count(*) from profiles union all select 'exercises', count(*) from exercises union all select 'corrections', count(*) from corrections;"
```

**Sollwerte am 21.09.2026:** families 3 · profiles 5 · exercises 17 · corrections 5,
dazu 29 `directus_*`-Systemtabellen. Beim nächsten Mal vorher in Directus gegenzählen.

Zum Schluss aufräumen — die entschlüsselte Kopie ist Klartext mit Kinderdaten:

```sh
rm ~/backups/trainer-2026-09-21.dump
```

```sh
docker rm -f trainer-restore
```

---

## 6. Stolperfallen

**A — `docker exec -t` zerschießt den Dump.** Das TTY übersetzt Zeilenenden. Der Dump sieht
normal aus, bis `pg_restore` ihn ablehnt. Nie `-t` bei binärer Ausgabe; `file` als Gegenprobe.

**B — Das Ziel-Image muss PostGIS mitbringen.** Beim Testlauf auf schlichtem `postgres:16`
schlugen 14 Objekte fehl, alle aus PostGIS: `public.spatial_ref_sys`, `tiger.geocode_settings`,
`tiger.pagc_*`, `topology.*`. Der Dump enthält diese Objekte, das Quell-Image bringt PostGIS
also mit. Für die Anwendungsdaten ist das folgenlos — die liegen vollständig in `public`.
Für einen **echten** Restore aber nicht: Directus erwartet die Extensions beim Start. Deshalb
in Schritt 2 das Image notieren und in Schritt 5 dasselbe verwenden.

**C — Ein zweiter `pg_restore` in dieselbe Datenbank rauscht durch.** 185 Fehler,
durchgehend `already exists` und Primärschlüsselkonflikte. Harmlos, die Zeilenzahlen bleiben
korrekt — aber unübersichtlich. Vorher sauber machen:

```sh
docker exec trainer-restore psql -U postgres -d postgres -c "drop schema public cascade; create schema public;"
```

**D — `gpg` und `pg_restore` fehlen auf macOS.** `pg_restore` und `psql` braucht man nicht
lokal, die bringt der Wegwerf-Container mit (und garantiert in passender Version). `gpg` zum
Entschlüsseln dagegen schon: `brew install gnupg`.

---

## 7. Uploads sichern

Die hochgeladenen Lösungsfotos und Schulbuch-PDFs liegen nicht in Postgres. Der Speicher-Adapter
ist `local`, die Dateien liegen also auf der Platte und nicht in einem Objektspeicher.

**Directus muss dafür nicht gestoppt werden.** Anders als bei der Datenbank sind hochgeladene
Dateien nach dem Schreiben unveränderlich — ein `tar` über das laufende Volume ist konsistent.
Lädt jemand genau währenddessen hoch, fehlt diese eine Datei; das nächste Backup holt sie.

### Sollwerte vorher in Directus holen

Ohne die weiß man hinterher nicht, ob man das richtige Volume erwischt hat. Im Admin unter
*Dateibibliothek*, oder per API `/files?aggregate[count]=id&aggregate[sum]=filesize`.

Stand 21.09.2026: **5 Dateien, 1.190.292 Bytes (rund 1,19 MB)**, ausschließlich JPEG.

### Volume ermitteln

```sh
docker ps --format '{{.Names}}' | grep -i directus
```

```sh
docker inspect <directus-container> --format '{{range .Mounts}}{{.Type}}  {{.Name}}  ->  {{.Destination}}{{println}}{{end}}'
```

Gesucht ist die Zeile mit dem Ziel `/directus/uploads`; der mittlere Wert ist der Volume-Name.

### Archiv ziehen und prüfen

```sh
docker run --rm -v <volume>:/data:ro -v "$PWD":/backup alpine tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
```

```sh
tar tzf uploads-$(date +%F).tar.gz | grep -c .
```

Gegen die Sollwerte halten. Weicht die Zahl deutlich ab, ist es das falsche Volume — nicht
einfach weitermachen.

Danach wie in Schritt 4 verschlüsseln und herunterladen, und das unverschlüsselte Archiv auf
dem Server löschen. Handschriftliche Lösungen sind nach Konzept §3.5 die sensibelste
Datenkategorie, weil oft der Name des Kindes mit auf dem Blatt steht.

*Kürzerer Weg ohne Volume-Suche:* `docker cp <directus-container>:/directus/uploads ./uploads-backup`
— funktioniert auch, verliert aber Zeitstempel und Rechte.

### Reihenfolge bedenken

Am 21.09.2026 lagen alle fünf Dateien seit dem 13./14. Juni im Volume — über drei Monate.
Nach Konzept §3.5 und Stufe 0 #4 sollen Lösungsfotos **nach 30 Tagen automatisch gelöscht**
werden. Seit 25.09.2026 erledigt das `scripts/aufraeumen.ts` (Abschnitt „Aufräumen"), jede
Nacht vor dem Backup.

Ein verschlüsseltes Archiv verlängert damit die Aufbewahrung von Daten, die laut eigener
Zusage längst weg sein müssten. Entweder vorher aufräumen und danach sichern, oder sichern
und die Löschung als nächsten Schritt setzen — samt der Frage, wie lange die Archive selbst
aufbewahrt werden.

---

## 8. Offen

- **Wiederholung.** Gelöst durch den Cronjob oben (entschieden 25.09.2026: Cronjob auf die
  Storage Box statt Coolifys geplanter Backups — die hätten nicht selbst verschlüsselt und die
  Uploads nicht erfasst). Eingerichtet am 25.09.2026.
- **Hetzner-Snapshot** als zweite Ebene, vor jeder Migration zusätzlich zum Dump.
- **Aufbewahrung.** Entschieden am 25.09.2026: täglich, 30 Tage, auf der Storage Box. Ein
  gelöschtes Profil liegt damit bis zu 30 Tage länger im Backup — in Datenschutzerklärung und
  Verzeichnis der Verarbeitungstätigkeiten nennen.
- **Box löschbar vom Server aus.** Der Server hat Schreib- und Löschrechte auf der Box, ein
  kompromittierter Server kann also auch die Backups löschen. Für diese Größe hingenommen.
- **30-Tage-Löschung der Uploads** (Konzept, Stufe 0 #4): umgesetzt 25.09.2026 als
  `scripts/aufraeumen.ts`, siehe „Aufräumen".
