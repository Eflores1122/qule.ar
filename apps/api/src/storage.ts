import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { env } from "./env.js";

// Por ahora las fotos se guardan en disco. Más adelante: un driver para Cloudflare R2.
const dir = path.join(env.DATA_DIR, "uploads");
const thumbs = path.join(dir, "thumbs");
await mkdir(thumbs, { recursive: true });
const THUMB_PX = 480;

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

/**
 * Normaliza la imagen: la rota según EXIF, la achica y la pasa a WebP.
 * Re-codificar con sharp descarta TODOS los metadatos (incluida la ubicación GPS de la foto).
 */
export async function saveImage(input: ArrayBuffer): Promise<string> {
  const out = await sharp(Buffer.from(input))
    .rotate()
    .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const key = `${crypto.randomUUID()}.webp`;
  await writeFile(path.join(dir, key), out);
  return key;
}

const KEY_RE = /^[0-9a-f-]{36}\.webp$/;

export async function readImage(key: string, thumb = false): Promise<Buffer | null> {
  if (!KEY_RE.test(key)) return null;
  try {
    if (!thumb) return await readFile(path.join(dir, key));
    // La miniatura se genera la primera vez que se pide y queda guardada
    try {
      return await readFile(path.join(thumbs, key));
    } catch {
      const out = await sharp(await readFile(path.join(dir, key)))
        .resize({ width: THUMB_PX, height: THUMB_PX, fit: "cover", position: "attention" })
        .webp({ quality: 74 })
        .toBuffer();
      await writeFile(path.join(thumbs, key), out);
      return out;
    }
  } catch {
    return null;
  }
}

export async function deleteImage(key: string) {
  if (!KEY_RE.test(key)) return;
  await unlink(path.join(dir, key)).catch(() => {});
  await unlink(path.join(thumbs, key)).catch(() => {});
}
