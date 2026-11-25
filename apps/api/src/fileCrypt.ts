import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { dataKey } from "./crypt.js";

/**
 * Cifrado de los archivos guardados: fotos, videos y miniaturas, en el disco o en el bucket.
 * Quien copie la carpeta de fotos, el bucket o un backup sin DATA_KEY no puede verlos.
 *
 * Formato: "QLE1" | sal de 16 bytes | pedazos.
 * - Cada archivo tiene su propia clave, derivada de DATA_KEY con la sal (HKDF-SHA256).
 * - El contenido va en pedazos de 64 KiB, cada uno cifrado con AES-256-GCM (16 bytes de control al final).
 *   Así un video se puede servir por partes (Range) sin descifrarlo entero.
 * - El nonce de cada pedazo es su número. El último pedazo va marcado, así no se puede cortar el archivo
 *   ni cambiar pedazos de lugar sin que se note.
 *
 * Un archivo sin "QLE1" adelante es de antes del cifrado: se lee tal cual (ver files-encrypt.ts para cifrarlos).
 * Una foto WebP empieza con "RIFF" y un MP4 con el tamaño de la caja "ftyp": nunca con "QLE1".
 */
const MAGIC = Buffer.from("QLE1");
const SALT = 16;
export const HEADER = MAGIC.length + SALT;
export const CHUNK = 64 * 1024;
const TAG = 16;
const ENC_CHUNK = CHUNK + TAG;

let master: Buffer | undefined;
const masterKey = () => (master ??= Buffer.from(hkdfSync("sha256", dataKey(), Buffer.alloc(0), "qule-archivos-v1", 32)));
const fileKey = (salt: Buffer) => Buffer.from(hkdfSync("sha256", masterKey(), salt, "archivo", 32));

export const isEncryptedBlob = (buf: Uint8Array) =>
  buf.length >= HEADER && Buffer.from(buf.subarray(0, MAGIC.length)).equals(MAGIC);

function nonce(i: number) {
  const n = Buffer.alloc(12);
  n.writeUInt32BE(i, 8);
  return n;
}

/** Datos extra que firma cada pedazo: el encabezado y si es el último. */
const aad = (header: Buffer, last: boolean) => Buffer.concat([header, Buffer.from([last ? 1 : 0])]);

const chunkCount = (plainLength: number) => Math.max(1, Math.ceil(plainLength / CHUNK));

export function encryptBlob(plain: Buffer): Buffer {
  const salt = randomBytes(SALT);
  const header = Buffer.concat([MAGIC, salt]);
  const key = fileKey(salt);
  const n = chunkCount(plain.length);
  const parts: Buffer[] = [header];
  for (let i = 0; i < n; i++) {
    const c = createCipheriv("aes-256-gcm", key, nonce(i));
    c.setAAD(aad(header, i === n - 1));
    parts.push(c.update(plain.subarray(i * CHUNK, (i + 1) * CHUNK)), c.final(), c.getAuthTag());
  }
  return Buffer.concat(parts);
}

function decryptChunk(key: Buffer, header: Buffer, i: number, last: boolean, enc: Buffer): Buffer {
  if (enc.length < TAG) throw new Error("Archivo cifrado cortado");
  const d = createDecipheriv("aes-256-gcm", key, nonce(i));
  d.setAAD(aad(header, last));
  d.setAuthTag(enc.subarray(enc.length - TAG));
  return Buffer.concat([d.update(enc.subarray(0, enc.length - TAG)), d.final()]);
}

/** Descifra un archivo entero. Si no está cifrado (es de antes), lo devuelve igual. */
export function decryptBlob(stored: Buffer): Buffer {
  if (!isEncryptedBlob(stored)) return stored;
  const header = stored.subarray(0, HEADER);
  const key = fileKey(header.subarray(MAGIC.length));
  const body = stored.subarray(HEADER);
  const n = Math.max(1, Math.ceil(body.length / ENC_CHUNK));
  const out: Buffer[] = [];
  for (let i = 0; i < n; i++) out.push(decryptChunk(key, header, i, i === n - 1, body.subarray(i * ENC_CHUNK, (i + 1) * ENC_CHUNK)));
  return Buffer.concat(out);
}

/** Tamaño del contenido descifrado, sabiendo el tamaño del archivo cifrado. */
export function plainSize(encSize: number): number {
  const body = encSize - HEADER;
  return body - Math.max(1, Math.ceil(body / ENC_CHUNK)) * TAG;
}

/**
 * Lee del archivo cifrado solo lo necesario para los bytes [start, end] del contenido, y los descifra pedazo por
 * pedazo (no carga el video entero en memoria). `readRaw(from, to)` lee bytes del archivo guardado, ambos incluidos.
 */
export async function* decryptRange(
  header: Buffer,
  encSize: number,
  start: number,
  end: number,
  readRaw: (from: number, to: number) => Promise<AsyncIterable<Uint8Array>>,
): AsyncGenerator<Buffer> {
  const key = fileKey(header.subarray(MAGIC.length));
  const n = Math.max(1, Math.ceil((encSize - HEADER) / ENC_CHUNK));
  const first = Math.floor(start / CHUNK);
  const lastChunk = Math.floor(end / CHUNK);
  const from = HEADER + first * ENC_CHUNK;
  const to = Math.min(encSize, HEADER + (lastChunk + 1) * ENC_CHUNK) - 1;
  let i = first;
  let pending = Buffer.alloc(0);
  const emit = (enc: Buffer) => {
    const plain = decryptChunk(key, header, i, i === n - 1, enc);
    const lo = i === first ? start - first * CHUNK : 0;
    const hi = i === lastChunk ? end - lastChunk * CHUNK + 1 : plain.length;
    i++;
    return plain.subarray(lo, hi);
  };
  for await (const part of await readRaw(from, to)) {
    pending = pending.length ? Buffer.concat([pending, part]) : Buffer.from(part);
    while (pending.length >= ENC_CHUNK && i <= lastChunk) {
      yield emit(pending.subarray(0, ENC_CHUNK));
      pending = pending.subarray(ENC_CHUNK);
    }
  }
  if (i <= lastChunk) {
    if (i !== lastChunk || !pending.length) throw new Error("Archivo cifrado cortado");
    yield emit(pending);
  }
}
