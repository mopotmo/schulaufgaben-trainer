# Backup und Wiederherstellung

Stand: 21.09.2026 · Erprobt an diesem Tag, die Befehle sind gelaufen und nicht geraten.

Pflicht vor jeder Migration (`CLAUDE.md`). Ein Backup gilt erst als Backup, wenn es
**zurückgespielt und gegengezählt** wurde — Schritt 5 ist nicht optional.

---

## 1. Ausgangslage

| | |
|---|---|
| Hosting | Hetzner, Nürnberg · Coolify 4.1.2, ein Server |
| Directus | Service-Stack vom Typ `directus-with-postgresql` |
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
TOM-Abschnitt im Konzept (§3.7) verlangt verschlüsselte Backups — das gilt ab dem Moment, in
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
werden; diese Automatik existiert noch nicht.

Ein verschlüsseltes Archiv verlängert damit die Aufbewahrung von Daten, die laut eigener
Zusage längst weg sein müssten. Entweder vorher aufräumen und danach sichern, oder sichern
und die Löschung als nächsten Schritt setzen — samt der Frage, wie lange die Archive selbst
aufbewahrt werden.

---

## 8. Offen

- **Wiederholung.** Bisher läuft alles von Hand. Entweder Coolifys geplante Backups nutzen,
  falls sie den Service-Stack abdecken (Oberfläche prüfen), oder ein Cronjob mit denselben
  Befehlen plus Rotation.
- **Hetzner-Snapshot** als zweite Ebene, vor jeder Migration zusätzlich zum Dump.
- **Aufbewahrung.** Wie viele Stände, wie lange, wo. Berührt die Löschzusage aus Konzept
  §3.3: Ein Backup, das ein gelöschtes Profil noch monatelang vorhält, ist ein eigener Punkt
  im Verzeichnis der Verarbeitungstätigkeiten.
- **30-Tage-Löschung der Uploads** (Konzept, Stufe 0 #4) ist nicht umgesetzt. Solange sie
  fehlt, wächst mit jedem Upload-Backup ein Bestand mit, der längst gelöscht sein sollte.
  Als Directus-Flow oder Cronjob — siehe Spec §10.3, Flows sind für Wiederkehrendes.
