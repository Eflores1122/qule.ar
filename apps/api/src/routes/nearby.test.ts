import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../lib.js";

test("selección regional de Gente", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "qule-gente-"));
  const origin = "http://localhost:3001";
  process.env.DATABASE_URL = "";
  process.env.DATA_DIR = dataDir;
  process.env.NODE_ENV = "test";
  process.env.APP_URL = origin;
  process.env.SMTP_URL = "";
  process.env.BETTER_AUTH_SECRET = "clave-local-de-pruebas-de-gente";
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
  const { snapToCell } = await import("../geo.js");
  const { nearbyRoutes } = await import("./nearby.js");
  const app = new Hono<AppEnv>();
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
  app.route("/api", nearbyRoutes);

  const signup = await app.request(`${origin}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ name: "Perfil de prueba", email: "gente@example.test", password: "una clave ficticia de prueba" }),
  });
  assert.equal(signup.status, 200);
  const { user } = await signup.json() as { user: { id: string } };
  const cookie = signup.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
  assert.ok(cookie);

  const center = snapToCell(19.4326, -99.1332);
  const mexico = snapToCell(19.441, -99.149);
  const islands = snapToCell(0, -179.8);
  await db.insert(schema.user).values([
    { id: "local-mx", name: "Perfil en México", email: "local-mx@example.test" },
    { id: "local-private", name: "Perfil con distancia oculta", email: "local-private@example.test" },
    { id: "local-pacific", name: "Perfil en el Pacífico", email: "local-pacific@example.test" },
  ]);
  const defaults = { birthdate: "1990-01-01", lastSeenAt: new Date("2025-01-01T00:00:00Z") };
  await db.insert(schema.profile).values([
    { ...defaults, userId: user.id, displayName: "Perfil de prueba", cellLat: center.lat, cellLng: center.lng },
    { ...defaults, userId: "local-mx", displayName: "Perfil en México", cellLat: mexico.lat, cellLng: mexico.lng },
    {
      ...defaults, userId: "local-private", displayName: "Perfil con distancia oculta", showDistance: false,
      cellLat: mexico.lat, cellLng: mexico.lng, lastSeenAt: new Date("2026-02-01T00:00:00Z"),
    },
    { ...defaults, userId: "local-pacific", displayName: "Perfil en el Pacífico", cellLat: islands.lat, cellLng: islands.lng },
  ]);

  // Más actividad global que el cupo original. Todas estas cuentas y celdas son sintéticas.
  await db.execute(sql`
    INSERT INTO "user" (id, name, email)
    SELECT 'remoto-' || n, 'Perfil remoto', 'remoto-' || n || '@example.test'
    FROM generate_series(1, 3005) AS series(n)
  `);
  await db.execute(sql`
    INSERT INTO profile (user_id, display_name, birthdate, cell_lat, cell_lng, last_seen_at)
    SELECT id, 'Perfil remoto', DATE '1990-01-01', -34.603, -58.382, TIMESTAMPTZ '2026-01-01 00:00:00+00'
    FROM "user" WHERE id LIKE 'remoto-%'
  `);

  async function load(offset = 0) {
    const res = await app.request(`${origin}/api/nearby?offset=${offset}`, { headers: { cookie } });
    assert.equal(res.status, 200);
    return res.json() as Promise<{ hasMore: boolean; people: Array<{ id: string; distance: string | null }> }>;
  }

  await t.test("incluye perfiles cercanos en México aunque haya más de 3.000 perfiles remotos más recientes", async () => {
    const { people } = await load();
    assert.equal(people[0]?.id, "local-mx");
    assert.ok(people[0]?.distance);
    assert.ok(people.some(({ id }) => id.startsWith("remoto-")));
  });

  await t.test("con la distancia oculta, la actividad reciente guía la selección", async () => {
    await db.update(schema.profile).set({ showDistance: false }).where(eq(schema.profile.userId, user.id));
    const { people } = await load();
    assert.equal(people[0]?.id, "local-private");
    assert.ok(people.every(({ distance }) => distance === null));
    assert.ok(!people.some(({ id }) => id === "local-mx"));
  });

  await t.test("la ventana regional admite perfiles al otro lado del antimeridiano", async () => {
    const cell = snapToCell(0, 179.8);
    await db.update(schema.profile).set({ showDistance: true, cellLat: cell.lat, cellLng: cell.lng })
      .where(eq(schema.profile.userId, user.id));
    const { people } = await load();
    assert.equal(people[0]?.id, "local-pacific");
    assert.ok(people[0]?.distance);
  });

  await t.test("la paginación llega al final del cupo de selección", async () => {
    const { people, hasMore } = await load(2940);
    assert.equal(people.length, 60);
    assert.equal(hasMore, false);
  });
});
