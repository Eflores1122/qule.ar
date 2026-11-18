import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";
import { env } from "../env.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(here, "../../drizzle");

export type DB = NodePgDatabase<typeof schema>;

async function connect(): Promise<{ db: DB; migrate: () => Promise<void> }> {
  if (env.DATABASE_URL) {
    // Producción: Postgres real
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const db = drizzle(env.DATABASE_URL, { schema });
    return { db, migrate: () => migrate(db, { migrationsFolder }) };
  }
  // Desarrollo: Postgres embebido (PGlite), sin instalar nada
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  mkdirSync(env.DATA_DIR, { recursive: true });
  const client = new PGlite(path.join(env.DATA_DIR, "pglite"));
  const db = drizzle(client, { schema });
  return { db: db as unknown as DB, migrate: () => migrate(db, { migrationsFolder }) };
}

const conn = await connect();
export const db = conn.db;
export const runMigrations = conn.migrate;
export { schema };
