import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "./lib.js";

test("crear una cuenta pide el chequeo anti-bots y manda el mail para confirmarla", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "qule-registro-"));
  const origin = "http://localhost:3001";
  Object.assign(process.env, {
    DATABASE_URL: "", DATA_DIR: dataDir, NODE_ENV: "test", APP_URL: origin, SMTP_URL: "",
    VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "", BETTER_AUTH_SECRET: "clave-local-de-pruebas-de-registro-qule",
    SIGNUP_POW_BITS: "8", EMAIL_VERIFY_SINCE: "2020-01-01T00:00:00Z",
  });
  let close: (() => Promise<void>) | undefined;
  t.after(async () => {
    try {
      await close?.();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
  // Sin SMTP, el mail se muestra en la consola: lo capturamos para sacar el link
  const logs: string[] = [];
  t.mock.method(console, "log", (...args: unknown[]) => void logs.push(args.join(" ")));
  const { db, closeDb, runMigrations, schema } = await import("./db/index.js");
  close = closeDb;
  await runMigrations();
  const { auth } = await import("./auth.js");
  const { meRoutes } = await import("./routes/me.js");
  const { solve } = await import("./botCheck.js");
  const app = new Hono<AppEnv>();
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
  app.route("/api", meRoutes);

  const signUp = (email: string, headers: Record<string, string> = {}) =>
    app.request(new URL("/api/auth/sign-up/email", origin), {
      method: "POST",
      headers: { origin, "content-type": "application/json", ...headers },
      body: JSON.stringify({ name: "Ana", email, password: "una frase sintética de prueba", callbackURL: "/" }),
    });
  const challenge = async () => {
    const r = await app.request(new URL("/api/signup-challenge", origin));
    return (await r.json()) as { challenge: string; bits: number };
  };

  // Sin resolver el desafío no se crea nada
  const bot = await signUp("bot@example.test");
  assert.equal(bot.status, 400);
  assert.equal((await bot.json() as { code: string }).code, "BOT_CHECK");
  // Con el campo trampa completo, tampoco
  const c0 = await challenge();
  const trap = await signUp("trampa@example.test", { "x-qule-desafio": `${c0.challenge}:${solve(c0.challenge, c0.bits)}`, "x-qule-trampa": "hola" });
  assert.equal(trap.status, 400);
  assert.equal((await db.select().from(schema.user)).length, 0);

  // Con el desafío resuelto, sí
  const c1 = await challenge();
  assert.equal(c1.bits, 8);
  const solution = `${c1.challenge}:${solve(c1.challenge, c1.bits)}`;
  const ok = await signUp("ana@example.test", { "x-qule-desafio": solution });
  assert.equal(ok.status, 200, await ok.clone().text());
  // La misma solución no sirve dos veces
  const again = await signUp("otra@example.test", { "x-qule-desafio": solution });
  assert.equal((await again.json() as { code: string }).code, "BOT_CHECK_EXPIRED");

  const cookie = ok.headers.getSetCookie().map((v) => v.split(";", 1)[0]).join("; ");
  const me = async () => {
    const r = await app.request(new URL("/api/me", origin), { headers: { origin, cookie } });
    return (await r.json() as { user: { emailVerified: boolean; listed: boolean } }).user;
  };
  const before = await me();
  assert.equal(before.emailVerified, false);
  assert.equal(before.listed, false);

  // Llega el mail para confirmar, y el link confirma la cuenta
  await new Promise((r) => setTimeout(r, 50));
  const mail = logs.find((l) => l.includes("Confirmá tu mail"));
  assert.ok(mail, "no se mandó el mail para confirmar");
  const link = /https?:\/\/\S+verify-email\S+/.exec(mail)![0];
  const verified = await app.request(new URL(link), { headers: { origin } });
  assert.ok([200, 302].includes(verified.status), String(verified.status));
  const [row] = await db.select().from(schema.user).where(eq(schema.user.email, "ana@example.test"));
  assert.equal(row.emailVerified, true);
  assert.equal((await me()).listed, true);
});
