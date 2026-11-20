import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "./db/index.js";
import { env } from "./env.js";
import { pushTo } from "./push.js";
import { APP_NAME } from "./brand.js";

const { report, user } = schema;

/**
 * Motivos de reporte. Los tres primeros son urgentes: se revisan primero, avisan a moderación al instante
 * y, si varias personas los reportan, ocultan el perfil de la grilla hasta que alguien lo revise.
 * Tiene que coincidir con REPORT_REASONS en apps/web/src/options.ts. Ver docs/MODERACION.md.
 */
export const REPORT_REASONS = [
  "menor de edad",
  "contenido íntimo sin consentimiento",
  "amenazas o violencia",
  "acoso",
  "fotos inapropiadas",
  "perfil falso",
  "spam",
  "otro",
] as const;
export const URGENT_REASONS: readonly string[] = REPORT_REASONS.slice(0, 3);
export const isUrgent = (reason: string) => URGENT_REASONS.includes(reason);

/** Cuántas personas distintas tienen que reportar algo urgente para ocultar el perfil de la grilla. */
export const AUTO_HIDE_REPORTERS = 3;

/** Quiénes moderan: por ID de cuenta, o por mail solo si está verificado (igual que isAdmin en routes/admin.ts). */
export async function moderatorIds(): Promise<string[]> {
  const ids = new Set(env.ADMIN_USER_IDS);
  if (env.ADMIN_EMAILS.length) {
    const rows = await db.select({ id: user.id, email: user.email, verified: user.emailVerified }).from(user)
      .where(inArray(sql`lower(${user.email})`, env.ADMIN_EMAILS));
    for (const r of rows) if (r.verified) ids.add(r.id);
  }
  return [...ids];
}

/** Aviso a moderación de un reporte urgente. Discreto, como todas las notificaciones: no dice quién ni por qué. */
export async function notifyModeratorsUrgent() {
  for (const id of await moderatorIds()) {
    pushTo(id, { title: APP_NAME, body: "Hay un reporte urgente para revisar", url: "/admin", tag: "reporte-urgente" }).catch(() => {});
  }
}

/**
 * Perfiles ocultos de la grilla por precaución: tienen reportes urgentes abiertos de AUTO_HIDE_REPORTERS
 * personas distintas. Vuelven a aparecer cuando moderación cierra esos reportes (descarta o actúa).
 * No es una suspensión: la cuenta sigue funcionando, solo deja de aparecer en "Cerca" y en las listas para invitar.
 */
export async function autoHiddenUsers(): Promise<Set<string>> {
  const rows = await db
    .select({ id: report.targetUserId })
    .from(report)
    .where(and(eq(report.status, "open"), inArray(report.reason, [...URGENT_REASONS])))
    .groupBy(report.targetUserId)
    .having(sql`count(distinct ${report.reporterId}) >= ${AUTO_HIDE_REPORTERS}`);
  return new Set(rows.map((r) => r.id));
}
