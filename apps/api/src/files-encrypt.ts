/**
 * Cifra las fotos y los videos que se guardaron antes del cifrado de archivos (ver fileCrypt.ts).
 * Se puede cortar y volver a correr: lo que ya está cifrado se saltea. La app sigue andando mientras tanto,
 * porque lee igual los archivos cifrados y los de antes. Primero van los álbumes privados y las fotos de los chats.
 * Las miniaturas viejas se borran: se vuelven a generar solas, ya cifradas, la primera vez que alguien las pide.
 *
 * En producción, después de desplegar la versión con el cifrado y de hacer un backup:
 *   docker exec mortero-app node --import tsx src/files-encrypt.ts
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "./db/index.js";
import { env } from "./env.js";
import { checkDataKey } from "./crypt.js";
import { encryptBlob, isEncryptedBlob } from "./fileCrypt.js";
import { deleteThumb, getRawBlob, putRawBlob } from "./storage.js";

checkDataKey();

const KEY = /^[0-9a-f-]{36}\.(webp|mp4)$/;
const rows = async (q: ReturnType<typeof sql>) =>
  ((await db.execute(q)) as unknown as { rows: { k: string | null }[] }).rows.map((r) => r.k).filter((k): k is string => Boolean(k));

// Lo más sensible primero
const privateKeys = [
  ...(await rows(sql`select key as k from photo where is_private union select poster_key from photo where is_private`)),
  ...(await rows(sql`select photo_key as k from direct_message where photo_key is not null`)),
  ...(await rows(sql`select jsonb_array_elements_text(evidence_keys) as k from report`)),
];
const otherKeys = [
  ...(await rows(sql`select key as k from photo union select poster_key from photo`)),
  ...(await rows(sql`select photo_key as k from "group" where photo_key is not null`)),
];
// En el disco puede haber archivos que no figuran en la base (por ejemplo, de antes de pasar al bucket)
const onDisk = await readdir(path.join(env.DATA_DIR, "uploads")).catch(() => [] as string[]);

const keys = [...new Set([...privateKeys, ...otherKeys, ...onDisk])].filter((k) => KEY.test(k));
let done = 0;
let skipped = 0;
let missing = 0;
for (const key of keys) {
  const raw = await getRawBlob(key);
  if (!raw) missing++;
  else if (isEncryptedBlob(raw)) skipped++;
  else {
    await putRawBlob(key, encryptBlob(raw), key.endsWith(".mp4") ? "video/mp4" : "image/webp");
    await deleteThumb(key);
    done++;
    if (done % 100 === 0) console.log(`${done} cifrados…`);
  }
}
console.log(`Listo: ${done} cifrados, ${skipped} ya estaban cifrados, ${missing} no se encontraron, ${keys.length} en total.`);
process.exit(0);
