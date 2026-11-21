import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { DB } from "./db/index.js";

test("cifra los datos de salud al migrar una base con perfiles existentes", async (t) => {
  const migrationsFolder = fileURLToPath(new URL("../drizzle/", import.meta.url));
  const oldMigrations = await mkdtemp(path.join(tmpdir(), "qule-health-"));
  const client = new PGlite();
  t.after(async () => {
    await client.close();
    await rm(oldMigrations, { recursive: true, force: true });
  });

  const journalPath = "meta/_journal.json";
  const journal = JSON.parse(await readFile(path.join(migrationsFolder, journalPath), "utf8"));
  journal.entries = journal.entries.filter(({ idx }: { idx: number }) => idx <= 15);
  await mkdir(path.join(oldMigrations, "meta"));
  await writeFile(path.join(oldMigrations, journalPath), JSON.stringify(journal));
  for (const { tag } of journal.entries) {
    await copyFile(path.join(migrationsFolder, `${tag}.sql`), path.join(oldMigrations, `${tag}.sql`));
  }

  process.env.DATA_KEY = randomBytes(32).toString("base64");
  const schema = await import("./db/schema.js");
  const { encryptLegacyHealth } = await import("./db/health.js");
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: oldMigrations });
  await db.insert(schema.user).values({ id: "ana", name: "Ana", email: "ana@example.test" });
  await client.exec(`
    INSERT INTO "profile" ("user_id", "display_name", "birthdate", "hiv_status", "last_tested")
    VALUES ('ana', 'Ana', '1990-01-02', 'negativo', '2025-11-10');
  `);
  await migrate(db, { migrationsFolder });

  const run = () => encryptLegacyHealth(db as unknown as DB);
  const readStored = async () => (await client.query<{ hiv_status: string; last_tested: string }>(
    'SELECT "hiv_status", "last_tested" FROM "profile"',
  )).rows[0];

  assert.equal(await run(), 1);
  const stored = await readStored();
  assert.match(stored.hiv_status, /^v1:/);
  assert.match(stored.last_tested, /^v1:/);
  const [profile] = await db.select({
    hivStatus: schema.profile.hivStatus,
    lastTested: schema.profile.lastTested,
  }).from(schema.profile);
  assert.deepEqual(profile, { hivStatus: "negativo", lastTested: "2025-11-10" });
  assert.equal(await run(), 0);
  assert.deepEqual(await readStored(), stored);

  await client.exec(`UPDATE "profile" SET "last_tested" = 'v1:inválido'`);
  await assert.rejects(run);
});
