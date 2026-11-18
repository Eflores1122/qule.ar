import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { env } from "./env.js";

// Por ahora las fotos se guardan en disco. Más adelante: un driver para Cloudflare R2.
const dir = path.join(env.DATA_DIR, "uploads");
await mkdir(dir, { recursive: true });

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

export async function readImage(key: string): Promise<Buffer | null> {
  if (!KEY_RE.test(key)) return null;
  try {
    return await readFile(path.join(dir, key));
  } catch {
    return null;
  }
}

export async function deleteImage(key: string) {
  if (!KEY_RE.test(key)) return;
  await unlink(path.join(dir, key)).catch(() => {});
}
