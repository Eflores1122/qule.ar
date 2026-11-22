import { eq, isNotNull, or, sql } from "drizzle-orm";
import { emailFingerprint, LEGACY_TEXT_PREFIX } from "../crypt.js";
import type { DB } from "./index.js";
import { directMessage, profile, report, restrictedEmail, user } from "./schema.js";

/** La migración marca valores previos antes de que Drizzle los lea como texto cifrado. */
export async function encryptLegacySensitiveText(db: DB) {
  const pattern = `${LEGACY_TEXT_PREFIX}%`;
  const reportFields = { targetName: report.targetName, messageBody: report.messageBody, details: report.details, resolution: report.resolution };
  // Valida la clave también en instalaciones que solo guardan datos sensibles en mensajes o denuncias.
  await db.select({ body: directMessage.body }).from(directMessage).where(sql`${directMessage.body} like 'v1:%'`).limit(1);
  const reportColumns = Object.values(reportFields);
  await db.select(reportFields).from(report).where(or(...reportColumns.map((column) => sql`${column} like 'v1:%'`))).limit(1);
  for (;;) {
    const count = await db.transaction(async (tx) => {
      const messages = await tx.select({ id: directMessage.id, body: directMessage.body }).from(directMessage)
        .where(sql`${directMessage.body} like ${pattern}`).limit(300).for("update");
      for (const { id, body } of messages) await tx.update(directMessage).set({ body }).where(eq(directMessage.id, id));
      const reports = await tx.select({ id: report.id, ...reportFields }).from(report)
        .where(or(...reportColumns.map((column) => sql`${column} like ${pattern}`))).limit(300).for("update");
      for (const { id, ...values } of reports) await tx.update(report).set(values).where(eq(report.id, id));
      return messages.length + reports.length;
    });
    if (count === 0) return;
  }
}

export async function preserveSuspendedEmails(db: DB) {
  const suspended = await db.select({ subjectId: user.id, email: user.email }).from(user)
    .innerJoin(profile, eq(profile.userId, user.id)).where(isNotNull(profile.suspendedAt));
  for (const { subjectId, email } of suspended) {
    await db.insert(restrictedEmail).values({ subjectId, fingerprint: emailFingerprint(email) }).onConflictDoNothing();
  }
}
