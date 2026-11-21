import { createHash, createHmac } from "node:crypto";

/**
 * Cliente mínimo para almacenamiento compatible con S3 (Cloudflare R2, Backblaze B2, MinIO, AWS S3).
 * Firma los pedidos con AWS Signature V4 usando node:crypto, así no sumamos una librería grande por cuatro operaciones.
 * Usa URLs con el bucket en el camino (path-style), que funcionan en todos esos proveedores.
 */
export type S3Config = { endpoint: string; bucket: string; region: string; accessKeyId: string; secretAccessKey: string };

const sha256 = (data: string) => createHash("sha256").update(data).digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();

/**
 * Firma un pedido con AWS Signature V4. Firma todos los encabezados que se le pasan (tienen que incluir host,
 * x-amz-date y x-amz-content-sha256). Separada del cliente para poder probarla con los ejemplos de la documentación.
 */
export function signV4(p: {
  method: string; url: URL; headers: Record<string, string>; region: string; accessKeyId: string; secretAccessKey: string;
}): string {
  const amzDate = p.headers["x-amz-date"];
  const date = amzDate.slice(0, 8);
  const names = Object.keys(p.headers).map((n) => n.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(p.headers).map(([k, v]) => [k.toLowerCase(), v.trim()]));
  const canonical = [
    p.method, p.url.pathname, "",
    ...names.map((n) => `${n}:${lower[n]}`), "",
    names.join(";"), lower["x-amz-content-sha256"],
  ].join("\n");
  const scope = `${date}/${p.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${p.secretAccessKey}`, date), p.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(toSign).digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${p.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`;
}

export function createS3(cfg: S3Config) {
  const base = new URL(cfg.endpoint.replace(/\/+$/, ""));

  function sign(method: string, key: string, extra: Record<string, string> = {}) {
    const url = new URL(`${base.pathname.replace(/\/$/, "")}/${encodeURIComponent(cfg.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`, base);
    const now = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    // El contenido no se firma (UNSIGNED-PAYLOAD): va por HTTPS y así no hay que leerlo dos veces
    const signed = { host: url.host, "x-amz-content-sha256": "UNSIGNED-PAYLOAD", "x-amz-date": now };
    const authorization = signV4({ method, url, headers: signed, region: cfg.region, accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey });
    const { host: _host, ...rest } = signed;
    return { url, headers: { ...rest, authorization, ...extra } };
  }

  async function request(method: string, key: string, init: { body?: Buffer; headers?: Record<string, string> } = {}) {
    const { url, headers } = sign(method, key, init.headers);
    return fetch(url, { method, headers, body: init.body ? new Uint8Array(init.body) : undefined });
  }

  return {
    async put(key: string, body: Buffer, contentType: string) {
      const r = await request("PUT", key, { body, headers: { "content-type": contentType } });
      if (!r.ok) throw new Error(`S3 PUT ${key}: ${r.status}`);
    },
    /** null si no existe. */
    async get(key: string): Promise<Buffer | null> {
      const r = await request("GET", key);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`S3 GET ${key}: ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    },
    /** Tamaño en bytes, o null si no existe. */
    async size(key: string): Promise<number | null> {
      const r = await request("HEAD", key);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`S3 HEAD ${key}: ${r.status}`);
      return Number(r.headers.get("content-length") ?? 0);
    },
    /** Un pedazo del archivo (para videos por partes). */
    async stream(key: string, start: number, end: number): Promise<ReadableStream> {
      const r = await request("GET", key, { headers: { range: `bytes=${start}-${end}` } });
      if (!r.ok || !r.body) throw new Error(`S3 GET ${key}: ${r.status}`);
      return r.body;
    },
    async del(key: string) {
      const r = await request("DELETE", key);
      if (!r.ok && r.status !== 404) throw new Error(`S3 DELETE ${key}: ${r.status}`);
    },
  };
}

export type S3Client = ReturnType<typeof createS3>;
