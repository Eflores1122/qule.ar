import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "./db/index.js";
import { env } from "./env.js";
import { pushTo } from "./push.js";
import { APP_NAME } from "./brand.js";
import { deleteImage } from "./storage.js";

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
  return new Set(rows.flatMap((r) => (r.id ? [r.id] : [])));
}

// ---------- Pruebas de los reportes ----------
// Un reporte guarda una copia del texto y la lista de archivos involucrados (evidenceKeys). Esos archivos no se
// borran mientras el reporte esté abierto o haya terminado en una medida, aunque se desenvíe el mensaje, se borre
// la foto o la cuenta. Ley 25.326, art. 16 inc. 5: la supresión no procede si perjudica derechos de terceros
// o hay obligación legal de conservar. Si moderación descarta el reporte, la copia se libera y se borra.

const KEPT = ["open", "actioned"];

/** ¿Este archivo es prueba de algún reporte abierto o que terminó en una medida? */
export async function isEvidence(key: string): Promise<boolean> {
  const [r] = await db.select({ id: report.id }).from(report)
    .where(and(inArray(report.status, KEPT), sql`${report.evidenceKeys} @> ${JSON.stringify([key])}::jsonb`))
    .limit(1);
  return Boolean(r);
}

/** Borra un archivo, salvo que sea prueba de un reporte (en ese caso queda guardado para moderación). */
export async function deleteImageUnlessEvidence(key: string) {
  if (await isEvidence(key)) return;
  await deleteImage(key);
}

/** ¿El archivo lo sigue usando algo vivo (un mensaje, una foto de perfil/álbum o la foto de un grupo)? */
async function stillInUse(key: string) {
  const [m] = await db.select({ id: schema.directMessage.id }).from(schema.directMessage)
    .where(eq(schema.directMessage.photoKey, key)).limit(1);
  if (m) return true;
  const [p] = await db.select({ id: schema.photo.id }).from(schema.photo)
    .where(or(eq(schema.photo.key, key), eq(schema.photo.posterKey, key))).limit(1);
  if (p) return true;
  const [g] = await db.select({ id: schema.group.id }).from(schema.group).where(eq(schema.group.photoKey, key)).limit(1);
  return Boolean(g);
}

/** Al descartar reportes: se borra la copia del texto y los archivos que ya nadie usa ni son prueba de otro reporte. */
export async function releaseEvidence(reportIds: string[]) {
  if (!reportIds.length) return;
  const rows = await db.select({ keys: report.evidenceKeys }).from(report).where(inArray(report.id, reportIds));
  await db.update(report).set({ messageBody: null, evidenceKeys: [] }).where(inArray(report.id, reportIds));
  for (const key of new Set(rows.flatMap((r) => r.keys))) {
    if (!(await isEvidence(key)) && !(await stillInUse(key))) await deleteImage(key);
  }
}
