import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../lib.js";

test("visitas al perfil y reacciones a mensajes", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "qule-actividad-"));
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
  const { db, closeDb, runMigrations, schema } = await import("../db/index.js");
  close = closeDb;
  await runMigrations();
  const { auth } = await import("../auth.js");
  const { premiumRoutes } = await import("./premium.js");
  const { socialRoutes } = await import("./social.js");
  const { toqueRoutes } = await import("./toques.js");
  const app = new Hono<AppEnv>();
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
  app.route("/api", premiumRoutes);
  app.route("/api", socialRoutes);
  app.route("/api", toqueRoutes);

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

  const [owner, visitor, other] = [await account("Ana"), await account("Luz"), await account("Sol")];

  await t.test("solo el historial de la cuenta muestra visitas visibles y del período elegido", async () => {
    const url = `/users/${owner.id}`;
    async function views(cookie = owner.cookie, days = "30") {
      const response = await request(`/me/views?days=${days}`, cookie);
      assert.equal(response.status, 200);
      return response.json() as Promise<{ id: string; viewedAt: string }[]>;
    }
    assert.equal((await request(url, visitor.cookie)).status, 200);
    assert.deepEqual(await views(), []);
    for (const cookie of [owner.cookie, visitor.cookie, visitor.cookie]) {
      assert.equal((await request(`${url}/view`, cookie, "POST")).status, 204);
    }
    assert.deepEqual((await views()).map(({ id }) => id), [visitor.id]);
    assert.deepEqual(await views(other.cookie), []);

    const viewedAt = new Date(Date.now() - 2 * 86_400_000);
    await db.update(schema.profileView).set({ viewedAt }).where(eq(schema.profileView.viewerId, visitor.id));
    assert.deepEqual(await views(owner.cookie, "1"), []);
    assert.equal((await views(owner.cookie, "7"))[0]?.viewedAt, viewedAt.toISOString());
    await db.update(schema.profile).set({ incognito: true }).where(eq(schema.profile.userId, visitor.id));
    assert.equal((await request(`${url}/view`, visitor.cookie, "POST")).status, 204);
    assert.deepEqual(await views(), []);
    await db.update(schema.profile).set({ incognito: false }).where(eq(schema.profile.userId, visitor.id));
    assert.equal((await views())[0]?.viewedAt, viewedAt.toISOString());
    await db.insert(schema.block).values({ blockerId: owner.id, blockedId: visitor.id });
    assert.equal((await request(`${url}/view`, visitor.cookie, "POST")).status, 404);
    assert.deepEqual(await views(), []);
    await db.delete(schema.block).where(eq(schema.block.blockerId, owner.id));
  });

  await t.test("repetir una reacción explícita conserva su estado y mantiene el acceso privado", async () => {
    const [userA, userB] = [owner.id, visitor.id].sort();
    await db.insert(schema.conversation).values({ id: "chat", userA, userB });
    await db.insert(schema.directMessage).values({ id: "mensaje", conversationId: "chat", senderId: owner.id, body: "hola" });
    const url = "/reactions/dm/mensaje";
    const outsider = await request(url, other.cookie, "PUT", { kind: "fuego", mode: "set" });
    assert.equal(outsider.status, 404);
    for (const kind of ["fuego", "fuego", "hola", null, null]) {
      const response = await request(url, visitor.cookie, "PUT", { kind, mode: "set" });
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json() as { reactions: unknown[] }).reactions, kind ? [{ kind, by: [visitor.id] }] : []);
    }
    await request(url, visitor.cookie, "PUT", { kind: "fuego" });
    const legacyToggle = await request(url, visitor.cookie, "PUT", { kind: "fuego" });
    assert.deepEqual((await legacyToggle.json() as { reactions: unknown[] }).reactions, []);
  });
});
