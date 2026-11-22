// Lo que en otras apps es "premium", acá es gratis para todo el mundo.
import { and, asc, desc, eq, gt, isNull, lte, notInArray, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { authorsFor, blockedWith, isBlocked, newId, requireProfile, requireUser, type AppEnv } from "../lib.js";
import { emitToUser } from "../realtime.js";
import { pushTo } from "../push.js";
import { APP_NAME } from "../brand.js";

const { albumGrant, profileView, favorite, conversation, directMessage, profile } = schema;

/** Cuántos días se guardan las visitas a tu perfil. */
const VIEWS_DAYS = 30;

export const premiumRoutes = new Hono<AppEnv>();
for (const p of ["/me/views", "/favorites", "/favorites/*", "/album/*"]) {
  premiumRoutes.use(p, requireUser, requireProfile);
}

// ---------- Quién me vio ----------

/** Registra una visita, salvo que quien mira esté en incógnito o se esté mirando a sí mismo. */
export async function recordView(viewerId: string, viewerIncognito: boolean, viewedId: string) {
  if (viewerId === viewedId || viewerIncognito) return;
  const now = new Date();
  await db
    .insert(profileView)
    .values({ viewerId, viewedId, viewedAt: now })
    .onConflictDoUpdate({ target: [profileView.viewerId, profileView.viewedId], set: { viewedAt: sql`greatest(${profileView.viewedAt}, ${now.toISOString()}::timestamptz)` } });
}

premiumRoutes.get("/me/views", async (c) => {
  const u = c.get("user");
  const days = z.enum(["1", "7", "30"]).optional().safeParse(c.req.query("days"));
  if (!days.success) throw new HTTPException(400, { message: "Período inválido" });
  const since = new Date(Date.now() - (Number(days.data) || VIEWS_DAYS) * 86_400_000);
  const blocked = [...await blockedWith(u.id)];
  const rows = await db
    .select({ viewerId: profileView.viewerId, viewedAt: profileView.viewedAt })
    .from(profileView)
    .innerJoin(profile, eq(profile.userId, profileView.viewerId))
    .where(and(
      eq(profileView.viewedId, u.id), gt(profileView.viewedAt, since),
      eq(profile.incognito, false), isNull(profile.suspendedAt),
      blocked.length ? notInArray(profileView.viewerId, blocked) : undefined,
    ))
    .orderBy(desc(profileView.viewedAt), asc(profileView.viewerId))
    .limit(200);
  const authors = await authorsFor(rows.map((r) => r.viewerId));
  return c.json(rows.flatMap((r) => {
    const a = authors.get(r.viewerId);
    return a ? [{ ...a, viewedAt: r.viewedAt.toISOString() }] : [];
  }));
});

// ---------- Favoritos ----------

premiumRoutes.get("/favorites", async (c) => {
  const u = c.get("user");
  const rows = await db.select().from(favorite).where(eq(favorite.userId, u.id)).orderBy(desc(favorite.createdAt));
  const blocked = await blockedWith(u.id);
  const ids = rows.map((r) => r.favoriteId).filter((id) => !blocked.has(id));
  const authors = await authorsFor(ids);
  return c.json(ids.flatMap((id) => (authors.get(id) ? [authors.get(id)!] : [])));
});

premiumRoutes.put("/favorites/:userId", async (c) => {
  const u = c.get("user");
  const target = c.req.param("userId");
  if (target === u.id) throw new HTTPException(400, { message: "No podés marcarte como favorito" });
  await db.insert(favorite).values({ userId: u.id, favoriteId: target }).onConflictDoNothing();
  return c.json({ ok: true });
});

premiumRoutes.delete("/favorites/:userId", async (c) => {
  const u = c.get("user");
  await db.delete(favorite).where(and(eq(favorite.userId, u.id), eq(favorite.favoriteId, c.req.param("userId"))));
  return c.json({ ok: true });
});

// ---------- Álbum privado ----------

/** Por cuánto tiempo se puede compartir el álbum, en horas. null = sin límite. */
export const ALBUM_DURATIONS = [1, 24, 168] as const;

function durationLabel(hours: number | null) {
  if (hours == null) return null;
  if (hours === 1) return "1 hora";
  if (hours === 168) return "7 días";
  return `${hours} horas`;
}

const activeGrant = (now = new Date()) => or(isNull(albumGrant.expiresAt), gt(albumGrant.expiresAt, now));

export async function hasAlbumAccess(ownerId: string, viewerId: string) {
  if (ownerId === viewerId) return true;
  const grant = await currentAlbumGrant(ownerId, viewerId);
  return Boolean(grant?.acceptedAt) && !(await isBlocked(ownerId, viewerId));
}

export async function currentAlbumGrant(ownerId: string, viewerId: string) {
  const [g] = await db
    .select()
    .from(albumGrant)
    .where(and(eq(albumGrant.ownerId, ownerId), eq(albumGrant.granteeId, viewerId), activeGrant()));
  return g;
}

/** Con quién compartí mi álbum privado (solo los accesos vigentes). */
premiumRoutes.get("/album/grants", async (c) => {
  const u = c.get("user");
  // Los vencidos se limpian acá
  await db.delete(albumGrant).where(and(eq(albumGrant.ownerId, u.id), lte(albumGrant.expiresAt, new Date())));
  const rows = await db.select().from(albumGrant).where(eq(albumGrant.ownerId, u.id)).orderBy(desc(albumGrant.createdAt));
  const authors = await authorsFor(rows.map((r) => r.granteeId));
  return c.json(rows.flatMap((r) => {
    const a = authors.get(r.granteeId);
    return a ? [{ ...a, expiresAt: r.expiresAt?.toISOString() ?? null, pending: !r.acceptedAt }] : [];
  }));
});

/**
 * Compartir mi álbum privado con alguien, por un tiempo o sin límite. Si ya lo tenía, se actualiza el plazo.
 * Le llega como mensaje en el chat (solo si no lo tenía vigente).
 */
premiumRoutes.put("/album/grants/:userId", async (c) => {
  const u = c.get("user");
  const target = c.req.param("userId");
  const { hours } = z
    .object({ hours: z.union([z.literal(1), z.literal(24), z.literal(168), z.null()]).default(null) })
    .parse(await c.req.json().catch(() => ({})));
  if (target === u.id) throw new HTTPException(400, { message: "Ya ves tu propio álbum" });
  if (await isBlocked(u.id, target)) throw new HTTPException(404, { message: "Perfil no disponible" });
  const [p] = await db.select().from(profile).where(eq(profile.userId, target));
  if (!p) throw new HTTPException(404, { message: "Perfil no disponible" });

  const previous = await currentAlbumGrant(u.id, target);
  const now = new Date();
  const expiresAt = hours == null ? null : new Date(now.getTime() + hours * 3_600_000);
  const [grant] = await db
    .insert(albumGrant)
    .values({ ownerId: u.id, granteeId: target, expiresAt, createdAt: now })
    .onConflictDoUpdate({
      target: [albumGrant.ownerId, albumGrant.granteeId],
      set: {
        expiresAt,
        createdAt: now,
        acceptedAt: sql`case when ${albumGrant.expiresAt} <= ${now.toISOString()}::timestamptz then null else ${albumGrant.acceptedAt} end`,
      },
    }).returning({ acceptedAt: albumGrant.acceptedAt });

  if (!previous) {
    // Aviso en la conversación (la crea si no existe). El cuerpo dice por cuánto tiempo.
    const key = u.id < target ? { userA: u.id, userB: target } : { userA: target, userB: u.id };
    await db.insert(conversation).values({ id: newId(), ...key }).onConflictDoNothing();
    const [conv] = await db.select().from(conversation)
      .where(and(eq(conversation.userA, key.userA), eq(conversation.userB, key.userB)));
    const body = durationLabel(hours);
    const [row] = await db.insert(directMessage)
      .values({ id: newId(), conversationId: conv.id, senderId: u.id, kind: "album", body, createdAt: now })
      .returning();
    await db.update(conversation).set({ lastMessageAt: now }).where(eq(conversation.id, conv.id));
    const msg = {
      id: row.id, conversationId: conv.id, senderId: u.id, kind: "album", body, photo: null,
      expiring: false, opened: false, readAt: null, createdAt: now.toISOString(),
    };
    emitToUser(u.id, "dm:message", msg);
    emitToUser(target, "dm:message", msg);
    pushTo(target, { title: APP_NAME, body: "Tenés un mensaje nuevo", url: `/mensajes/${conv.id}`, tag: `dm-${conv.id}` }).catch(() => {});
  }
  return c.json({ ok: true, expiresAt: expiresAt?.toISOString() ?? null, pending: !grant.acceptedAt });
});

/** La persona invitada elige si habilita el acceso. Un reintento conserva la primera aceptación. */
premiumRoutes.put("/album/invitations/:ownerId", async (c) => {
  const viewer = c.get("user").id;
  const owner = c.req.param("ownerId");
  if (await isBlocked(owner, viewer)) return c.notFound();
  const [accepted] = await db.update(albumGrant)
    .set({ acceptedAt: sql`coalesce(${albumGrant.acceptedAt}, now())` })
    .where(and(eq(albumGrant.ownerId, owner), eq(albumGrant.granteeId, viewer), activeGrant()))
    .returning({ ownerId: albumGrant.ownerId });
  if (!accepted) return c.notFound();
  return c.json({ ok: true });
});

premiumRoutes.delete("/album/invitations/:ownerId", async (c) => {
  await db.delete(albumGrant).where(and(
    eq(albumGrant.ownerId, c.req.param("ownerId")), eq(albumGrant.granteeId, c.get("user").id), isNull(albumGrant.acceptedAt),
  ));
  return c.json({ ok: true });
});

premiumRoutes.delete("/album/grants/:userId", async (c) => {
  const u = c.get("user");
  await db.delete(albumGrant).where(and(eq(albumGrant.ownerId, u.id), eq(albumGrant.granteeId, c.req.param("userId"))));
  return c.json({ ok: true });
});

/** Quita de una vez todos los accesos al álbum de quien inició sesión. */
premiumRoutes.delete("/album/grants", async (c) => {
  const u = c.get("user");
  await db.delete(albumGrant).where(eq(albumGrant.ownerId, u.id));
  return c.json({ ok: true });
});
