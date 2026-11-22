import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { Client } from "pg";

// La conexión de PostgreSQL necesita permiso para crear una base temporal.
const postgresUrl = process.env.GROUP_ADMISSION_TEST_DATABASE_URL;

test("las decisiones de ingreso son atómicas", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "qule-ingreso-"));
  process.env.DATA_DIR = dir;
  const admin = postgresUrl ? new Client({ connectionString: postgresUrl }) : null;
  const databaseName = `qule_admission_${randomUUID().replaceAll("-", "")}`;
  let databaseCreated = false;
  let closeTestDb: (() => Promise<void>) | undefined;
  t.after(async () => {
    try {
      await closeTestDb?.();
    } finally {
      try {
        if (databaseCreated) await admin?.query(`DROP DATABASE "${databaseName}"`);
      } finally {
        await admin?.end();
        await rm(dir, { recursive: true, force: true });
      }
    }
  });
  if (admin && postgresUrl) {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    const url = new URL(postgresUrl);
    url.pathname = `/${databaseName}`;
    process.env.DATABASE_URL = url.href;
  } else {
    delete process.env.DATABASE_URL;
  }
  delete process.env.SMTP_URL;
  const { db, schema, runMigrations, closeDb } = await import("./db/index.js");
  closeTestDb = closeDb;
  await runMigrations();
  const { auth } = await import("./auth.js");
  const { groupRoutes } = await import("./routes/groups.js");
  const app = new Hono().route("/", groupRoutes);
  app.onError((err, c) => c.text(err.message, err instanceof HTTPException ? err.status : 500));

  async function account(name: string) {
    const credentials = { email: `${name}@example.com`, password: "clave-para-pruebas" };
    const { user } = await auth.api.signUpEmail({ body: { ...credentials, name } });
    await db.insert(schema.profile).values({ userId: user.id, displayName: name, birthdate: "1990-01-01" });
    const login = await auth.api.signInEmail({ body: credentials, asResponse: true });
    const cookie = login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    return { id: user.id, post: async (url: string) => app.request(url, { method: "POST", headers: { cookie } }) };
  }

  const owner = await account("owner");
  const applicant = await account("applicant");
  const guest = await account("guest");
  const groupId = "grupo-prueba";
  await db.insert(schema.group).values({ id: groupId, name: "Grupo de prueba" });
  await db.insert(schema.groupMember).values({ groupId, userId: owner.id, role: "owner" });
  await db.insert(schema.groupJoinRequest).values({ id: "solicitud", groupId, userId: applicant.id });

  const requestStatus = async () => {
    const [row] = await db.select().from(schema.groupJoinRequest).where(eq(schema.groupJoinRequest.id, "solicitud"));
    return row.status;
  };
  const inviteStatus = async (id: string) => {
    const [row] = await db.select().from(schema.groupInvite).where(eq(schema.groupInvite.id, id));
    return row.status;
  };
  const hasMember = async (userId: string) => {
    const [row] = await db.select().from(schema.groupMember)
      .where(and(eq(schema.groupMember.groupId, groupId), eq(schema.groupMember.userId, userId)));
    return Boolean(row);
  };

  await t.test("si falla la membresía, la solicitud queda pendiente y se puede reintentar", async () => {
    await db.insert(schema.groupInvite).values({ id: "invitacion-previa", groupId, userId: applicant.id, invitedBy: owner.id });
    await db.execute(sql`ALTER TABLE group_member ADD CONSTRAINT test_reject_new_member CHECK (role <> 'member')`);
    const url = `/groups/${groupId}/requests/solicitud/accept`;
    try {
      assert.equal((await owner.post(url)).status, 500);
      assert.equal(await requestStatus(), "pending");
      assert.equal(await inviteStatus("invitacion-previa"), "pending");
      assert.equal(await hasMember(applicant.id), false);
    } finally {
      await db.execute(sql`ALTER TABLE group_member DROP CONSTRAINT test_reject_new_member`);
    }
    assert.equal((await owner.post(url)).status, 200);
    assert.equal(await requestStatus(), "accepted");
    assert.equal(await inviteStatus("invitacion-previa"), "accepted");
    assert.equal(await hasMember(applicant.id), true);
  });

  await t.test("un fallo al avisar a moderación conserva la respuesta de éxito", async (t) => {
    await db.insert(schema.groupJoinRequest).values({ id: "solicitud-avisos", groupId, userId: guest.id });
    const select = db.select.bind(db);
    const failure = new Error("Falló la consulta de moderación");
    const log = t.mock.method(console, "error", () => {});
    const mock = t.mock.method(db, "select", (fields?: Parameters<typeof db.select>[0]) => {
      if (fields?.userId === schema.groupMember.userId) throw failure;
      return fields ? select(fields) : select();
    });
    try {
      const response = await owner.post(`/groups/${groupId}/requests/solicitud-avisos/accept`);
      assert.equal(response.status, 200);
      assert.equal(await hasMember(guest.id), true);
      assert.deepEqual(log.mock.calls[0]?.arguments, ["Aviso de ingreso a moderación", { groupId, error: failure }]);
    } finally {
      mock.mock.restore();
      log.mock.restore();
      await db.delete(schema.groupMember).where(eq(schema.groupMember.userId, guest.id));
    }
  });

  await t.test("aceptar y rechazar en paralelo produce una sola decisión", async () => {
    await db.insert(schema.groupInvite).values({ id: "invitacion", groupId, userId: guest.id, invitedBy: owner.id });
    const [accept, decline] = await Promise.all([
      guest.post("/invites/invitacion/accept"),
      guest.post("/invites/invitacion/decline"),
    ]);
    assert.deepEqual([accept.status, decline.status].sort(), [200, 409]);
    assert.equal(await inviteStatus("invitacion"), accept.ok ? "accepted" : "declined");
    assert.equal(await hasMember(guest.id), accept.ok);
  });

  async function waitForGroupLocks(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], count: number) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      await tx.execute(sql`select pg_stat_clear_snapshot()`);
      const { rows: [waiting] } = await tx.execute<{ count: number }>(sql`
        select count(*)::int as count from pg_stat_activity
        where datname = current_database() and wait_event_type = 'Lock'
          and query like '%for no key update%'
      `);
      if (waiting.count === count) return;
      await delay(20);
    }
    assert.fail("Las decisiones no llegaron al bloqueo del grupo");
  }

  await t.test("PostgreSQL vuelve a comprobar el rol después de esperar al grupo", {
    skip: !postgresUrl && "Configurá GROUP_ADMISSION_TEST_DATABASE_URL",
  }, async () => {
    const moderatedGroup = "grupo-moderado";
    await db.insert(schema.group).values({ id: moderatedGroup, name: "Grupo moderado" });
    await db.insert(schema.groupMember).values({ groupId: moderatedGroup, userId: owner.id, role: "moderator" });
    await db.insert(schema.groupJoinRequest).values({ id: "solicitud-moderada", groupId: moderatedGroup, userId: applicant.id });

    let decision: Promise<Response> | undefined;
    try {
      await db.transaction(async (tx) => {
        await tx.select({ id: schema.group.id }).from(schema.group)
          .where(eq(schema.group.id, moderatedGroup)).for("no key update");
        decision = owner.post(`/groups/${moderatedGroup}/requests/solicitud-moderada/accept`);
        await waitForGroupLocks(tx, 1);
        await tx.update(schema.groupMember).set({ role: "member" })
          .where(and(eq(schema.groupMember.groupId, moderatedGroup), eq(schema.groupMember.userId, owner.id)));
      });
    } finally {
      await decision;
    }
    assert.equal((await decision)?.status, 403);
    const [request] = await db.select().from(schema.groupJoinRequest)
      .where(eq(schema.groupJoinRequest.id, "solicitud-moderada"));
    assert.equal(request.status, "pending");
  });

  await t.test("PostgreSQL resuelve en paralelo la solicitud y su invitación", {
    skip: !postgresUrl && "Configurá GROUP_ADMISSION_TEST_DATABASE_URL",
  }, async () => {
    const raceGroup = "grupo-concurrente";
    await db.insert(schema.group).values({ id: raceGroup, name: "Grupo concurrente" });
    await db.insert(schema.groupMember).values({ groupId: raceGroup, userId: owner.id, role: "owner" });
    await db.insert(schema.groupJoinRequest).values({ id: "solicitud-concurrente", groupId: raceGroup, userId: applicant.id });
    await db.insert(schema.groupInvite).values({ id: "invitacion-concurrente", groupId: raceGroup, userId: applicant.id, invitedBy: owner.id });

    let decisions: Promise<Response[]> | undefined;
    try {
      await db.transaction(async (tx) => {
        // Retené el grupo hasta que ambos handlers estén esperando el bloqueo en conexiones distintas.
        await tx.select({ id: schema.group.id }).from(schema.group)
          .where(eq(schema.group.id, raceGroup)).for("no key update");
        decisions = Promise.all([
          owner.post(`/groups/${raceGroup}/requests/solicitud-concurrente/accept`),
          applicant.post("/invites/invitacion-concurrente/accept"),
        ]);
        await waitForGroupLocks(tx, 2);
      });
    } finally {
      await decisions;
    }
    assert.ok(decisions);
    const responses = await decisions;
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
    const [request] = await db.select().from(schema.groupJoinRequest).where(eq(schema.groupJoinRequest.id, "solicitud-concurrente"));
    assert.equal(request.status, "accepted");
    assert.equal(await inviteStatus("invitacion-concurrente"), "accepted");
    const members = await db.select().from(schema.groupMember)
      .where(and(eq(schema.groupMember.groupId, raceGroup), eq(schema.groupMember.userId, applicant.id)));
    assert.equal(members.length, 1);
  });
});
