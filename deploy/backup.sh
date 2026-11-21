#!/usr/bin/env bash
# Backup diario de qule.ar, CIFRADO y FUERA del servidor (restic). Ver docs/DEPLOY.md, "6. Backups".
#
# Corre con la misma cuenta que hace el deploy y usa Docker:
#   0 4 * * * "$HOME/mortero/src/deploy/backup.sh" >> "$HOME/mortero/backup.log" 2>&1
#
# - La base va directo de pg_dump a restic: nunca queda un volcado sin cifrar en el disco.
# - Las fotos y videos se suben desde el volumen de la app (sin las miniaturas, que se regeneran solas).
# - Se guardan 14 días, que es lo que promete la política de privacidad. Lo más viejo se borra.
# - Los domingos verifica que el repositorio esté sano y que se pueda leer una parte de los datos.
set -euo pipefail

ENV_FILE="${BACKUP_ENV:-$HOME/mortero/backup.env}"
if [ ! -r "$ENV_FILE" ]; then
  echo "$(date +%FT%T%z) ERROR: falta $ENV_FILE (copialo de deploy/backup.env.example)" >&2
  exit 1
fi
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
DB_CONTAINER="${DB_CONTAINER:-mortero-db}"
DATA_VOLUME="${DATA_VOLUME:-mortero-data}"
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
