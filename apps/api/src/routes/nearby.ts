import { and, asc, between, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, notInArray, or } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { boundingBox, distanceLabel, snapToCell, visibleKm } from "../geo.js";
import { ageFrom, blockedWith, thumbUrl, requireProfile, requireUser, type AppEnv } from "../lib.js";
import { autoHiddenUsers } from "../moderation.js";
import { isOnline } from "../realtime.js";

const { profile, photo } = schema;

const PAGE = 60;
const MAX_CANDIDATES = 3000;
const REGIONAL_LIMIT = MAX_CANDIDATES / 2;
const REGIONAL_KM = 150;
/** Cuánto tiempo después de cerrar la app se te sigue mostrando como "hace un rato". */
const RECENT_MS = 15 * 60_000;

export const nearbyRoutes = new Hono<AppEnv>();
nearbyRoutes.use("/nearby", requireUser, requireProfile);
nearbyRoutes.use("/me/location", requireUser, requireProfile);
nearbyRoutes.use("/me/privacy", requireUser, requireProfile);

/**
 * Cuántas veces por hora se puede cambiar de zona. Alguien que se mueve de verdad cambia pocas veces; quien
 * intenta triangular a otra persona necesita moverse muchas. Pasado el límite se ignora en silencio.
 */
const MAX_CELL_CHANGES_PER_HOUR = 20;
const cellChanges = new Map<string, number[]>();

/**
 * Guarda la ubicación redondeada a la celda. La posición exacta no se guarda ni se loguea.
 * `auto`: la manda la app sola para mantenerla al día. Si la persona borró su ubicación, se ignora:
 * volver a aparecer en la grilla siempre lo decide ella, tocando "Compartir".
 */
nearbyRoutes.put("/me/location", async (c) => {
  const u = c.get("user");
  const r = z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), auto: z.boolean().optional() })
    .safeParse(await c.req.json());
  if (!r.success) throw new HTTPException(400, { message: "Ubicación inválida" });
  const me = c.get("profile")!;
  if (r.data.auto && (me.cellLat == null || me.cellLng == null)) return c.json({ ok: true });
  const cell = snapToCell(r.data.lat, r.data.lng);
  if (me.cellLat !== cell.lat || me.cellLng !== cell.lng) {
    const hourAgo = Date.now() - 3_600_000;
    const recent = (cellChanges.get(u.id) ?? []).filter((t) => t > hourAgo);
    if (recent.length >= MAX_CELL_CHANGES_PER_HOUR) return c.json({ ok: true });
    recent.push(Date.now());
    cellChanges.set(u.id, recent);
  }
  await db
    .update(profile)
    .set({ cellLat: cell.lat, cellLng: cell.lng, locationUpdatedAt: new Date() })
    // Si la persona borró la ubicación mientras llegaba el pedido, tampoco la volvemos a guardar.
    .where(and(
      eq(profile.userId, u.id),
      r.data.auto ? and(isNotNull(profile.cellLat), isNotNull(profile.cellLng)) : undefined,
    ));
  return c.json({ ok: true });
});

/** Borra la ubicación: dejás de aparecer en la grilla. */
nearbyRoutes.delete("/me/location", async (c) => {
  const u = c.get("user");
  await db.update(profile).set({ cellLat: null, cellLng: null, locationUpdatedAt: null }).where(eq(profile.userId, u.id));
  return c.json({ ok: true });
});

nearbyRoutes.put("/me/privacy", async (c) => {
  const u = c.get("user");
  const data = z.object({ showDistance: z.boolean().optional(), incognito: z.boolean().optional() }).parse(await c.req.json());
  await db.update(profile).set(data).where(eq(profile.userId, u.id));
  return c.json({ ok: true });
});

const list = z
  .string()
  .optional()
  .transform((s) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 20) : []));
const int = z.coerce.number().int().optional();

const filtersSchema = z.object({
  ageMin: int, ageMax: int,
  heightMin: int, heightMax: int,
  weightMin: int, weightMax: int,
  bodyType: list, position: list, tribes: list, lookingFor: list, relationship: list,
  online: z.enum(["1"]).optional(),
  withPhoto: z.enum(["1"]).optional(),
  favorites: z.enum(["1"]).optional(),
  offset: z.coerce.number().int().min(0).max(MAX_CANDIDATES).default(0),
});

export type NearbyFilters = z.infer<typeof filtersSchema>;

function longitudeWindow(minLng: number, maxLng: number) {
  if (maxLng - minLng >= 360) return isNotNull(profile.cellLng);
  if (minLng < -180) return or(gte(profile.cellLng, minLng + 360), lte(profile.cellLng, maxLng));
  if (maxLng > 180) return or(gte(profile.cellLng, minLng), lte(profile.cellLng, maxLng - 360));
  return between(profile.cellLng, minLng, maxLng);
}

/** Grilla de gente cerca, de la más cercana a la más lejana. */
nearbyRoutes.get("/nearby", async (c) => {
  const u = c.get("user");
  const me = c.get("profile")!;
  // Las distancias visibles dan prioridad a la zona. La grilla también incluye actividad de otras zonas.
  const meHasLoc = me.cellLat != null && me.cellLng != null;
  const f = filtersSchema.parse(c.req.query());
  const blocked = await blockedWith(u.id);
  // Ocultos por precaución: varios reportes urgentes sin revisar (ver moderation.ts)
  const hidden = await autoHiddenUsers();
  const favs = new Set(
    (await db.select({ id: schema.favorite.favoriteId }).from(schema.favorite).where(eq(schema.favorite.userId, u.id))).map((r) => r.id),
  );

  const discoverable = and(ne(profile.userId, u.id), eq(profile.incognito, false), isNull(profile.suspendedAt));
  const order = [desc(profile.lastSeenAt), asc(profile.userId)] as const;
  const localBox = me.showDistance && me.cellLat != null && me.cellLng != null
    ? boundingBox(me.cellLat, me.cellLng, REGIONAL_KM)
    : null;
  // Reservá parte de la grilla para los perfiles cercanos que sí eligen mostrar distancia.
  const regional = localBox
    ? await db.select().from(profile).where(and(
      discoverable, eq(profile.showDistance, true),
      between(profile.cellLat, localBox.minLat, localBox.maxLat),
      longitudeWindow(localBox.minLng, localBox.maxLng),
    )).orderBy(...order).limit(REGIONAL_LIMIT)
    : [];
  const recent = await db
    .select()
    .from(profile)
    .where(and(
      discoverable,
      regional.length ? notInArray(profile.userId, regional.map((row) => row.userId)) : undefined,
    ))
    .orderBy(...order)
    .limit(MAX_CANDIDATES - regional.length);
  const rows = [...regional, ...recent];

  const anyOf = (wanted: string[], value: string | null) => !wanted.length || (value != null && wanted.includes(value));
  const overlap = (wanted: string[], values: string[]) => !wanted.length || values.some((v) => wanted.includes(v));
  const inRange = (v: number | null, min?: number, max?: number) =>
    (min == null && max == null) || (v != null && (min == null || v >= min) && (max == null || v <= max));
  const now = Date.now();

  const candidates = rows
    .filter((p) => !blocked.has(p.userId) && !hidden.has(p.userId) && (!f.favorites || favs.has(p.userId)))
    .map((p) => {
      const km = visibleKm(me, p);
      const on = isOnline(p.userId);
      return { p, km, age: ageFrom(p.birthdate), online: on, recent: on || now - p.lastSeenAt.getTime() < RECENT_MS };
    })
    .filter(({ p, km, age, online }) =>
      inRange(age, f.ageMin, f.ageMax) &&
      inRange(p.heightCm, f.heightMin, f.heightMax) &&
      inRange(p.weightKg, f.weightMin, f.weightMax) &&
      anyOf(f.bodyType, p.bodyType) &&
      anyOf(f.position, p.position) &&
      anyOf(f.relationship, p.relationship) &&
      overlap(f.tribes, p.tribes) &&
      overlap(f.lookingFor, p.lookingFor) &&
      (!f.online || online),
    );

  // Primero la distancia (por celda; quien no tiene ubicación va al final); a igual distancia, quien está en línea va antes
  const far = Number.POSITIVE_INFINITY;
  candidates.sort((a, b) =>
    (a.km ?? far) - (b.km ?? far) ||
    Number(b.online) - Number(a.online) ||
    b.p.lastSeenAt.getTime() - a.p.lastSeenAt.getTime());

  // Foto principal pública de cada uno
  const ids = candidates.map((x) => x.p.userId);
  const photos = ids.length
    ? await db.select().from(photo)
        .where(and(inArray(photo.userId, ids), eq(photo.isPrivate, false)))
        .orderBy(asc(photo.position))
    : [];
  const first = new Map<string, string>();
  for (const ph of photos) if (!first.has(ph.userId)) first.set(ph.userId, ph.key);

  const filtered = f.withPhoto ? candidates.filter((x) => first.has(x.p.userId)) : candidates;
  const page = filtered.slice(f.offset, f.offset + PAGE);

  return c.json({
    needLocation: false,
    hasLocation: meHasLoc,
    locationUpdatedAt: meHasLoc ? me.locationUpdatedAt?.toISOString() ?? null : null,
    hasMore: filtered.length > f.offset + PAGE,
    total: filtered.length,
    people: page.map(({ p, km, age, online, recent }) => ({
      id: p.userId,
      name: p.displayName,
      age,
      photo: thumbUrl(first.get(p.userId)),
      online,
      recent,
      favorite: favs.has(p.userId),
      // Si cualquiera de los dos eligió esconder la distancia, km es null (ver visibleKm)
      distance: km != null ? distanceLabel(km) : null,
    })),
  });
});
