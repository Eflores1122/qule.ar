import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Hono } from "hono";
import type { AppEnv } from "./lib.js";

test("reportes propios", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "qule-mis-reportes-"));
  const origin = "http://localhost:3001";
  process.env.DATABASE_URL = "";
  process.env.DATA_DIR = dataDir;
  process.env.NODE_ENV = "test";
  process.env.APP_URL = origin;
  process.env.SMTP_URL = "";
  process.env.BETTER_AUTH_SECRET = "clave-local-de-prueba-actividad-qule";
  let close: (() => Promise<void>) | undefined;
  t.after(async () => {
    try {
      await close?.();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
  t.mock.method(console, "log", () => {});
  const { db, closeDb, runMigrations, schema } = await import("./db/index.js");
  close = closeDb;
  await runMigrations();
  const { auth } = await import("./auth.js");
  const { adminRoutes } = await import("./routes/admin.js");
  const { meRoutes } = await import("./routes/me.js");
  const { env } = await import("./env.js");
  const app = new Hono<AppEnv>();
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
  app.route("/api", adminRoutes);
  app.route("/api", meRoutes);

  function request(route: string, cookie?: string, method = "GET", json?: unknown) {
    const headers = new Headers({ origin });
    if (cookie) headers.set("cookie", cookie);
    if (json !== undefined) headers.set("content-type", "application/json");
    return app.request(new URL(`/api${route}`, origin), { method, headers, body: JSON.stringify(json) });
  }

  async function account(name: string) {
    const response = await request("/auth/sign-up/email", undefined, "POST", {
      name, email: `${name.toLowerCase()}@example.test`, password: "una frase sintética para esta prueba",
    });
    assert.equal(response.status, 200);
    const { user } = await response.json() as { user: { id: string } };
    const cookie = response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
    assert.ok(cookie);
    await db.insert(schema.profile).values({ userId: user.id, displayName: name, birthdate: "1990-01-01" });
    return { id: user.id, cookie };
  }

  const owner = await account("Ana");
  const other = await account("Luz");
  const admin = await account("Sol");
  env.ADMIN_USER_IDS.push(admin.id);
  await db.insert(schema.report).values([
    { id: "propio", reporterId: owner.id, targetUserId: other.id, reason: "spam", details: "texto privado" },
    { id: "ajeno", reporterId: other.id, targetUserId: owner.id, reason: "otro" },
  ]);
  const read = async (cookie: string) => {
    const res = await request("/me/reports", cookie);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    return await res.json() as { id: string; reason: string; createdAt: string; reviewedAt: string | null }[];
  };
  assert.equal((await request("/me/reports")).status, 401);
  const [mine] = await read(owner.cookie);
  assert.equal(mine.id, "propio");
  assert.deepEqual(Object.keys(mine).sort(), ["createdAt", "id", "reason", "reviewedAt"]);
  assert.equal(mine.reviewedAt, null);
  assert.equal((await read(other.cookie))[0]?.id, "ajeno");
  assert.equal((await request("/admin/reports/propio/dismiss", admin.cookie, "POST")).status, 200);
  assert.ok((await read(owner.cookie))[0]?.reviewedAt);
  assert.equal((await read(other.cookie))[0]?.reviewedAt, null);
});
