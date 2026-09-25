#!/usr/bin/env bash
# Backup der Produktions-Datenbank in einem Aufruf — Vorgehen aus docs/backup-und-restore.md.
#
#   scripts/backup.sh              Dump ziehen, verschlüsseln, lokal wiederherstellen, gegenzählen
#   scripts/backup.sh --probe      wie oben, danach bleibt die Probeumgebung stehen
#                                  (Postgres :55432 + Directus :8055) für Migrations-Probeläufe
#   scripts/backup.sh --uploads    zusätzlich das Uploads-Volume sichern
#   scripts/backup.sh --check      nur prüfen: Server, Container, Zeilenzahlen — kein Dump
#   scripts/backup.sh --latest     statt eines neuen Dumps den neuesten Stand des Cronjobs von der
#                                  Storage Box holen, wiederherstellen und gegen dessen Zählung prüfen
#                                  (braucht den privaten Schlüssel; mit --probe kombinierbar)
#
# Der Klartext berührt keine Platte: pg_dump läuft per SSH direkt in gpg, die Prüfung entschlüsselt
# direkt in den Wegwerf-Container. gpg fragt einmal nach der Passphrase (symmetrisch, AES256).
#
# Umgebung: DIRECTUS_URL aus .env bestimmt, welcher der Directus-Stacks auf dem Server gemeint ist.
#   BACKUP_SERVER    SSH-Host (Standard: groovemanager-coolify)
#   BACKUP_DIR       Zielordner (Standard: ~/backups)
#   BACKUP_BOX       Storage Box für --latest, z. B. u123456-sub1@u123456.your-storagebox.de
#                    (Umgebung oder .env)
#   BACKUP_BOX_DIR   Ordner darauf (Standard: . — das Unterkonto startet schon im Backup-Ordner)
#   BACKUP_BOX_JUMP  Zwischenstation zur Box (Standard: BACKUP_SERVER). Die Box ist ohne
#                    „Äußere Erreichbarkeit" nur aus dem Hetzner-Netz erreichbar; leer = direkt
set -euo pipefail

cd "$(dirname "$0")/.."

# gpg liest den Dump von stdin — die Passphrase-Abfrage braucht deshalb das Terminal explizit.
export GPG_TTY="${GPG_TTY:-$(tty 2>/dev/null || true)}"

SERVER="${BACKUP_SERVER:-groovemanager-coolify}"
DIR="${BACKUP_DIR:-$HOME/backups}"
STAMP="$(date +%Y-%m-%d-%H%M%S)"
RESTORE=trainer-restore
RESTORE_DIRECTUS=trainer-directus
NET=trainer-net

PROBE=0 UPLOADS=0 CHECK=0 LATEST=0
for a in "$@"; do
	case "$a" in
		--probe) PROBE=1 ;;
		--uploads) UPLOADS=1 ;;
		--check) CHECK=1 ;;
		--latest) LATEST=1 ;;
		*) echo "Unbekannte Option: $a" >&2; exit 2 ;;
	esac
done

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32mok\033[0m  %s\n' "$*"; }
warn() { printf '  \033[33m!!\033[0m  %s\n' "$*"; }
die() { printf '\n\033[31mAbgebrochen:\033[0m %s\n' "$*" >&2; exit 1; }
remote() { ssh -o BatchMode=yes "$SERVER" "$@"; }

if [ "$CHECK" = 0 ] && [ ! -t 0 ]; then
	die "gpg braucht ein Terminal für die Passphrase — im Terminal ausführen, nicht über die !-Eingabe im Chat"
fi

TMP="$(mktemp -d)"
FILE="" UFILE="" DONE=0
# Bricht das Skript nach Beginn des Dumps ab, darf keine ungeprüfte Datei wie ein Backup aussehen.
cleanup() {
	rm -rf "$TMP"
	if [ "$DONE" = 0 ]; then
		[ -n "$FILE" ] && rm -f "$FILE"
		[ -n "$UFILE" ] && rm -f "$UFILE"
	fi
}
trap cleanup EXIT

# Zeilenzahl je Tabelle in public. spatial_ref_sys gehört zu PostGIS und fehlt in der Kopie.
cat > "$TMP/counts.sql" <<'SQL'
select c.relname,
       (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'spatial_ref_sys'
order by 1;
SQL

if [ "$LATEST" = 1 ]; then

# ------------------------------------------------------------ 1–2. Neuesten Stand holen

BOX="${BACKUP_BOX:-$(grep -E '^BACKUP_BOX=' .env | cut -d= -f2- | tr -d '"'"'"' ' || true)}"
BOX_DIR="${BACKUP_BOX_DIR:-.}"
[ -n "$BOX" ] || die "BACKUP_BOX fehlt (Umgebung oder .env)"
JUMP="${BACKUP_BOX_JUMP-$SERVER}"
# ProxyJump reicht nur die TCP-Verbindung durch: Angemeldet wird mit dem Schlüssel des Macs beim
# Unterkonto, der Server sieht weder Schlüssel noch Inhalt.
box() { sftp -P 23 -o BatchMode=yes ${JUMP:+-o ProxyJump="$JUMP"} -q -b - "$BOX"; }

bold "1. Neuester Stand auf $BOX"
# Die .counts-Datei lädt der Cronjob zuletzt hoch — nur ein Satz mit ihr ist vollständig.
LAST="$(echo "ls -1 $BOX_DIR" | box | sed 's#.*/##' | grep -E '^trainer-[0-9-]+\.counts$' | sort | tail -1 || true)"
[ -n "$LAST" ] || die "Kein vollständiges Backup in $BOX_DIR"
STAMP="${LAST#trainer-}"; STAMP="${STAMP%.counts}"
AGE=$(( ( $(date +%s) - $(date -j -u -f %Y-%m-%d-%H%M%S "$STAMP" +%s) ) / 3600 ))
ok "trainer-$STAMP (vor $AGE h)"
[ "$AGE" -le 36 ] || warn "älter als 36 Stunden — läuft der Cronjob?"

bold "2. Herunterladen"
FILE="$TMP/trainer-$STAMP.dump.gpg"
printf 'get %s %s\nget %s %s\n' \
	"$BOX_DIR/trainer-$STAMP.counts" "$TMP/counts" \
	"$BOX_DIR/trainer-$STAMP.dump.gpg" "$FILE" | box >/dev/null || die "Download fehlgeschlagen"
# Die Zählung vom Zeitpunkt des Dumps ersetzt die live gezählten Werte.
grep -v '^uploads ' "$TMP/counts" > "$TMP/live.txt"
TABLES="$(grep -c . "$TMP/live.txt")"
ok "$(du -h "$FILE" | cut -f1), $TABLES Tabellen gezählt"

else

# ------------------------------------------------------------ 1. Container finden

bold "1. Container auf $SERVER"

DIRECTUS_URL="$(grep -E '^DIRECTUS_URL=' .env | cut -d= -f2- | tr -d '"'"'"' ')"
[ -n "$DIRECTUS_URL" ] || die "DIRECTUS_URL fehlt in .env"
HOST="$(echo "$DIRECTUS_URL" | sed -E 's#^https?://##; s#/.*$##')"

# Auf dem Server laufen mehrere Directus-Stacks. Zugeordnet wird über die Traefik-Domain,
# nicht über eine fest eingetragene Container-ID.
DIRECTUS_C="$(remote "for c in \$(docker ps --format '{{.Names}}' | grep '^directus-'); do
	docker inspect \$c --format '{{json .Config.Labels}}' | grep -q 'Host(\`$HOST\`)' && echo \$c; done; true")"
[ "$(echo "$DIRECTUS_C" | grep -c .)" = 1 ] || die "Kein eindeutiger Directus-Container für $HOST: '${DIRECTUS_C}'"
PG_C="postgresql-${DIRECTUS_C#directus-}"
remote "docker inspect $PG_C >/dev/null" || die "Postgres-Container $PG_C fehlt"
PG_USER="$(remote "docker exec $PG_C printenv POSTGRES_USER")"
PG_DB="$(remote "docker exec $PG_C printenv POSTGRES_DB")"
ok "$HOST → $DIRECTUS_C / $PG_C (Datenbank $PG_DB)"

bold "2. Zeilenzahlen in Produktion"
remote "docker exec -i $PG_C psql -U $PG_USER -d $PG_DB -At -F ' '" < "$TMP/counts.sql" > "$TMP/live.txt"
TABLES="$(grep -c . "$TMP/live.txt")"
[ "$TABLES" -gt 0 ] || die "Keine Tabellen gefunden"
ok "$TABLES Tabellen"
grep -vE '^directus_' "$TMP/live.txt" | sed 's/^/        /'

if [ "$CHECK" = 1 ]; then
	printf '\nNur geprüft (--check) — kein Dump gezogen.\n'
	exit 0
fi

# ------------------------------------------------------------ 3. Dump

mkdir -p "$DIR"
FILE="$DIR/trainer-$STAMP.dump.gpg"
bold "3. Dump → $FILE"
# Kein `docker exec -t`: Ein TTY schreibt Zeilenenden um und zerschießt den Dump (Stolperfalle A).
remote "docker exec $PG_C pg_dump -U $PG_USER -d $PG_DB -Fc" \
	| gpg --symmetric --cipher-algo AES256 --output "$FILE"
ok "$(du -h "$FILE" | cut -f1) verschlüsselt"

fi

# ------------------------------------------------------------ 4. Wiederherstellen und prüfen

bold "4. Wiederherstellen in $RESTORE"
# Kopfprüfung: ein Custom-Format-Dump beginnt mit PGDMP. Deckt eine TTY-Beschädigung sofort auf.
[ "$(gpg --quiet --decrypt "$FILE" 2>/dev/null | head -c 5)" = "PGDMP" ] || die "Datei ist kein pg_dump-Custom-Format"
ok "Kopf PGDMP"

docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET" >/dev/null
docker stop "$RESTORE_DIRECTUS" >/dev/null 2>&1 || true
docker rm -f "$RESTORE" >/dev/null 2>&1 || true
docker run -d --name "$RESTORE" --network "$NET" -p 55432:5432 \
	-e POSTGRES_DB=directus -e POSTGRES_PASSWORD=test postgres:16 >/dev/null
until docker exec "$RESTORE" pg_isready -U postgres -d directus >/dev/null 2>&1; do sleep 1; done
# pg_isready meldet schon während der Initialisierung — einmal echt verbinden.
until docker exec "$RESTORE" psql -U postgres -d directus -c 'select 1' >/dev/null 2>&1; do sleep 1; done

gpg --quiet --decrypt "$FILE" \
	| docker exec -i "$RESTORE" pg_restore -U postgres -d directus --no-owner --no-acl 2> "$TMP/restore.log" || true
# postgres:16 statt des PostGIS-Images der Produktion (das gibt es nur für amd64): Die
# PostGIS-Objekte schlagen erwartbar fehl, die Anwendungsdaten liegen vollständig in public.
UNEXPECTED="$(grep -E '^pg_restore: error' "$TMP/restore.log" | grep -vE 'spatial_ref_sys|tiger|topology|postgis|geometry|geography|raster' || true)"
if [ -n "$UNEXPECTED" ]; then
	echo "$UNEXPECTED" | head -10
	die "pg_restore meldet Fehler außerhalb von PostGIS"
fi
ok "pg_restore ohne unerwartete Fehler"

docker exec -i "$RESTORE" psql -U postgres -d directus -At -F ' ' < "$TMP/counts.sql" > "$TMP/restored.txt"

bold "5. Gegenzählen"
MISSING="$(join -v1 <(sort "$TMP/live.txt") <(sort "$TMP/restored.txt") | cut -d' ' -f1 || true)"
[ -z "$MISSING" ] || die "Tabellen fehlen in der Wiederherstellung: $MISSING"
DIFFS=0
while read -r t live restored; do
	if [ "$live" != "$restored" ]; then
		DIFFS=$((DIFFS + 1))
		# Directus protokolliert jeden API-Zugriff — zwischen Dump und Zählung wächst das weiter.
		case "$t" in
			directus_activity|directus_revisions|directus_sessions|logs) ok "$t: live $live, Backup $restored (läuft mit, erwartbar)" ;;
			*) warn "$t: $([ "$LATEST" = 1 ] && echo gezählt || echo live) $live, Backup $restored" ;;
		esac
	fi
done < <(join <(sort "$TMP/live.txt") <(sort "$TMP/restored.txt"))
[ "$DIFFS" = 0 ] && ok "alle $TABLES Tabellen stimmen überein"

# ------------------------------------------------------------ 6. Uploads (optional)

if [ "$UPLOADS" = 1 ]; then
	UFILE="$DIR/uploads-$STAMP.tar.gz.gpg"
	bold "6. Uploads → $UFILE"
	VOL="$(remote "docker inspect $DIRECTUS_C --format '{{range .Mounts}}{{if eq .Destination \"/directus/uploads\"}}{{.Name}}{{end}}{{end}}'")"
	[ -n "$VOL" ] || die "Uploads-Volume von $DIRECTUS_C nicht gefunden"
	LIVE_FILES="$(remote "docker run --rm -v $VOL:/data:ro alpine find /data -type f | wc -l" | tr -d ' ')"
	remote "docker run --rm -v $VOL:/data:ro alpine tar czf - -C /data ." \
		| gpg --symmetric --cipher-algo AES256 --output "$UFILE"
	SAVED="$(gpg --quiet --decrypt "$UFILE" | tar tzf - | grep -vc '/$' || true)"
	[ "$SAVED" = "$LIVE_FILES" ] && ok "$SAVED Dateien, $(du -h "$UFILE" | cut -f1)" \
		|| warn "Volume $LIVE_FILES Dateien, Archiv $SAVED"
fi

if [ "$LATEST" = 1 ]; then
	UFILE="$TMP/uploads-$STAMP.tar.gz.gpg"
	bold "6. Uploads prüfen"
	echo "get $BOX_DIR/uploads-$STAMP.tar.gz.gpg $UFILE" | box >/dev/null || die "Download der Uploads fehlgeschlagen"
	WANT="$(awk '/^uploads /{print $2}' "$TMP/counts")"
	SAVED="$(gpg --quiet --decrypt "$UFILE" | tar tzf - | grep -vc '/$' || true)"
	[ "$SAVED" = "$WANT" ] && ok "$SAVED Dateien, $(du -h "$UFILE" | cut -f1)" \
		|| warn "gezählt $WANT Dateien, Archiv $SAVED"
fi

# ------------------------------------------------------------ Abschluss

if [ "$PROBE" = 1 ]; then
	bold "Probeumgebung"
	if docker inspect "$RESTORE_DIRECTUS" >/dev/null 2>&1; then
		docker start "$RESTORE_DIRECTUS" >/dev/null
		until curl -s localhost:8055/server/health | grep -q ok; do sleep 2; done
		ok "Postgres localhost:55432, Directus localhost:8055"
	else
		warn "Container $RESTORE_DIRECTUS fehlt — Anlage siehe docs/backup-und-restore.md"
		ok "Postgres localhost:55432"
	fi
	echo "  Abbauen: docker stop $RESTORE_DIRECTUS; docker rm -f $RESTORE"
else
	docker rm -f "$RESTORE" >/dev/null
fi

DONE=1
if [ "$LATEST" = 1 ]; then
	printf '\n\033[32mBackup geprüft:\033[0m %s:%s/trainer-%s\n' "$BOX" "$BOX_DIR" "$STAMP"
else
	printf '\n\033[32mBackup geprüft:\033[0m %s\n' "$FILE"
fi
