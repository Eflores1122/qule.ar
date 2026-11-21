import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";

test("recuperación de contraseña", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "qule-recuperacion-"));
  const origin = "http://localhost:3001";
  process.env.DATABASE_URL = "";
  process.env.DATA_DIR = dataDir;
  process.env.NODE_ENV = "test";
  process.env.APP_URL = origin;
  process.env.SMTP_URL = "";
  process.env.BETTER_AUTH_SECRET = "clave-local-de-pruebas-de-recuperacion";
  let close: (() => Promise<void>) | undefined;
  t.after(async () => {
    try {
      await close?.();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  const messages: string[] = [];
  // La app simula los mails en consola cuando no hay SMTP. Los enlaces de prueba quedan en memoria.
  t.mock.method(console, "log", (message: string) => messages.push(message));
  const { db, closeDb, runMigrations, schema } = await import("./db/index.js");
  close = closeDb;
  await runMigrations();
  const { auth } = await import("./auth.js");

  const email = "persona@example.test";
  const originalPassword = "una frase inicial de prueba";
  const newPassword = "una frase diferente de prueba";

  function post(endpoint: string, body: unknown) {
    return auth.handler(new Request(`${origin}/api/auth/${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify(body),
    }));
  }

  function cookieFrom(response: Response) {
    const cookie = response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
    assert.ok(cookie);
    return cookie;
  }

  function takeResetLink() {
    const mail = messages.pop();
    const line = mail?.split("\n").find((part) => part.startsWith(`${origin}/api/auth/reset-password/`));
    assert.ok(line, "el correo simulado debe incluir el enlace");
    return new URL(line);
  }

  async function requestReset(address: string) {
    return post("request-password-reset", { email: address, redirectTo: "/nueva-clave" });
  }

  async function session(cookie: string) {
    const response = await auth.handler(new Request(`${origin}/api/auth/get-session`, { headers: { cookie, origin } }));
    assert.equal(response.status, 200);
    return response.json();
  }

  const signup = await post("sign-up/email", { name: "Persona de prueba", email, password: originalPassword });
  assert.equal(signup.status, 200);
  const firstSession = cookieFrom(signup);

  await t.test("da la misma respuesta pública para un mail registrado y otro desconocido", async () => {
    messages.length = 0;
    const registered = await requestReset(email);
    const absent = await requestReset("desconocida@example.test");
    assert.equal(registered.status, 200);
    assert.equal(absent.status, 200);
    assert.deepEqual(await registered.json(), await absent.json());
    assert.equal(messages.length, 1);
    takeResetLink();
  });

  await t.test("acepta un enlace una vez y revoca las sesiones abiertas", async () => {
    const secondLogin = await post("sign-in/email", { email, password: originalPassword });
    assert.equal(secondLogin.status, 200);
    const secondSession = cookieFrom(secondLogin);
    assert.ok(await session(firstSession));
    assert.ok(await session(secondSession));

    assert.equal((await requestReset(email)).status, 200);
    const response = await auth.handler(new Request(takeResetLink()));
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get("location") ?? "/", origin);
    assert.equal(location.pathname, "/nueva-clave");
    const token = location.searchParams.get("token");
    assert.ok(token);

    assert.equal((await post("reset-password", { token, newPassword })).status, 200);
    assert.equal(await session(firstSession), null);
    assert.equal(await session(secondSession), null);
    const reused = await post("reset-password", { token, newPassword });
    assert.equal(reused.status, 400);
    assert.equal((await reused.json() as { code: string }).code, "INVALID_TOKEN");
    const login = await post("sign-in/email", { email, password: newPassword });
    assert.equal(login.status, 200);
  });

  await t.test("un enlace vencido lleva al flujo de recuperación", async () => {
    assert.equal((await requestReset(email)).status, 200);
    const link = takeResetLink();
    const token = link.pathname.split("/").at(-1);
    await db.update(schema.verification).set({ expiresAt: new Date(0) })
      .where(eq(schema.verification.identifier, `reset-password:${token}`));
    const response = await auth.handler(new Request(link));
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get("location") ?? "/", origin);
    assert.equal(location.pathname, "/nueva-clave");
    assert.equal(location.searchParams.get("error"), "INVALID_TOKEN");
  });
});
