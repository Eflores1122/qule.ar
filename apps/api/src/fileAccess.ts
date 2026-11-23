import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { auth, type AuthUser } from "./auth.js";
import { db, schema } from "./db/index.js";
import type { AppEnv } from "./lib.js";
import { broadcast, onBroadcast } from "./shared.js";

/**
 * Atajos para /api/files, el pedido más repetido de la app: una grilla de Gente son 60 fotos.
 * Antes, cada foto buscaba la sesión, el perfil y de qué era el archivo: entre 4 y 6 consultas a la base.
 *
 * - La sesión se recuerda un minuto por cookie. Cerrar sesión o una suspensión tardan como mucho eso en
 *   cortar el acceso a las fotos; el resto de la API sigue chequeando en cada pedido.
 * - Las fotos públicas (de perfil o de un grupo activo) se recuerdan un minuto. Al borrarlas, pasarlas al
 *   álbum privado o dar de baja el grupo se olvidan al toque en todos los procesos (forgetFile).
 * - Las privadas, las de mensajes y los videos se chequean siempre, como antes.
 */

const SESSION_MS = 60_000;
const PUBLIC_MS = 60_000;
/** Tope de entradas: si se llena, se vacía entera (es solo un atajo, se vuelve a llenar sola). */
const MAX_ENTRIES = 50_000;

type CachedSession = { user: AuthUser; suspended: boolean; until: number };
const sessions = new Map<string, CachedSession>();
const publicFiles = new Map<string, number>();

function remember<V>(map: Map<string, V>, key: string, value: V) {
  if (map.size >= MAX_ENTRIES) map.clear();
  map.set(key, value);
}

/** La cookie de sesión de Better Auth (con prefijo __Secure- en producción). */
export function sessionCookie(cookieHeader: string | undefined): string | null {
  const m = /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=([^;]+)/.exec(cookieHeader ?? "");
  return m ? m[1] : null;
}

/** Como requireUser, pero recordando la sesión un minuto. Solo deja `user`: /files no usa el perfil. */
export const requireUserForFiles = createMiddleware<AppEnv>(async (c, next) => {
  const token = sessionCookie(c.req.header("cookie"));
  const now = Date.now();
  let s = token ? sessions.get(token) : undefined;
  if (!s || s.until < now) {
    const found = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!found) {
      if (token) sessions.delete(token);
      throw new HTTPException(401, { message: "Tenés que iniciar sesión" });
    }
    const [p] = await db.select({ suspendedAt: schema.profile.suspendedAt }).from(schema.profile)
      .where(eq(schema.profile.userId, found.user.id));
    s = { user: found.user, suspended: Boolean(p?.suspendedAt), until: now + SESSION_MS };
    if (token) remember(sessions, token, s);
  }
  if (s.suspended) throw new HTTPException(403, { message: "Tu cuenta está suspendida" });
  c.set("user", s.user);
  await next();
});

/** ¿Este archivo es una foto pública que ya se chequeó hace menos de un minuto? */
export function isKnownPublic(key: string, now = Date.now()) {
  const until = publicFiles.get(key);
  if (until === undefined) return false;
  if (until < now) {
    publicFiles.delete(key);
    return false;
  }
  return true;
}

export function rememberPublic(key: string, now = Date.now()) {
  remember(publicFiles, key, now + PUBLIC_MS);
}

/** El archivo dejó de ser público (se borró, pasó al álbum privado o se dio de baja su grupo): en todos los procesos. */
export function forgetFile(key: string | null | undefined) {
  if (key) broadcast("forgetFile", key);
}

onBroadcast("forgetFile", (key) => {
  if (typeof key === "string") publicFiles.delete(key);
});
