#!/usr/bin/env bash
# Backup diario de qule.ar. Ver docs/DEPLOY.md, "6. Backups".
#
# Corre con la misma cuenta que hace el deploy y usa Docker:
#   0 4 * * * "$HOME/mortero/src/deploy/backup.sh" >> "$HOME/mortero/backup.log" 2>&1
#
# Dos partes:
# - Local, SIEMPRE: un volcado de la base en BACKUP_DIR, para volver atrás en un minuto si un deploy sale mal.
#   Mientras no haya copia afuera, también las fotos y se guarda 14 días (lo que promete la política de privacidad).
#   Con copia afuera, solo la base y 3 días.
# - Afuera y CIFRADA con restic, si existe backup.env: la base va directo de pg_dump a restic, y las fotos y videos
#   desde el volumen (sin miniaturas). 14 días. Los domingos verifica el repositorio.
# Si falta backup.env, avisa y hace solo la parte local: nunca se queda sin ningún backup.
set -euo pipefail
umask 077

ENV_FILE="${BACKUP_ENV:-$HOME/mortero/backup.env}"
DEST="${BACKUP_DIR:-$HOME/mortero/backups}"
DB_CONTAINER="${DB_CONTAINER:-mortero-db}"
DATA_VOLUME="${DATA_VOLUME:-mortero-data}"
STAMP="$(date +%Y-%m-%d_%H%M)"
REMOTE=0
[ -r "$ENV_FILE" ] && REMOTE=1

# ---------- Local ----------
mkdir -p "$DEST"
chmod 700 "$DEST"
docker exec "$DB_CONTAINER" pg_dump -U mortero -d mortero -Fc > "$DEST/db_$STAMP.dump"
if [ "$REMOTE" = 0 ]; then
  docker run --rm -v "$DATA_VOLUME":/data:ro -v "$DEST":/backup busybox \
    sh -c "tar czf /backup/fotos_$STAMP.tar.gz -C /data --exclude uploads/thumbs uploads && chmod 600 /backup/fotos_$STAMP.tar.gz"
  LOCAL_KEEP_DAYS="${LOCAL_KEEP_DAYS:-14}"
else
  LOCAL_KEEP_DAYS="${LOCAL_KEEP_DAYS:-3}"
fi
find "$DEST" -name 'db_*.dump' -mtime +"$LOCAL_KEEP_DAYS" -delete
# Con copia afuera las fotos no quedan en el disco local; sin ella, 14 días como la base
if [ "$REMOTE" = 1 ]; then find "$DEST" -name 'fotos_*.tar.gz' -delete
else find "$DEST" -name 'fotos_*.tar.gz' -mtime +"$LOCAL_KEEP_DAYS" -delete; fi
echo "$(date +%FT%T%z) backup local ok: $STAMP"

if [ "$REMOTE" = 0 ]; then
  echo "$(date +%FT%T%z) AVISO: falta $ENV_FILE, no hay copia fuera del servidor (ver docs/DEPLOY.md, 6)" >&2
  exit 0
fi

# ---------- Afuera, cifrado ----------
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
: "${RESTIC_REPOSITORY:?Falta RESTIC_REPOSITORY en $ENV_FILE}"
: "${RESTIC_PASSWORD_FILE:?Falta RESTIC_PASSWORD_FILE en $ENV_FILE}"
if [ ! -r "$RESTIC_PASSWORD_FILE" ]; then
  echo "$(date +%FT%T%z) ERROR: no se puede leer el archivo de contraseña de restic" >&2
  exit 1
fi

KEEP_DAYS="${KEEP_DAYS:-14}"
RESTIC_BIN="${RESTIC_BIN:-$HOME/mortero/bin/restic}"
RESTIC_IMAGE="${RESTIC_IMAGE:-restic/restic:0.17.3}"
HOST_TAG="qule"

# 1. Base de datos. --stdin-from-command (restic 0.17 o más nuevo) no guarda el snapshot si pg_dump falla.
"$RESTIC_BIN" backup --host "$HOST_TAG" --tag db --stdin-filename db.dump \
  --stdin-from-command -- docker exec "$DB_CONTAINER" pg_dump -U mortero -d mortero -Fc

# 2. Fotos y videos. Montar el volumen en Docker permite usar el mismo usuario que hace el deploy.
docker volume inspect "$DATA_VOLUME" >/dev/null
docker run --rm \
  --env RESTIC_REPOSITORY --env AWS_ACCESS_KEY_ID --env AWS_SECRET_ACCESS_KEY \
  --env AWS_DEFAULT_REGION --env AWS_REGION --env AWS_SESSION_TOKEN \
  --env RESTIC_PASSWORD_FILE=/run/secrets/restic-password \
  --mount "type=bind,src=$(realpath "$RESTIC_PASSWORD_FILE"),dst=/run/secrets/restic-password,readonly" \
  --mount "type=volume,src=$DATA_VOLUME,dst=/data,readonly" \
  --mount type=volume,src=mortero-restic-cache,dst=/root/.cache/restic \
  "$RESTIC_IMAGE" backup --host "$HOST_TAG" --tag fotos --exclude /data/uploads/thumbs /data/uploads

# 3. Retención: solo los últimos KEEP_DAYS días (base y fotos por separado)
"$RESTIC_BIN" forget --host "$HOST_TAG" --group-by host,tags --keep-within "${KEEP_DAYS}d" --prune

# 4. Domingos: control del repositorio y lectura de una muestra de los datos
if [ "$(date +%u)" = "7" ]; then
  "$RESTIC_BIN" check --read-data-subset=5%
fi

echo "$(date +%FT%T%z) backup ok"
