import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { eq, sql } from "drizzle-orm";
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
  process.env.ADMIN_EMAILS = "ana@example.test";
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
  const { adminRoutes } = await import("./admin.js");
  const { encryptLegacySensitiveText } = await import("../db/sensitive.js");
  const app = new Hono<AppEnv>();
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
  app.route("/api", premiumRoutes);
  app.route("/api", socialRoutes);
  app.route("/api", toqueRoutes);
  app.route("/api", adminRoutes);

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

  await t.test("cifra mensajes y pruebas, y solo permite desenviar al remitente dentro de dos minutos", async () => {
    await db.insert(schema.directMessage).values({
      id: "antiguo", conversationId: "chat", senderId: owner.id, body: "Contenido anterior",
      createdAt: new Date(Date.now() - 121_000),
    });
    const [raw] = await db.select({ stored: sql<string>`"body"` }).from(schema.directMessage).where(eq(schema.directMessage.id, "antiguo"));
    assert.match(raw.stored, /^v1:/);
    const reportResponse = await request("/reports", visitor.cookie, "POST", {
      userId: owner.id, reason: "suplantación de identidad", details: "Un detalle para moderación", messageId: "mensaje", messageKind: "dm",
    });
    assert.equal(reportResponse.status, 200);
    const [evidence] = await db.select({
      details: sql<string>`"details"`, body: sql<string>`"message_body"`,
    }).from(schema.report).where(eq(schema.report.reason, "suplantación de identidad"));
    assert.match(evidence.details, /^v1:/);
    assert.match(evidence.body, /^v1:/);
    assert.equal((await db.select().from(schema.restrictedEmail)).length, 0);

    await db.execute(sql`UPDATE "direct_message" SET "body" = 'legacy:v1: texto de una versión anterior' WHERE id = 'antiguo'`);
    await encryptLegacySensitiveText(db);
    const [legacy] = await db.select({ body: schema.directMessage.body, stored: sql<string>`"body"` })
      .from(schema.directMessage).where(eq(schema.directMessage.id, "antiguo"));
    assert.equal(legacy.body, "v1: texto de una versión anterior");
    assert.match(legacy.stored, /^v1:/);

    assert.equal((await request("/conversations/chat/messages/mensaje", visitor.cookie, "DELETE")).status, 404);
    assert.equal((await request("/conversations/chat/messages/antiguo", owner.cookie, "DELETE")).status, 409);
    assert.equal((await request("/conversations/chat/messages/mensaje", owner.cookie, "DELETE")).status, 200);
    const response = await request("/conversations/chat/messages", visitor.cookie);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json() as { messages: { id: string }[] }).messages.map(({ id }) => id), ["antiguo"]);
    const [retained] = await db.select({ body: schema.report.messageBody }).from(schema.report)
      .where(eq(schema.report.reason, "suplantación de identidad"));
    assert.equal(retained.body, "hola");
  });

  await t.test("una suspensión confirmada impide volver a registrarse con el mismo correo", async () => {
    await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, owner.id));
    const path = `/admin/users/${other.id}`;
    assert.equal((await request(`${path}/suspend`, visitor.cookie, "POST", { reason: "Motivo de prueba" })).status, 403);
    assert.equal((await request(`${path}/suspend`, owner.cookie, "POST", { reason: "Motivo de prueba" })).status, 200);
    const [restriction] = await db.select().from(schema.restrictedEmail).where(eq(schema.restrictedEmail.subjectId, other.id));
    assert.match(restriction.fingerprint, /^[a-f0-9]{64}$/);
    await db.delete(schema.user).where(eq(schema.user.id, other.id));
    const newAccount = { name: "Sol", email: "SOL@example.test", password: "una frase sintética para esta prueba" };
    assert.equal((await request("/auth/sign-up/email", undefined, "POST", newAccount)).status, 403);
    assert.equal((await request(`${path}/unsuspend`, owner.cookie, "POST")).status, 200);
    assert.equal((await request("/auth/sign-up/email", undefined, "POST", newAccount)).status, 200);
  });
});
