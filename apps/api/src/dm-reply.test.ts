import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Hono } from "hono";
import sharp from "sharp";
import type { AppEnv } from "./lib.js";

const origin = "http://localhost:3001";

type Account = { id: string; cookie: string };
type Reply = { id: string; authorName: string | null; body: string | null };
type Dm = {
  id: string;
  conversationId: string;
  senderId: string;
  kind: "text" | "photo" | "album";
  body: string | null;
  photo: string | null;
  expiring: boolean;
  opened: boolean;
  readAt: string | null;
  createdAt: string;
  replyTo: Reply | null;
  reactions: { kind: string; by: string[] }[];
};

test("citas en el chat privado", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "qule-dm-reply-"));
  process.env.DATABASE_URL = "";
  process.env.DATA_DIR = dataDir;
  process.env.NODE_ENV = "test";
  process.env.APP_URL = origin;
  process.env.SMTP_URL = "";
  process.env.VAPID_PUBLIC_KEY = "";
  process.env.VAPID_PRIVATE_KEY = "";
  process.env.BETTER_AUTH_SECRET = "secreto-de-prueba-para-citas-privadas";
  process.env.STORAGE = "";

  let closeDatabase: (() => Promise<void>) | undefined;
  t.after(async () => {
    try {
      await closeDatabase?.();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  t.mock.method(console, "log", () => {});

  const { db, closeDb, runMigrations, schema } = await import("./db/index.js");
  const { auth } = await import("./auth.js");
  const { socialRoutes } = await import("./routes/social.js");
  closeDatabase = closeDb;

  await runMigrations();

  const app = new Hono<AppEnv>();
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
  app.route("/api", socialRoutes);

  function request(url: string, account?: Account, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("origin", origin);
    if (account) headers.set("cookie", account.cookie);
    return app.request(new URL(url, origin), { ...init, headers });
  }

  function json(method: string, body: unknown): RequestInit {
    return {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    };
  }

  async function account(name: string): Promise<Account> {
    const res = await request("/api/auth/sign-up/email", undefined, json("POST", {
      name,
      email: `${name.toLowerCase()}@example.test`,
      password: "una frase sintética de prueba",
    }));
    assert.equal(res.status, 200, `No se pudo crear la cuenta ${name}`);

    const data = (await res.json()) as { user: { id: string } };
    const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    assert.ok(cookie, `No se pudo autenticar la cuenta ${name}`);
    await db.insert(schema.profile).values({
      userId: data.user.id,
      displayName: name,
      birthdate: "1990-01-01",
    });
    return { id: data.user.id, cookie };
  }

  async function conversation(from: Account, to: Account): Promise<string> {
    const res = await request("/api/conversations", from, json("POST", { userId: to.id }));
    assert.equal(res.status, 200, "No se pudo crear la conversación");
    return ((await res.json()) as { id: string }).id;
  }

  async function sendText(
    from: Account,
    conversationId: string,
    body: string,
    replyToId?: string,
  ) {
    const res = await request(
      `/api/conversations/${conversationId}/messages`,
      from,
      json("POST", { body, ...(replyToId ? { replyToId } : {}) }),
    );
    return { res, data: (await res.json()) as Dm & { message?: string } };
  }

  async function messages(account: Account, conversationId: string): Promise<Dm[]> {
    const res = await request(`/api/conversations/${conversationId}/messages`, account);
    assert.equal(res.status, 200, "No se pudieron leer los mensajes");
    return ((await res.json()) as { messages: Dm[] }).messages;
  }

  async function insertOriginal(opts: {
    conversationId: string;
    senderId: string;
    kind: "text" | "photo" | "album";
    body?: string | null;
    photoKey?: string | null;
    expiring?: boolean;
  }): Promise<string> {
    const id = randomUUID();
    await db.insert(schema.directMessage).values({
      id,
      conversationId: opts.conversationId,
      senderId: opts.senderId,
      kind: opts.kind,
      body: opts.body ?? null,
      photoKey: opts.photoKey ?? null,
      expiring: opts.expiring ?? false,
      createdAt: new Date(),
    });
    return id;
  }

  const ana = await account("Ana");
  const beto = await account("Beto");
  const caro = await account("Caro");
  const anaBeto = await conversation(ana, beto);
  const betoCaro = await conversation(beto, caro);

  await t.test("cita un mensaje de la misma conversación y la conserva al recargar", async () => {
    const original = await sendText(beto, anaBeto, "¿Nos vemos el sábado?");
    assert.equal(original.res.status, 200);
    assert.equal(original.data.replyTo, null);

    const reply = await sendText(ana, anaBeto, "Dale, llevo las entradas.", original.data.id);
    assert.equal(reply.res.status, 200);
    assert.equal(reply.data.body, "Dale, llevo las entradas.");
    assert.equal(reply.data.senderId, ana.id);
    assert.equal(reply.data.conversationId, anaBeto);
    assert.deepEqual(reply.data.replyTo, {
      id: original.data.id,
      authorName: "Beto",
      body: "¿Nos vemos el sábado?",
    });

    const listed = await messages(beto, anaBeto);
    const found = listed.find((m) => m.id === reply.data.id);
    assert.ok(found);
    assert.equal(found.body, "Dale, llevo las entradas.");
    assert.deepEqual(found.replyTo, reply.data.replyTo);
  });

  await t.test("rechaza citar un mensaje de otra conversación", async () => {
    const foreign = await sendText(caro, betoCaro, "Mensaje de la otra charla");
    assert.equal(foreign.res.status, 200);

    const beforeAnaBeto = (await messages(ana, anaBeto)).length;
    const beforeBetoCaro = (await messages(beto, betoCaro)).length;

    // Beto participa de las dos conversaciones: si la validación solo mirara
    // "alguna conversación mía", este intento pasaría.
    const res = await request(
      `/api/conversations/${anaBeto}/messages`,
      beto,
      json("POST", { body: "No debería entrar", replyToId: foreign.data.id }),
    );

    assert.equal(res.status, 400);
    assert.equal(await res.text(), "Ese mensaje ya no está");
    assert.equal((await messages(ana, anaBeto)).length, beforeAnaBeto);
    assert.equal((await messages(beto, betoCaro)).length, beforeBetoCaro);
  });

  await t.test("rechaza un replyToId inexistente", async () => {
    const before = (await messages(ana, anaBeto)).length;
    const res = await request(
      `/api/conversations/${anaBeto}/messages`,
      ana,
      json("POST", { body: "Huérfana", replyToId: randomUUID() }),
    );

    assert.equal(res.status, 400);
    assert.equal(await res.text(), "Ese mensaje ya no está");
    assert.equal((await messages(ana, anaBeto)).length, before);
  });

  await t.test("no deja leer ni escribir a un no participante", async () => {
    const anchor = await sendText(ana, anaBeto, "Mensaje para el intento de Caro");
    assert.equal(anchor.res.status, 200);
    const before = (await messages(ana, anaBeto)).length;

    const getRes = await request(`/api/conversations/${anaBeto}/messages`, caro);
    assert.equal(getRes.status, 404);

    const postRes = await request(
      `/api/conversations/${anaBeto}/messages`,
      caro,
      json("POST", { body: "No debería entrar", replyToId: anchor.data.id }),
    );
    assert.equal(postRes.status, 404);
    assert.equal((await messages(ana, anaBeto)).length, before);
  });

  await t.test("no filtra una cita ajena guardada directamente", async () => {
    const foreign = await sendText(caro, betoCaro, "Secreto de la otra charla");
    assert.equal(foreign.res.status, 200);

    const crossId = randomUUID();
    await db.insert(schema.directMessage).values({
      id: crossId,
      conversationId: anaBeto,
      senderId: ana.id,
      kind: "text",
      body: "Cita cruzada guardada a mano",
      replyToId: foreign.data.id,
      createdAt: new Date(),
    });

    const found = (await messages(ana, anaBeto)).find((m) => m.id === crossId);
    assert.ok(found);
    assert.equal(found.body, "Cita cruzada guardada a mano");
    assert.deepEqual(found.replyTo, {
      id: foreign.data.id,
      authorName: null,
      body: null,
    });
    assert.ok(!JSON.stringify(found).includes("Secreto de la otra charla"));
  });

  await t.test("permite responder a un mensaje propio", async () => {
    const own = await sendText(ana, anaBeto, "Mensaje propio");
    assert.equal(own.res.status, 200);

    const reply = await sendText(ana, anaBeto, "Me respondo", own.data.id);
    assert.equal(reply.res.status, 200);
    assert.deepEqual(reply.data.replyTo, {
      id: own.data.id,
      authorName: "Ana",
      body: "Mensaje propio",
    });
  });

  await t.test("muestra Mensaje borrado cuando el original ya no está", async () => {
    const original = await sendText(beto, anaBeto, "Este mensaje se va a borrar");
    assert.equal(original.res.status, 200);

    const reply = await sendText(ana, anaBeto, "Te respondo antes de que desaparezca", original.data.id);
    assert.equal(reply.res.status, 200);

    const deleted = await request(
      `/api/conversations/${anaBeto}/messages/${original.data.id}`,
      beto,
      { method: "DELETE" },
    );
    assert.equal(deleted.status, 200);

    const expected = { id: original.data.id, authorName: null, body: null };
    for (let i = 0; i < 2; i++) {
      const found = (await messages(ana, anaBeto)).find((m) => m.id === reply.data.id);
      assert.ok(found);
      assert.deepEqual(found.replyTo, expected);
    }
  });

  await t.test("resume fotos, temporales y álbumes sin filtrar la URL", async () => {
    const photo = await insertOriginal({
      conversationId: anaBeto,
      senderId: beto.id,
      kind: "photo",
      photoKey: "foto-prueba.png",
    });
    const temporal = await insertOriginal({
      conversationId: anaBeto,
      senderId: beto.id,
      kind: "photo",
      photoKey: "temporal-prueba.png",
      expiring: true,
    });
    const album = await insertOriginal({
      conversationId: anaBeto,
      senderId: beto.id,
      kind: "album",
      body: "Verano",
    });
    const longText = await insertOriginal({
      conversationId: anaBeto,
      senderId: beto.id,
      kind: "text",
      body: "x".repeat(200),
    });

    const cases = [
      { id: photo, expected: "Foto", forbidden: "foto-prueba.png" },
      { id: temporal, expected: "Foto temporal", forbidden: "temporal-prueba.png" },
      { id: album, expected: "Álbum privado · Verano", forbidden: "/api/files/" },
      { id: longText, expected: "x".repeat(160), forbidden: "x".repeat(161) },
    ];

    for (const item of cases) {
      const reply = await sendText(ana, anaBeto, `Respuesta ${item.expected}`, item.id);
      assert.equal(reply.res.status, 200);
      assert.deepEqual(reply.data.replyTo, {
        id: item.id,
        authorName: "Beto",
        body: item.expected,
      });
      const serialized = JSON.stringify(reply.data.replyTo);
      assert.ok(!serialized.includes("/api/files/"));
      assert.ok(!serialized.includes(item.forbidden));
    }
  });

  await t.test("acepta una cita al mandar una foto", async () => {
    const original = await sendText(beto, anaBeto, "Mandame una foto");
    assert.equal(original.res.status, 200);

    const png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: { r: 255, g: 0, b: 0 } },
    }).png().toBuffer();
    const form = new FormData();
    form.append("file", new File([png], "prueba.png", { type: "image/png" }));
    form.append("replyToId", original.data.id);

    const res = await request(`/api/conversations/${anaBeto}/messages`, ana, {
      method: "POST",
      body: form,
    });
    assert.equal(res.status, 200);

    const data = (await res.json()) as Dm;
    assert.equal(data.kind, "photo");
    assert.deepEqual(data.replyTo, {
      id: original.data.id,
      authorName: "Beto",
      body: "Mandame una foto",
    });

    const found = (await messages(ana, anaBeto)).find((m) => m.id === data.id);
    assert.ok(found);
    assert.equal(found.kind, "photo");
    assert.deepEqual(found.replyTo, data.replyTo);

    const uploadsDir = path.join(dataDir, "uploads");
    const beforeUploads = (await readdir(uploadsDir).catch(() => [])).sort();
    const badForm = new FormData();
    badForm.append("file", new File([png], "ajena.png", { type: "image/png" }));
    badForm.append("replyToId", randomUUID());
    const badRes = await request(`/api/conversations/${anaBeto}/messages`, ana, {
      method: "POST",
      body: badForm,
    });
    assert.equal(badRes.status, 400);
    assert.equal(await badRes.text(), "Ese mensaje ya no está");
    const afterUploads = (await readdir(uploadsDir).catch(() => [])).sort();
    assert.deepEqual(afterUploads, beforeUploads);
  });

  await t.test("un mensaje viejo sin cita se serializa con replyTo null", async () => {
    const legacy = await insertOriginal({
      conversationId: anaBeto,
      senderId: beto.id,
      kind: "text",
      body: "Mensaje anterior a las citas",
    });
    const listed = await messages(ana, anaBeto);
    const found = listed.find((m) => m.id === legacy);
    assert.ok(found);
    assert.equal(found.replyTo, null);
  });
});
