#!/usr/bin/env bash
# Backup diario de mortero: base de datos + fotos. Pensado para correr con cron.
#   0 4 * * * /opt/mortero/deploy/backup.sh >> /opt/mortero/backups/backup.log 2>&1
set -euo pipefail

DEST="${BACKUP_DIR:-/opt/mortero/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y-%m-%d_%H%M)"
mkdir -p "$DEST"

# Base de datos (formato custom: se restaura con pg_restore)
docker exec mortero-db pg_dump -U mortero -d mortero -Fc > "$DEST/db_$STAMP.dump"

# Fotos (volumen de datos de la app)
docker run --rm -v mortero-data:/data:ro -v "$DEST":/backup busybox \
  tar czf "/backup/fotos_$STAMP.tar.gz" -C /data uploads

# Borrar backups viejos
find "$DEST" -name 'db_*.dump' -mtime +"$KEEP_DAYS" -delete
find "$DEST" -name 'fotos_*.tar.gz' -mtime +"$KEEP_DAYS" -delete

echo "$(date -Is) backup ok: $STAMP"
