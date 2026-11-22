import assert from "node:assert/strict";
import { test } from "node:test";
import { signV4 } from "./s3.js";

// Ejemplo "GET Object" de la documentación de AWS (Signature V4 para S3), con sus claves de ejemplo.
test("la firma V4 coincide con el ejemplo de la documentación de AWS", () => {
  const auth = signV4({
    method: "GET",
    url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
    headers: {
      host: "examplebucket.s3.amazonaws.com",
      range: "bytes=0-9",
      "x-amz-content-sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "x-amz-date": "20130524T000000Z",
    },
    region: "us-east-1",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  });
  assert.equal(
    auth,
    "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, "
      + "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, "
      + "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
  );
});

// Un S3 de mentira en memoria: alcanza para probar que el cliente sube, lee, pide pedazos y borra.
test("el cliente sube, lee, pide un pedazo y borra", async () => {
  const { createServer } = await import("node:http");
  const { createS3 } = await import("./s3.js");
  const store = new Map<string, Buffer>();
  const seen: string[] = [];
  const server = createServer(async (req, res) => {
    seen.push(`${req.method} ${req.url} ${String(req.headers.authorization).startsWith("AWS4-HMAC-SHA256") ? "firmado" : "sin firma"}`);
    const key = req.url!;
    if (req.method === "PUT") {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      store.set(key, Buffer.concat(chunks));
      return res.end();
    }
    const data = store.get(key);
    if (!data) { res.statusCode = 404; return res.end(); }
    if (req.method === "DELETE") { store.delete(key); res.statusCode = 204; return res.end(); }
    if (req.method === "HEAD") { res.setHeader("content-length", data.length); return res.end(); }
    const m = /^bytes=(\d+)-(\d+)$/.exec(String(req.headers.range ?? ""));
    if (m) { res.statusCode = 206; return res.end(data.subarray(Number(m[1]), Number(m[2]) + 1)); }
    res.end(data);
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  try {
    const s3 = createS3({ endpoint: `http://127.0.0.1:${port}`, bucket: "fotos", region: "auto", accessKeyId: "a", secretAccessKey: "b" });
    await s3.put("thumbs/x.webp", Buffer.from("0123456789"), "image/webp");
    assert.equal((await s3.get("thumbs/x.webp"))?.toString(), "0123456789");
    assert.equal(await s3.size("thumbs/x.webp"), 10);
    const part = Buffer.from(await new Response(await s3.stream("thumbs/x.webp", 2, 5)).arrayBuffer()).toString();
    assert.equal(part, "2345");
    await s3.del("thumbs/x.webp");
    assert.equal(await s3.get("thumbs/x.webp"), null);
    assert.equal(await s3.size("thumbs/x.webp"), null);
    assert.ok(seen.every((l) => l.endsWith("firmado")));
    assert.ok(seen[0].startsWith("PUT /fotos/thumbs/x.webp"));
  } finally {
    server.close();
  }
});
