import { sql, type SQL } from "drizzle-orm";
import { env } from "./env.js";

/**
 * ¿El perfil aparece en Gente? Las cuentas nuevas, recién cuando confirman el mail (las de Google ya vienen
 * confirmadas). Las creadas antes de EMAIL_VERIFY_SINCE siguen apareciendo aunque no lo hayan confirmado.
 */
export const isListed = (u: { emailVerified: boolean; createdAt: Date }) =>
  u.emailVerified || u.createdAt < env.EMAIL_VERIFY_SINCE;

/** Lo mismo en SQL, para la grilla de Gente. `userId` es la columna con el id de la cuenta. */
export const listedSql = (userId: SQL) =>
  sql`exists (select 1 from "user" uv where uv.id = ${userId} and (uv.email_verified or uv.created_at < ${env.EMAIL_VERIFY_SINCE.toISOString()}::timestamptz))`;
