#!/usr/bin/env bash
# Tägliches Backup auf dem Server — läuft als Cronjob, ohne Terminal und ohne Passphrase.
# Vorgehen und Einrichtung: docs/backup-und-restore.md, Abschnitt „Automatisch".
#
#   backup-cron.sh            Dump + Uploads ziehen, verschlüsseln, auf die Storage Box, rotieren
#   backup-cron.sh --dry      nur prüfen: Konfiguration, Container, Storage Box — nichts hochladen
#
# Verschlüsselt wird mit einem öffentlichen Schlüssel. Der Server kann Backups also schreiben,
# aber nicht lesen; der private Schlüssel liegt nur beim Betreiber. Klartext berührt keine Platte.
#
# Konfiguration in /etc/trainer-backup.env (root, 600):
#   DIRECTUS_HOST   Domain des Directus-Stacks, ordnet unter mehreren Stacks zu
#   BOX             Storage Box, z. B. u123456@u123456.your-storagebox.de
#   BOX_DIR         Zielordner auf der Box (Standard: trainer)
#   GPG_PUBKEY      Pfad zum öffentlichen Schlüssel (Standard: /etc/trainer-backup.pub.asc)
#   PUSH_URL        Uptime-Kuma-Push-URL ohne Parameter; meldet Erfolg, sonst schlägt der Monitor an
#   KEEP_DAYS       Aufbewahrung in Tagen (Standard: 30, entschieden 25.09.2026) — steht so in der
#                   Datenschutzerklärung, siehe BACKUP_RETENTION_DAYS in src/lib/config.ts
set -euo pipefail

CONF="${TRAINER_BACKUP_CONF:-/etc/trainer-backup.env}"
[ -r "$CONF" ] || { echo "Konfiguration $CONF fehlt" >&2; exit 1; }
# shellcheck disable=SC1090
. "$CONF"

BOX_DIR="${BOX_DIR:-trainer}"
GPG_PUBKEY="${GPG_PUBKEY:-/etc/trainer-backup.pub.asc}"
KEEP_DAYS="${KEEP_DAYS:-30}"
DRY=0
[ "${1:-}" = "--dry" ] && DRY=1

STAMP="$(date -u +%Y-%m-%d-%H%M%S)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

log() { printf '%s  %s\n' "$(date -u +%FT%TZ)" "$*"; }
push() {
	[ -n "${PUSH_URL:-}" ] && [ "$DRY" = 0 ] || return 0
	curl -fsS -m 10 -o /dev/null -G "$PUSH_URL" --data-urlencode "status=$1" --data-urlencode "msg=$2" || true
}
die() { log "FEHLER: $*"; push down "$*"; exit 1; }
box() { sftp -P 23 -o BatchMode=yes -q -b - "$BOX"; }

for v in DIRECTUS_HOST BOX; do [ -n "${!v:-}" ] || die "$v fehlt in $CONF"; done
for c in docker gpg sftp curl; do command -v "$c" >/dev/null || die "$c fehlt auf dem Server"; done
[ -r "$GPG_PUBKEY" ] || die "Öffentlicher Schlüssel $GPG_PUBKEY fehlt"

# Eigener Schlüsselring nur für diesen Zweck — der Schlüssel wird nicht in root's Ring importiert.
export GNUPGHOME="$TMP/gnupg"
mkdir -m 700 "$GNUPGHOME"
encrypt() { gpg --batch --quiet --trust-model always --recipient-file "$GPG_PUBKEY" --encrypt; }

# ------------------------------------------------------------ Container

# Auf dem Server laufen mehrere Directus-Stacks; zugeordnet wird wie in backup.sh über die Traefik-Domain.
DIRECTUS_C="$(for c in $(docker ps --format '{{.Names}}' | grep '^directus-'); do
	docker inspect "$c" --format '{{json .Config.Labels}}' | grep -q "Host(\`$DIRECTUS_HOST\`)" && echo "$c"; done; true)"
[ "$(echo "$DIRECTUS_C" | grep -c .)" = 1 ] || die "Kein eindeutiger Directus-Container für $DIRECTUS_HOST: '$DIRECTUS_C'"
PG_C="postgresql-${DIRECTUS_C#directus-}"
docker inspect "$PG_C" >/dev/null || die "Postgres-Container $PG_C fehlt"
PG_USER="$(docker exec "$PG_C" printenv POSTGRES_USER)"
PG_DB="$(docker exec "$PG_C" printenv POSTGRES_DB)"
VOL="$(docker inspect "$DIRECTUS_C" --format '{{range .Mounts}}{{if eq .Destination "/directus/uploads"}}{{.Name}}{{end}}{{end}}')"
[ -n "$VOL" ] || die "Uploads-Volume von $DIRECTUS_C nicht gefunden"
log "$DIRECTUS_HOST → $DIRECTUS_C / $PG_C, Volume $VOL"

echo "mkdir $BOX_DIR" | box >/dev/null 2>&1 || true
echo "ls $BOX_DIR" | box >/dev/null || die "Storage Box $BOX nicht erreichbar"

if [ "$DRY" = 1 ]; then
	log "Nur geprüft (--dry) — nichts hochgeladen"
	exit 0
fi

# ------------------------------------------------------------ Sichern

# Zeilenzahlen zum Zeitpunkt des Dumps. Keine personenbezogenen Daten, deshalb unverschlüsselt
# daneben — backup.sh --latest zählt die Wiederherstellung dagegen, nicht gegen die inzwischen
# weitergelaufene Produktion.
docker exec -i "$PG_C" psql -U "$PG_USER" -d "$PG_DB" -At -F ' ' > "$TMP/counts" <<'SQL'
select c.relname,
       (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'spatial_ref_sys'
order by 1;
SQL
[ -s "$TMP/counts" ] || die "Keine Tabellen gezählt"

# Kein `docker exec -t` (Stolperfalle A). Die ersten fünf Bytes gehen über dd in eine Datei:
# Ein gültiger Custom-Format-Dump beginnt mit PGDMP — prüfbar, ohne den Klartext abzulegen.
docker exec "$PG_C" pg_dump -U "$PG_USER" -d "$PG_DB" -Fc \
	| { dd bs=5 count=1 iflag=fullblock status=none | tee "$TMP/magic"; cat; } \
	| encrypt > "$TMP/db.gpg"
[ "$(cat "$TMP/magic")" = "PGDMP" ] || die "Dump beginnt nicht mit PGDMP"

# Hochgeladene Dateien sind nach dem Schreiben unveränderlich — tar über das laufende Volume ist konsistent.
docker run --rm -v "$VOL:/data:ro" alpine find /data -type f | wc -l | tr -d ' ' > "$TMP/files"
docker run --rm -v "$VOL:/data:ro" alpine tar czf - -C /data . | encrypt > "$TMP/uploads.gpg"
echo "uploads $(cat "$TMP/files")" >> "$TMP/counts"

# Erst unter temporärem Namen hochladen, dann umbenennen: Ein abgebrochener Upload sieht nie
# wie ein fertiges Backup aus. Die .counts-Datei kommt zuletzt und markiert den Satz als vollständig.
box <<EOF >/dev/null || die "Upload fehlgeschlagen"
put $TMP/db.gpg $BOX_DIR/.part-trainer-$STAMP.dump.gpg
put $TMP/uploads.gpg $BOX_DIR/.part-uploads-$STAMP.tar.gz.gpg
rename $BOX_DIR/.part-trainer-$STAMP.dump.gpg $BOX_DIR/trainer-$STAMP.dump.gpg
rename $BOX_DIR/.part-uploads-$STAMP.tar.gz.gpg $BOX_DIR/uploads-$STAMP.tar.gz.gpg
put $TMP/counts $BOX_DIR/trainer-$STAMP.counts
EOF
log "hochgeladen: trainer-$STAMP ($(du -h "$TMP/db.gpg" | cut -f1) Dump, $(du -h "$TMP/uploads.gpg" | cut -f1) Uploads, $(cat "$TMP/files") Dateien)"

# ------------------------------------------------------------ Rotieren

# Löscht nach Datum im Dateinamen, nicht nach mtime der Box. Erst nach erfolgreichem Upload —
# fällt der Cronjob aus, bleiben die alten Stände stehen. Liegengebliebene .part-Dateien gehen mit.
CUTOFF="$(date -u -d "$KEEP_DAYS days ago" +%Y-%m-%d)"
echo "ls -1a $BOX_DIR" | box | sed 's#.*/##' > "$TMP/list"
OLD="$(awk -v cut="$CUTOFF" -v today="${STAMP:0:10}" '
	match($0, /[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}/) {
		d = substr($0, RSTART, 10)
		if (d < cut || (/^\.part-/ && d < today)) print
	}' "$TMP/list")"
if [ -n "$OLD" ]; then
	echo "$OLD" | sed "s#^#rm $BOX_DIR/#" | box >/dev/null || die "Rotation fehlgeschlagen"
	log "gelöscht (vor $CUTOFF): $(echo "$OLD" | tr '\n' ' ')"
fi

push up "trainer-$STAMP"
log "fertig"
