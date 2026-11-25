import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Hono } from "hono";
import sharp from "sharp";
import type { AppEnv } from "./lib.js";

test("varios álbumes privados, compartidos de a uno", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "qule-albumes-"));
  const origin = "http://localhost:3001";
  process.env.DATABASE_URL = "";
  process.env.DATA_DIR = dataDir;
  process.env.NODE_ENV = "test";
  process.env.APP_URL = origin;
  process.env.SMTP_URL = "";
  process.env.VAPID_PUBLIC_KEY = "";
  process.env.VAPID_PRIVATE_KEY = "";
  process.env.BETTER_AUTH_SECRET = "clave-local-de-pruebas-de-albumes-qule";
  let close: (() => Promise<void>) | undefined;
  t.after(async () => {
    try {
      await close?.();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  t.mock.method(console, "log", () => {});
  const { db, closeDb, runMigrations, schema } = await import("./db/index.js");
  close = closeDb;
  await runMigrations();
  const { auth } = await import("./auth.js");
  const { meRoutes } = await import("./routes/me.js");
  const { premiumRoutes } = await import("./routes/premium.js");
  const { socialRoutes } = await import("./routes/social.js");
  const { toqueRoutes } = await import("./routes/toques.js");
  const { saveImage } = await import("./storage.js");
  const { MAX_ALBUMS, MAX_ALBUM_ITEMS } = await import("./albums.js");

  const app = new Hono<AppEnv>();
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
  app.route("/api", meRoutes);
  app.route("/api", socialRoutes);
  app.route("/api", toqueRoutes);
  app.route("/api", premiumRoutes);

  type Account = { id: string; cookie: string };
  type Media = { url: string; thumb: string | null };
  type SharedAlbum = { id: string; name: string; count: number; items: Media[]; expiresAt: string | null };
  type UserOut = {
    privateAlbum: { count: number; items: Media[] | null; albums: SharedAlbum[] } | null;
    iSharedAlbum: boolean;
    myShares: { albumId: string; expiresAt: string | null }[];
  };

  function request(url: string, account?: Account, init?: RequestInit) {
    const headers = new Headers(init?.headers);
    headers.set("origin", origin);
    if (account) headers.set("cookie", account.cookie);
    return app.request(new URL(url, origin), { ...init, headers });
  }
  const json = (method: string, body?: unknown): RequestInit =>
    ({ method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

  async function account(name: string): Promise<Account> {
    const res = await request("/api/auth/sign-up/email", undefined, json("POST", {
      name, email: `${name.toLowerCase()}@example.test`, password: "una frase sintética de prueba",
    }));
    assert.equal(res.status, 200);
    const { user } = await res.json() as { user: { id: string } };
    const cookie = res.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
    await db.insert(schema.profile).values({ userId: user.id, displayName: name, birthdate: "1990-01-01" });
    return { id: user.id, cookie };
  }

  const owner = await account("Ana");
  const person = await account("Luz");
  const other = await account("Sol");
  const sample = await sharp({ create: { width: 12, height: 12, channels: 3, background: { r: 45, g: 60, b: 70 } } }).png().toBuffer();

  async function createAlbum(who: Account, name: string) {
    const res = await request("/api/album/albums", who, json("POST", { name }));
    assert.equal(res.status, 200, await res.clone().text());
    return (await res.json() as { id: string }).id;
  }

  async function uploadTo(who: Account, albumId: string | null) {
    const data = new FormData();
    data.set("file", new File([Uint8Array.from(sample)], "prueba.png", { type: "image/png" }));
    if (albumId) data.set("album", albumId);
    else data.set("private", "1");
    return request("/api/me/photos", who, { method: "POST", body: data });
  }

  async function upload(who: Account, albumId: string | null) {
    const res = await uploadTo(who, albumId);
    assert.equal(res.status, 200, await res.clone().text());
    return await res.json() as { id: string; albumId: string; url: string; thumb: string };
  }

  async function profileOf(viewer: Account, id = owner.id) {
    const res = await request(`/api/users/${id}`, viewer);
    assert.equal(res.status, 200);
    return await res.json() as UserOut;
  }

  async function canSee(viewer: Account, file: { url: string; thumb: string }) {
    const [a, b] = [await request(file.url, viewer), await request(file.thumb, viewer)];
    assert.equal(a.status, b.status);
    return a.status === 200;
  }

  const share = (albumId: string, to: Account, hours: number | null = null, from = owner) =>
    request(`/api/album/albums/${albumId}/grants/${to.id}`, from, json("PUT", { hours }));

  // Un álbum por defecto (lo crea la primera subida privada) y dos con nombre
  const first = await upload(owner, null);
  const base = first.albumId;
  const activo = await createAlbum(owner, "Activo");
  const pasivo = await createAlbum(owner, "Pasivo");
  const enActivo = await upload(owner, activo);
  const enPasivo = await upload(owner, pasivo);

  await t.test("se crean, se renombran y tienen un tope", async () => {
    const list = await (await request("/api/album/albums", owner)).json() as { id: string; name: string; count: number }[];
    assert.deepEqual(list.map((a) => [a.name, a.count]), [["Álbum privado", 1], ["Activo", 1], ["Pasivo", 1]]);
    assert.equal((await request(`/api/album/albums/${activo}`, owner, json("PATCH", { name: "  Activo de noche " }))).status, 200);
    const me = await (await request("/api/me", owner)).json() as { albums: { id: string; name: string }[] };
    assert.equal(me.albums.find((a) => a.id === activo)?.name, "Activo de noche");
    assert.equal((await request(`/api/album/albums/${activo}`, owner, json("PATCH", { name: "   " }))).status, 400);
    assert.equal((await request(`/api/album/albums/${activo}`, owner, json("PATCH", { name: "x".repeat(31) }))).status, 400);
    const extra: string[] = [];
    for (let i = list.length; i < MAX_ALBUMS; i++) extra.push(await createAlbum(owner, `Extra ${i}`));
    const over = await request("/api/album/albums", owner, json("POST", { name: "Uno más" }));
    assert.equal(over.status, 400);
    for (const id of extra) assert.equal((await request(`/api/album/albums/${id}`, owner, { method: "DELETE" })).status, 200);
  });

  await t.test("nadie más puede tocar mis álbumes", async () => {
    assert.equal((await request(`/api/album/albums/${activo}`, person, json("PATCH", { name: "Mío" }))).status, 404);
    assert.equal((await request(`/api/album/albums/${activo}`, person, { method: "DELETE" })).status, 404);
    assert.equal((await share(activo, other, null, person)).status, 404);
    assert.equal((await uploadTo(person, activo)).status, 404);
    const mine = await upload(person, null);
    assert.equal((await request(`/api/me/photos/${mine.id}`, person, json("PATCH", { albumId: activo }))).status, 404);
    assert.equal((await request(`/api/me/photos/${enActivo.id}`, person, json("PATCH", { albumId: mine.albumId }))).status, 404);
    // Y no se puede compartir el álbum de otra persona aunque se conozca el id
    assert.equal((await request(`/api/album/albums/${activo}/grants/${other.id}`, person, json("PUT", { hours: 1 }))).status, 404);
  });

  await t.test("con acceso a un álbum no se ven los archivos de otro", async () => {
    assert.equal((await share(activo, person, 24)).status, 200);
    assert.equal(await canSee(person, enActivo), true);
    assert.equal(await canSee(person, enPasivo), false);
    assert.equal(await canSee(person, first), false);
    assert.equal(await canSee(other, enActivo), false);
    const seen = await profileOf(person);
    assert.equal(seen.privateAlbum?.count, 3);
    // Solo aparece el álbum compartido, con su nombre; los otros nombres no se muestran
    assert.deepEqual(seen.privateAlbum?.albums.map((a) => [a.id, a.name, a.count]), [[activo, "Activo de noche", 1]]);
    assert.deepEqual(seen.privateAlbum?.items, [{ ...seen.privateAlbum!.albums[0].items[0] }]);
    assert.ok(!JSON.stringify(seen).includes("Pasivo"));
    assert.equal((await profileOf(other)).privateAlbum?.items, null);
    // Quien comparte ve qué álbum le compartió
    const mine = await profileOf(owner, person.id);
    assert.deepEqual(mine.myShares.map((s) => s.albumId), [activo]);
    assert.equal(mine.iSharedAlbum, true);
  });

  await t.test("mover un archivo de álbum cambia quién lo ve", async () => {
    assert.equal((await request(`/api/me/photos/${enPasivo.id}`, owner, json("PATCH", { albumId: activo }))).status, 200);
    assert.equal(await canSee(person, enPasivo), true);
    assert.equal((await request(`/api/me/photos/${enPasivo.id}`, owner, json("PATCH", { albumId: pasivo }))).status, 200);
    assert.equal(await canSee(person, enPasivo), false);
    // Pasarla al perfil público y volverla a un álbum
    assert.equal((await request(`/api/me/photos/${enPasivo.id}`, owner, json("PATCH", { isPrivate: false }))).status, 200);
    assert.equal(await canSee(other, enPasivo), true);
    assert.equal((await request(`/api/me/photos/${enPasivo.id}`, owner, json("PATCH", { albumId: pasivo }))).status, 200);
    assert.equal(await canSee(other, enPasivo), false);
    assert.equal((await request(`/api/me/photos/${enPasivo.id}`, owner, json("PATCH", { isPrivate: false, albumId: pasivo }))).status, 400);
  });

  await t.test("compartir y quitar es por álbum", async () => {
    assert.equal((await share(pasivo, person, 1)).status, 200);
    assert.equal(await canSee(person, enPasivo), true);
    const list = await (await request("/api/album/grants", owner)).json() as { id: string; albumId: string; albumName: string }[];
    assert.deepEqual(list.map((g) => [g.id, g.albumName]).sort(), [[person.id, "Activo de noche"], [person.id, "Pasivo"]]);
    assert.equal((await request(`/api/album/albums/${pasivo}/grants/${person.id}`, owner, { method: "DELETE" })).status, 200);
    assert.equal(await canSee(person, enPasivo), false);
    assert.equal(await canSee(person, enActivo), true);
    // El vencimiento de un álbum no toca el otro
    assert.equal((await share(pasivo, person, 1)).status, 200);
    const { and, eq } = await import("drizzle-orm");
    await db.update(schema.albumGrant).set({ expiresAt: new Date(0) })
      .where(and(eq(schema.albumGrant.albumId, pasivo), eq(schema.albumGrant.granteeId, person.id)));
    assert.equal(await canSee(person, enPasivo), false);
    assert.equal(await canSee(person, enActivo), true);
  });

  await t.test("bloquear revoca todos los álbumes en las dos direcciones", async () => {
    assert.equal((await share(pasivo, other)).status, 200);
    assert.equal((await share(activo, other)).status, 200);
    const theirs = await upload(other, null);
    assert.equal((await request(`/api/album/grants/${owner.id}`, other, json("PUT", { hours: null }))).status, 200);
    assert.equal(await canSee(owner, theirs), true);
    assert.equal(await canSee(other, enPasivo), true);
    assert.equal((await request("/api/blocks", owner, json("POST", { userId: other.id }))).status, 200);
    assert.equal(await canSee(other, enPasivo), false);
    assert.equal(await canSee(other, enActivo), false);
    assert.equal(await canSee(owner, theirs), false);
    const left = await db.select().from(schema.albumGrant);
    assert.ok(left.every((g) => g.granteeId !== other.id && g.ownerId !== other.id));
    // Al desbloquear no vuelve ningún acceso
    assert.equal((await request(`/api/blocks/${other.id}`, owner, { method: "DELETE" })).status, 200);
    assert.equal(await canSee(other, enActivo), false);
    // Los avisos del chat quedaron como revocados en las dos direcciones, y siguen así al desbloquear
    const convs = await db.select().from(schema.conversation);
    const conv = convs.find((c) => [c.userA, c.userB].includes(owner.id) && [c.userA, c.userB].includes(other.id));
    assert.ok(conv);
    const notices = (await db.select().from(schema.directMessage))
      .filter((m) => m.conversationId === conv.id && m.kind.startsWith("album"));
    assert.equal(notices.length, 3);
    assert.ok(notices.every((m) => m.kind === "album_revoked"));
  });

  await t.test("el tope de archivos privados suma todos los álbumes", async () => {
    const { eq } = await import("drizzle-orm");
    const have = (await db.select().from(schema.photo).where(eq(schema.photo.userId, owner.id))).filter((p) => p.isPrivate).length;
    const key = await saveImage(sample);
    for (let i = have; i < MAX_ALBUM_ITEMS; i++) {
      await db.insert(schema.photo).values({ id: randomUUID(), userId: owner.id, key, position: 100 + i, isPrivate: true, albumId: i % 2 ? activo : pasivo });
    }
    const res = await uploadTo(owner, base);
    assert.equal(res.status, 400);
    assert.match(await res.text(), /todos tus álbumes/);
    await db.delete(schema.photo).where(eq(schema.photo.key, key));
  });

  await t.test("borrar un álbum mueve o borra sus archivos y corta sus accesos", async () => {
    const extra = await upload(owner, pasivo);
    assert.equal((await share(pasivo, person)).status, 200);
    // Pasar todo a Activo, que Luz ya puede ver
    assert.equal((await request(`/api/album/albums/${pasivo}?moveTo=${pasivo}`, owner, { method: "DELETE" })).status, 400);
    assert.equal((await request(`/api/album/albums/${pasivo}?moveTo=${activo}`, owner, { method: "DELETE" })).status, 200);
    assert.equal(await canSee(person, extra), true);
    const list = await (await request("/api/album/grants", owner)).json() as { albumId: string }[];
    assert.ok(list.every((g) => g.albumId !== pasivo));
    // Borrar Activo sin mover: se van sus archivos (ni la dueña los ve)
    assert.equal((await request(`/api/album/albums/${activo}`, owner, { method: "DELETE" })).status, 200);
    assert.equal(await canSee(owner, extra), false);
    assert.equal(await canSee(person, enActivo), false);
    const albums = await (await request("/api/album/albums", owner)).json() as { id: string }[];
    assert.deepEqual(albums.map((a) => a.id), [base]);
    assert.equal(await canSee(owner, first), true);
  });

  await t.test("el aviso del chat sigue el estado de lo compartido", async () => {
    const bruno = await account("Bruno");
    const mia = await account("Mia");
    const up = await upload(bruno, null);
    const baseAlbum = up.albumId;
    const noche = await createAlbum(bruno, "De noche");
    await upload(bruno, noche);

    type Notice = { id: string; kind: string; body: string | null; expiresAt?: string | null };
    async function convId() {
      const conv = await request("/api/conversations", bruno, json("POST", { userId: mia.id }));
      assert.equal(conv.status, 200, await conv.clone().text());
      return (await conv.json() as { id: string }).id;
    }
    async function notices(viewer: Account = bruno): Promise<Notice[]> {
      const res = await request(`/api/conversations/${await convId()}/messages`, viewer);
      assert.equal(res.status, 200);
      const { messages } = await res.json() as { messages: Notice[] };
      return messages.filter((m) => m.kind.startsWith("album"));
    }

    assert.deepEqual(await notices(), []);
    // Compartir por 1 hora: un aviso que dice el plazo y hasta cuándo vale
    assert.equal((await share(baseAlbum, mia, 1, bruno)).status, 200);
    const [created] = await notices();
    assert.deepEqual([created.kind, created.body], ["album", "1 hora"]);
    assert.equal(typeof created.expiresAt, "string");
    const left = new Date(created.expiresAt as string).getTime() - Date.now();
    assert.ok(left > 50 * 60_000 && left <= 60 * 60_000);
    // Del otro lado se ve lo mismo
    assert.deepEqual((await notices(mia)).map((m) => [m.kind, m.body]), [["album", "1 hora"]]);
    // Los avisos no se pueden desenviar
    assert.equal((await request(`/api/conversations/${await convId()}/messages/${created.id}`, bruno, { method: "DELETE" })).status, 400);
    assert.equal((await notices()).length, 1);
    // Cambiar el plazo actualiza el mismo aviso, no suma otro
    assert.equal((await share(baseAlbum, mia, 24, bruno)).status, 200);
    assert.deepEqual((await notices()).map((m) => [m.id, m.kind, m.body]), [[created.id, "album", "24 horas"]]);
    // Revocar lo marca como revocado, en el mismo lugar
    assert.equal((await request(`/api/album/albums/${baseAlbum}/grants/${mia.id}`, bruno, { method: "DELETE" })).status, 200);
    assert.deepEqual((await notices()).map((m) => [m.id, m.kind, m.body]), [[created.id, "album_revoked", "24 horas"]]);
    // Volver a compartir lo reactiva, sin duplicar
    assert.equal((await share(baseAlbum, mia, null, bruno)).status, 200);
    assert.deepEqual((await notices()).map((m) => [m.id, m.kind, m.body]), [[created.id, "album", null]]);
    // El otro álbum tiene su propio aviso; revocar uno no toca el otro
    assert.equal((await share(noche, mia, 168, bruno)).status, 200);
    assert.deepEqual((await notices()).map((m) => m.kind).sort(), ["album", "album"]);
    assert.equal((await request(`/api/album/albums/${baseAlbum}/grants/${mia.id}`, bruno, { method: "DELETE" })).status, 200);
    assert.deepEqual((await notices()).map((m) => m.kind).sort(), ["album", "album_revoked"]);
    const revoked = (await db.select().from(schema.directMessage)).filter((m) => m.senderId === bruno.id && m.kind === "album_revoked");
    assert.equal(revoked.length, 1);
    assert.equal(revoked[0].albumId, baseAlbum);
    // Quitarle todo revoca cada aviso por separado, sin juntar álbumes
    assert.equal((await request(`/api/album/grants/${mia.id}`, bruno, { method: "DELETE" })).status, 200);
    assert.deepEqual((await notices()).map((m) => m.kind).sort(), ["album_revoked", "album_revoked"]);
  });

  await t.test("los avisos viejos se juntan en uno al compartir y al revocar", async () => {
    const tomas = await account("Tomas");
    const nina = await account("Nina");
    const up = await upload(tomas, null);
    const conv = await request("/api/conversations", tomas, json("POST", { userId: nina.id }));
    assert.equal(conv.status, 200, await conv.clone().text());
    const { id } = await conv.json() as { id: string };
    const { eq } = await import("drizzle-orm");
    async function tomasNotices() {
      return db.select().from(schema.directMessage).where(eq(schema.directMessage.senderId, tomas.id));
    }
    // Dos avisos de antes de guardar el álbum (sin albumId): compartir los junta directo
    await db.insert(schema.directMessage).values([
      { id: randomUUID(), conversationId: id, senderId: tomas.id, kind: "album", body: "1 hora", createdAt: new Date(Date.now() - 2000) },
      { id: randomUUID(), conversationId: id, senderId: tomas.id, kind: "album", body: "1 hora", createdAt: new Date(Date.now() - 1000) },
    ]);
    assert.equal((await share(up.albumId, nina, 24, tomas)).status, 200);
    const afterShare = await tomasNotices();
    assert.equal(afterShare.length, 1);
    assert.equal(afterShare[0].kind, "album");
    assert.equal(afterShare[0].body, "24 horas");
    assert.equal(afterShare[0].albumId, up.albumId);
    // Otros dos duplicados: revocar también los junta en uno solo
    await db.insert(schema.directMessage).values([
      { id: randomUUID(), conversationId: id, senderId: tomas.id, kind: "album", body: "1 hora", createdAt: new Date(Date.now() - 2000) },
      { id: randomUUID(), conversationId: id, senderId: tomas.id, kind: "album", body: "1 hora", createdAt: new Date(Date.now() - 1000) },
    ]);
    assert.equal((await request(`/api/album/albums/${up.albumId}/grants/${nina.id}`, tomas, { method: "DELETE" })).status, 200);
    const afterRevoke = await tomasNotices();
    assert.equal(afterRevoke.length, 1);
    assert.equal(afterRevoke[0].kind, "album_revoked");
    assert.equal(afterRevoke[0].albumId, up.albumId);
    // Volver a compartir lo reactiva, y quitar todo lo revoca
    assert.equal((await share(up.albumId, nina, null, tomas)).status, 200);
    assert.equal((await tomasNotices()).length, 1);
    assert.equal((await tomasNotices())[0].kind, "album");
    assert.equal((await request("/api/album/grants", tomas, { method: "DELETE" })).status, 200);
    assert.equal((await tomasNotices()).length, 1);
    assert.equal((await tomasNotices())[0].kind, "album_revoked");
  });

  await t.test("el vencimiento marca el aviso al abrir el chat, y borrar el álbum lo revoca", async () => {
    const eva = await account("Eva");
    const leo = await account("Leo");
    const up = await upload(eva, null);
    const conv = await request("/api/conversations", eva, json("POST", { userId: leo.id }));
    assert.equal(conv.status, 200, await conv.clone().text());
    const { id } = await conv.json() as { id: string };
    type Notice = { id: string; kind: string; body: string | null; expiresAt?: string | null; createdAt: string; readAt: string | null };
    async function notices(viewer: Account): Promise<Notice[]> {
      const res = await request(`/api/conversations/${id}/messages`, viewer);
      assert.equal(res.status, 200);
      const { messages } = await res.json() as { messages: Notice[] };
      return messages.filter((m) => m.kind.startsWith("album"));
    }
    assert.equal((await share(up.albumId, leo, 1, eva)).status, 200);
    assert.deepEqual((await notices(eva)).map((m) => m.kind), ["album"]);
    // Activo con plazo: trae hasta cuándo vale
    const [primero] = await notices(eva);
    assert.equal(typeof primero.expiresAt, "string");
    // Vence el plazo: al abrir el chat el aviso queda como vencido para los dos
    const { and, eq } = await import("drizzle-orm");
    await db.update(schema.albumGrant).set({ expiresAt: new Date(0) })
      .where(and(eq(schema.albumGrant.albumId, up.albumId), eq(schema.albumGrant.granteeId, leo.id)));
    assert.deepEqual((await notices(eva)).map((m) => m.kind), ["album_expired"]);
    assert.deepEqual((await notices(leo)).map((m) => m.kind), ["album_expired"]);
    // Vencido: es el mismo aviso, y ya no trae vencimiento
    const [vencido] = await notices(eva);
    assert.equal(vencido.id, primero.id);
    assert.ok(!("expiresAt" in vencido));
    // Lo envejezco y lo marco leído para probar que reactivar lo sube y lo desmarca
    const viejo = new Date(Date.now() - 60_000);
    await db.update(schema.directMessage).set({ createdAt: viejo })
      .where(eq(schema.directMessage.id, vencido.id));
    const leido = await request(`/api/conversations/${id}/read`, leo, json("POST", { messageIds: [vencido.id] }));
    assert.equal(leido.status, 200);
    assert.equal(((await leido.json()) as { changed: boolean }).changed, true);
    const [antes] = await notices(eva);
    assert.equal(antes.id, primero.id);
    assert.ok(antes.readAt != null);
    assert.equal(new Date(antes.createdAt).getTime(), viejo.getTime());
    // Compartir de nuevo lo reactiva (mismo aviso, más nuevo, sin leer, sin límite), y borrar el álbum lo revoca
    assert.equal((await share(up.albumId, leo, null, eva)).status, 200);
    const [reactivado] = await notices(eva);
    assert.deepEqual([reactivado.id, reactivado.kind], [primero.id, "album"]);
    assert.ok(new Date(reactivado.createdAt).getTime() > new Date(antes.createdAt).getTime());
    assert.equal(reactivado.readAt, null);
    assert.ok("expiresAt" in reactivado);
    assert.equal(reactivado.expiresAt, null);
    assert.equal((await request(`/api/album/albums/${up.albumId}`, eva, { method: "DELETE" })).status, 200);
    const [revocado] = await notices(eva);
    assert.deepEqual([revocado.id, revocado.kind], [primero.id, "album_revoked"]);
  });

  await t.test("reacciones en avisos de álbum", async () => {
    const romi = await account("Romi");
    const gabi = await account("Gabi");
    const up = await upload(romi, null);
    const conv = await request("/api/conversations", romi, json("POST", { userId: gabi.id }));
    assert.equal(conv.status, 200, await conv.clone().text());
    const { id } = await conv.json() as { id: string };
    type Notice = { id: string; kind: string };
    async function noticeId(): Promise<Notice> {
      const res = await request(`/api/conversations/${id}/messages`, romi);
      assert.equal(res.status, 200);
      const { messages } = await res.json() as { messages: Notice[] };
      const found = messages.find((m) => m.kind.startsWith("album"));
      assert.ok(found);
      return found;
    }
    async function react(who: Account, messageId: string, kind: string | null = "fuego") {
      const res = await request(`/api/reactions/dm/${messageId}`, who, json("PUT", { kind }));
      assert.equal(res.status, 200, await res.clone().text());
      return await res.json() as { reactions: { kind: string; by: string[] }[] };
    }
    // Aviso activo: reaccionan los dos
    assert.equal((await share(up.albumId, gabi, 1, romi)).status, 200);
    const active = await noticeId();
    assert.equal(active.kind, "album");
    assert.deepEqual((await react(gabi, active.id)).reactions, [{ kind: "fuego", by: [gabi.id] }]);
    assert.deepEqual((await react(romi, active.id)).reactions, [{ kind: "fuego", by: [gabi.id, romi.id] }]);
    // Aviso revocado: también se puede reaccionar
    assert.equal((await request(`/api/album/albums/${up.albumId}/grants/${gabi.id}`, romi, { method: "DELETE" })).status, 200);
    const revoked = await noticeId();
    assert.equal(revoked.kind, "album_revoked");
    assert.equal(revoked.id, active.id);
    const afterRevoke = await react(gabi, revoked.id, "ojitos");
    assert.deepEqual(afterRevoke.reactions.map((r) => r.kind).sort(), ["fuego", "ojitos"]);
    // Aviso vencido: también se puede reaccionar
    assert.equal((await share(up.albumId, gabi, 1, romi)).status, 200);
    const { and, eq } = await import("drizzle-orm");
    await db.update(schema.albumGrant).set({ expiresAt: new Date(0) })
      .where(and(eq(schema.albumGrant.albumId, up.albumId), eq(schema.albumGrant.granteeId, gabi.id)));
    const expired = await noticeId();
    assert.equal(expired.kind, "album_expired");
    const afterExpire = await react(romi, expired.id, "chispa");
    assert.deepEqual(afterExpire.reactions.map((r) => r.kind).sort(), ["chispa", "ojitos"]);
  });

  await t.test("los avisos sin álbum no se vencen si hay dos álbumes", async () => {
    const pau = await account("Pau");
    const seba = await account("Seba");
    const up = await upload(pau, null);
    const baseAlbum = up.albumId;
    const noche = await createAlbum(pau, "De noche");
    await upload(pau, noche);
    const conv = await request("/api/conversations", pau, json("POST", { userId: seba.id }));
    assert.equal(conv.status, 200, await conv.clone().text());
    const { id } = await conv.json() as { id: string };
    // Dos avisos legacy sin albumId: no se sabe de cuál álbum son
    const legacyIds = [randomUUID(), randomUUID()];
    await db.insert(schema.directMessage).values([
      { id: legacyIds[0], conversationId: id, senderId: pau.id, kind: "album", body: "1 hora", createdAt: new Date(Date.now() - 2000) },
      { id: legacyIds[1], conversationId: id, senderId: pau.id, kind: "album", body: "1 hora", createdAt: new Date(Date.now() - 1000) },
    ]);
    type Notice = { id: string; kind: string; body: string | null; expiresAt?: string | null };
    async function notices(): Promise<Notice[]> {
      const res = await request(`/api/conversations/${id}/messages`, pau);
      assert.equal(res.status, 200);
      const { messages } = await res.json() as { messages: Notice[] };
      return messages.filter((m) => m.kind.startsWith("album"));
    }
    async function legacyRows() {
      const { inArray } = await import("drizzle-orm");
      return db.select().from(schema.directMessage).where(inArray(schema.directMessage.id, legacyIds));
    }
    // Compartir un álbum crea su propio aviso sin tocar los legacy
    assert.equal((await share(baseAlbum, seba, 1, pau)).status, 200);
    let all = await notices();
    assert.equal(all.length, 3);
    const withExpiry = all.filter((m) => "expiresAt" in m);
    assert.equal(withExpiry.length, 1);
    assert.equal(withExpiry[0].kind, "album");
    assert.equal(typeof withExpiry[0].expiresAt, "string");
    assert.deepEqual(all.map((m) => m.kind).sort(), ["album", "album", "album"]);
    assert.ok((await legacyRows()).every((m) => m.kind === "album" && m.albumId == null));
    // Vencer ese álbum marca solo su aviso; los legacy siguen activos
    const { and, eq } = await import("drizzle-orm");
    await db.update(schema.albumGrant).set({ expiresAt: new Date(0) })
      .where(and(eq(schema.albumGrant.albumId, baseAlbum), eq(schema.albumGrant.granteeId, seba.id)));
    all = await notices();
    assert.equal(all.length, 3);
    assert.deepEqual(all.map((m) => m.kind).sort(), ["album", "album", "album_expired"]);
    assert.ok((await legacyRows()).every((m) => m.kind === "album" && m.albumId == null));
  });

  await t.test("borrar un álbum con el acceso vencido y limpiado igual revoca el aviso", async () => {
    const cleo = await account("Cleo");
    const dario = await account("Dario");
    const up = await upload(cleo, null);
    const conv = await request("/api/conversations", cleo, json("POST", { userId: dario.id }));
    assert.equal(conv.status, 200, await conv.clone().text());
    const { id } = await conv.json() as { id: string };
    assert.equal((await share(up.albumId, dario, 1, cleo)).status, 200);
    // Vence el plazo y se limpia el acceso: ya no queda fila en album_grant
    const { and, eq } = await import("drizzle-orm");
    await db.update(schema.albumGrant).set({ expiresAt: new Date(0) })
      .where(and(eq(schema.albumGrant.albumId, up.albumId), eq(schema.albumGrant.granteeId, dario.id)));
    assert.equal((await request("/api/album/grants", cleo)).status, 200);
    assert.equal((await db.select().from(schema.albumGrant)).filter((g) => g.albumId === up.albumId).length, 0);
    // Borrar el álbum igual marca el aviso como revocado (no queda activo sin álbum)
    assert.equal((await request(`/api/album/albums/${up.albumId}`, cleo, { method: "DELETE" })).status, 200);
    const res = await request(`/api/conversations/${id}/messages`, cleo);
    assert.equal(res.status, 200);
    const { messages } = await res.json() as { messages: { kind: string }[] };
    assert.deepEqual(messages.filter((m) => m.kind.startsWith("album")).map((m) => m.kind), ["album_revoked"]);
  });

  await t.test("un solo aviso por álbum aunque se comparta dos veces a la vez", async () => {
    const noa = await account("Noa");
    const ivan = await account("Ivan");
    const up = await upload(noa, null);
    const conv = await request("/api/conversations", noa, json("POST", { userId: ivan.id }));
    assert.equal(conv.status, 200, await conv.clone().text());
    const { id } = await conv.json() as { id: string };
    const { eq } = await import("drizzle-orm");
    // El índice único no deja duplicar el aviso directo en la base
    const dupe = { conversationId: id, senderId: noa.id, kind: "album", albumId: up.albumId };
    await db.insert(schema.directMessage).values({ ...dupe, id: randomUUID() });
    await assert.rejects(async () => {
      await db.insert(schema.directMessage).values({ ...dupe, id: randomUUID() });
    });
    await db.delete(schema.directMessage).where(eq(schema.directMessage.conversationId, id));
    // Doble submit a la vez: los dos andan y queda un solo aviso
    const [first, second] = await Promise.all([
      share(up.albumId, ivan, 1, noa),
      share(up.albumId, ivan, 24, noa),
    ]);
    assert.equal(first.status, 200, await first.clone().text());
    assert.equal(second.status, 200, await second.clone().text());
    const both = await db.select().from(schema.directMessage).where(eq(schema.directMessage.senderId, noa.id));
    assert.equal(both.length, 1);
    assert.equal(both[0].albumId, up.albumId);
    // Un aviso viejo sin álbum más nuevo que el del álbum no rompe al compartir de nuevo
    await db.update(schema.directMessage).set({ createdAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.directMessage.id, both[0].id));
    await db.insert(schema.directMessage).values({
      id: randomUUID(), conversationId: id, senderId: noa.id, kind: "album", body: "1 hora",
    });
    assert.equal((await share(up.albumId, ivan, 168, noa)).status, 200);
    const after = await db.select().from(schema.directMessage).where(eq(schema.directMessage.senderId, noa.id));
    assert.equal(after.length, 1);
    assert.deepEqual([after[0].kind, after[0].body, after[0].albumId], ["album", "7 días", up.albumId]);
  });

  await t.test("borrar un álbum conserva su aviso y el del otro álbum", async () => {
    const owner = await account("Lina");
    const guest = await account("Mateo");
    const first = (await upload(owner, null)).albumId;
    const second = await createAlbum(owner, "Segundo");
    const { eq } = await import("drizzle-orm");
    const notices = () => db.select().from(schema.directMessage).where(eq(schema.directMessage.senderId, owner.id));
    assert.equal((await share(first, guest, 1, owner)).status, 200);
    assert.equal((await share(second, guest, null, owner)).status, 200);
    const before = new Map((await notices()).map((row) => [row.albumId, row.id]));
    assert.equal((await request(`/api/album/albums/${second}`, owner, { method: "DELETE" })).status, 200);
    assert.equal((await share(first, guest, 24, owner)).status, 200);
    const after = new Map((await notices()).map((row) => [row.albumId, row]));
    assert.equal(after.size, 2);
    assert.equal(after.get(first)?.id, before.get(first));
    assert.equal(after.get(second)?.id, before.get(second));
    assert.equal(after.get(first)?.kind, "album");
    assert.equal(after.get(second)?.kind, "album_revoked");
  });

  await t.test("el resumen no queda rancio: al vencer muestra el aviso vencido", async () => {
    const uli = await account("Uli");
    const vera = await account("Vera");
    const up = await upload(uli, null);
    const conv = await request("/api/conversations", uli, json("POST", { userId: vera.id }));
    assert.equal(conv.status, 200, await conv.clone().text());
    const { id } = await conv.json() as { id: string };
    type Summary = { last: { id: string; kind: string; expiresAt?: string | null; readAt: string | null } };
    async function summary(viewer: Account): Promise<Summary> {
      const res = await request(`/api/conversations/${id}/summary`, viewer);
      assert.equal(res.status, 200, await res.clone().text());
      return await res.json() as Summary;
    }
    assert.equal((await share(up.albumId, vera, 1, uli)).status, 200);
    const fresh = await summary(uli);
    assert.equal(fresh.last.kind, "album");
    assert.equal(typeof fresh.last.expiresAt, "string");
    const read = await request(`/api/conversations/${id}/read`, vera, json("POST", { messageIds: [fresh.last.id] }));
    assert.equal(read.status, 200);
    // Al vencer, la bandeja inicial y el resumen muestran el mismo estado.
    const { and, eq } = await import("drizzle-orm");
    await db.update(schema.albumGrant).set({ expiresAt: new Date(0) })
      .where(and(eq(schema.albumGrant.albumId, up.albumId), eq(schema.albumGrant.granteeId, vera.id)));
    const inbox = await request("/api/conversations", vera);
    assert.equal(inbox.status, 200);
    assert.equal(((await inbox.json()) as Summary[])[0].last.kind, "album_expired");
    assert.equal((await summary(uli)).last.kind, "album_expired");
    assert.equal((await summary(vera)).last.kind, "album_expired");
    const [stored] = await db.select().from(schema.directMessage).where(eq(schema.directMessage.id, fresh.last.id));
    assert.equal(stored.kind, "album");
    assert.ok(stored.readAt);
    assert.equal((await share(up.albumId, vera, 24, uli)).status, 200);
    const { last } = await summary(vera);
    assert.equal(last.id, fresh.last.id);
    assert.equal(last.kind, "album");
    assert.equal(last.readAt, null);
  });
});
