import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

test("nextSlot con las reglas por defecto", async (t) => {
  // Cada archivo de pruebas corre en su propio proceso. Usamos una base descartable.
  const dataDir = await mkdtemp(path.join(tmpdir(), "qule-antispam-"));
  process.env.DATABASE_URL = "";
  process.env.DATA_DIR = dataDir;
  process.env.NODE_ENV = "test";
  let close: (() => Promise<void>) | undefined;
  t.after(async () => {
    try {
      await close?.();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  const { db, closeDb, runMigrations } = await import("./db/index.js");
  const { DEFAULT_SPAM_RULES, group, groupMessage, user } = await import("./db/schema.js");
  close = closeDb;
  const { nextSlot } = await import("./antispam.js");
  await runMigrations();
  await db.insert(user).values([
    { id: "ana", name: "Ana", email: "ana@example.test" },
    { id: "luz", name: "Luz", email: "luz@example.test" },
  ]);
  await db.insert(group).values([
    { id: "grupo", name: "Grupo de prueba" },
    { id: "otro", name: "Otro grupo" },
  ]);
  t.beforeEach(async () => {
    await db.delete(groupMessage);
  });

  const now = new Date("2026-01-15T12:00:00Z");
  const at = (secondsFromNow: number) => new Date(now.getTime() + secondsFromNow * 1000);
  const slot = (userCreatedAt = at(-48 * 3600), currentTime = now) =>
    nextSlot({ groupId: "grupo", userId: "ana", userCreatedAt, rules: DEFAULT_SPAM_RULES, now: currentTime });

  type Message = {
    offset: number;
    status?: "published" | "queued" | "cancelled" | "deleted";
    userId?: string;
    groupId?: string;
  };

  async function addMessages(...messages: Message[]) {
    await db.insert(groupMessage).values(messages.map((message) => ({
      id: randomUUID(),
      groupId: message.groupId ?? "grupo",
      userId: message.userId ?? "ana",
      status: message.status ?? "published",
      body: "Mensaje de prueba",
      scheduledAt: at(message.offset),
    })));
  }

  await t.test("permite los primeros dos mensajes de una ráfaga", async () => {
    const immediate = { ok: true, at: now, intervalSeconds: 60, reasons: [] };
    assert.deepEqual(await slot(), immediate);
    await addMessages({ offset: -1 });
    assert.deepEqual(await slot(), immediate);
  });

  await t.test("programa el siguiente mensaje y vuelve a habilitarlo al vencer el intervalo", async () => {
    await addMessages({ offset: -30 }, { offset: -15 });
    const expected = { ok: true, at: at(90), intervalSeconds: 60, reasons: [] };
    assert.deepEqual(await slot(), expected);
    assert.deepEqual(await slot(undefined, at(91)), { ...expected, at: at(91) });
  });

  await t.test("la ráfaga cuenta los mensajes en cola y borrados; descarta los cancelados", async () => {
    await addMessages(
      { offset: 45, status: "queued" },
      { offset: -15, status: "deleted" },
      { offset: 30, status: "cancelled" },
    );
    assert.deepEqual(await slot(), { ok: true, at: at(105), intervalSeconds: 60, reasons: [] });
  });

  await t.test("duplica el intervalo con tres de los últimos veinte mensajes publicados", async () => {
    await addMessages({ offset: -30 }, { offset: -15 });
    assert.deepEqual(await slot(), { ok: true, at: at(90), intervalSeconds: 60, reasons: [] });
    await addMessages({ offset: -31 });
    assert.deepEqual(await slot(), {
      ok: true, at: at(210), intervalSeconds: 120, reasons: ["hablaste mucho últimamente"],
    });
  });

  await t.test("excluye publicaciones anteriores a la ventana de rotación", async () => {
    await addMessages(
      { offset: -45 },
      { offset: -30 },
      { offset: -15 },
      ...Array.from({ length: 18 }, (_, i) => ({ offset: -1 - i * 2, userId: "luz" })),
    );
    assert.deepEqual(await slot(), { ok: true, at: at(90), intervalSeconds: 60, reasons: [] });
  });

  await t.test("triplica el intervalo de una cuenta nueva hasta que cumple 24 horas", async () => {
    await addMessages({ offset: -45 }, { offset: -15 });
    assert.deepEqual(await slot(at(-24 * 3600 + 1)), {
      ok: true, at: at(315), intervalSeconds: 180, reasons: ["cuenta nueva"],
    });
    assert.deepEqual(await slot(at(-24 * 3600)), { ok: true, at: at(75), intervalSeconds: 60, reasons: [] });
  });

  await t.test("combina los intervalos de cuenta nueva y rotación", async () => {
    await addMessages({ offset: -45 }, { offset: -30 }, { offset: -15 });
    assert.deepEqual(await slot(at(-3600)), {
      ok: true, at: at(690), intervalSeconds: 360, reasons: ["cuenta nueva", "hablaste mucho últimamente"],
    });
  });

  await t.test("rechaza un cuarto mensaje en cola de la misma persona en el mismo grupo", async () => {
    await addMessages(
      { offset: 60, status: "queued" },
      { offset: 120, status: "queued" },
      { offset: 180, status: "queued", userId: "luz" },
      { offset: 180, status: "queued", groupId: "otro" },
    );
    assert.equal((await slot()).ok, true);
    await addMessages({ offset: 180, status: "queued" });
    assert.equal((await slot()).ok, false);
  });
});
