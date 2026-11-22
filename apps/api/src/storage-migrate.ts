/**
 * Sube al bucket (STORAGE=s3) las fotos y los videos que ya estaban en el disco. Se puede correr las veces que haga
 * falta: lo que ya está en el bucket se saltea. No borra nada del disco; eso se hace a mano cuando todo anduvo.
 * Las miniaturas no se suben: se vuelven a generar solas la primera vez que alguien las pide.
 *
 * En producción: docker exec mortero-app node --import tsx src/storage-migrate.ts
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "./env.js";
import { createS3 } from "./s3.js";

if (env.STORAGE !== "s3" || !env.S3_ENDPOINT || !env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
  console.error("Configurá STORAGE=s3 y los cinco S3_* antes de migrar (ver docs/DEPLOY.md).");
  process.exit(1);
}

const s3 = createS3({
  endpoint: env.S3_ENDPOINT, bucket: env.S3_BUCKET, region: env.S3_REGION,
  accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY,
});
const dir = path.join(env.DATA_DIR, "uploads");
const files = (await readdir(dir, { withFileTypes: true })).filter((f) => f.isFile() && /\.(webp|mp4)$/.test(f.name));

let uploaded = 0;
let skipped = 0;
for (const f of files) {
  if ((await s3.size(f.name)) != null) {
    skipped++;
    continue;
  }
  await s3.put(f.name, await readFile(path.join(dir, f.name)), f.name.endsWith(".mp4") ? "video/mp4" : "image/webp");
  uploaded++;
  if (uploaded % 50 === 0) console.log(`${uploaded} subidos…`);
}
console.log(`Listo: ${uploaded} subidos, ${skipped} ya estaban en el bucket, ${files.length} en total.`);
