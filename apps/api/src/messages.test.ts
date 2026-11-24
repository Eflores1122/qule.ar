import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { DB } from "./db/index.js";

test("mensajes privados y copias de reportes: se guardan cifrados y lo viejo se cifra en tandas", async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  process.env.DATA_KEY ??= randomBytes(32).toString("base64");
  const schema = await import("./db/schema.js");
  const { encryptLegacyMessages } = await import("./db/messages.js");
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle/", import.meta.url)) });

  await db.insert(schema.user).values([
    { id: "ana", name: "Ana", email: "ana@example.test" },
    { id: "beto", name: "Beto", email: "beto@example.test" },
  ]);
  await db.insert(schema.conversation).values({ id: "c", userA: "ana", userB: "beto" });

  // Mensajes de antes del cifrado, escritos crudos. Uno empieza con "v1:" porque así lo escribió alguien.
  await client.exec(`
    INSERT INTO "direct_message" ("id", "conversation_id", "sender_id", "body") VALUES
      ('m1', 'c', 'ana', 'hola, ¿cómo va?'),
      ('m2', 'c', 'beto', 'v1:hola'),
      ('m3', 'c', 'ana', NULL);
    INSERT INTO "report" ("id", "reporter_id", "target_user_id", "reason", "message_body")
      VALUES ('r1', 'beto', 'ana', 'acoso', 'texto reportado');
  `);
  // Uno nuevo, escrito por la app: ya se guarda cifrado
  await db.insert(schema.directMessage).values({ id: "m4", conversationId: "c", senderId: "beto", body: "mensaje nuevo" });

  const raw = async () => Object.fromEntries((await client.query<{ id: string; body: string | null }>(
    `SELECT "id", "body" FROM "direct_message" ORDER BY "id"`,
  )).rows.map((r) => [r.id, r.body]));
  const read = async () => Object.fromEntries((await db.select({ id: schema.directMessage.id, body: schema.directMessage.body })
    .from(schema.directMessage)).map((r) => [r.id, r.body]));
  const expected = { m1: "hola, ¿cómo va?", m2: "v1:hola", m3: null, m4: "mensaje nuevo" };

  assert.match((await raw()).m4!, /^v1:/);
  // Antes de la pasada, lo viejo se lee bien (incluido el que empieza con "v1:")
  assert.deepEqual(await read(), expected);

  assert.equal(await encryptLegacyMessages(db as unknown as DB), 3);
  const stored = await raw();
  for (const id of ["m1", "m2", "m4"]) assert.match(stored[id]!, /^v1:[A-Za-z0-9+/]{38,}/, id);
  assert.equal(stored.m3, null);
  assert.doesNotMatch(stored.m1!, /hola/);
  assert.deepEqual(await read(), expected);
  const [rep] = await db.select({ body: schema.report.messageBody }).from(schema.report);
  assert.equal(rep.body, "texto reportado");
  assert.match((await client.query<{ b: string }>(`SELECT "message_body" AS b FROM "report"`)).rows[0].b, /^v1:/);

  // Otra pasada no toca nada
  assert.equal(await encryptLegacyMessages(db as unknown as DB), 0);
  assert.deepEqual(await raw(), stored);

  // Algo con forma de cifrado que no se puede descifrar (por ejemplo, otra clave) falla en vez de mostrarse
  await client.exec(`UPDATE "direct_message" SET "body" = 'v1:${"A".repeat(60)}' WHERE "id" = 'm1'`);
  await assert.rejects(read());
});
