import { and, asc, gt, sql } from "drizzle-orm";
import { ENCRYPTED_SHAPE } from "../crypt.js";
import type { DB } from "./index.js";
import { directMessage, report } from "./schema.js";

const BATCH = 500;

/**
 * Cifra los mensajes privados y las copias de los reportes que se guardaron antes del cifrado.
 * Va de a tandas y en segundo plano: con muchos mensajes no frena el arranque. Mientras tanto, lo viejo se
 * sigue leyendo bien (ver encryptedMessageText en crypt.ts). Se puede cortar y volver a correr: retoma solo.
 */
export async function encryptLegacyMessages(db: DB) {
  let total = 0;
  const notEncrypted = (col: typeof directMessage.body | typeof report.messageBody) =>
    sql`${col} is not null and ${col} !~ ${ENCRYPTED_SHAPE.source}`;

  for (const [table, idCol, bodyCol] of [
    [directMessage, directMessage.id, directMessage.body],
    [report, report.id, report.messageBody],
  ] as const) {
    let after = "";
    for (;;) {
      // El texto crudo (sql``, sin pasar por la columna cifrada) para decidir qué falta cifrar
      const rows = await db.select({ id: idCol, raw: sql<string>`${bodyCol}` }).from(table)
        .where(and(gt(idCol, after), notEncrypted(bodyCol)))
        .orderBy(asc(idCol))
        .limit(BATCH);
      if (!rows.length) break;
      for (const r of rows) {
        // Al escribir, la columna cifra el texto
        if (table === directMessage) await db.update(directMessage).set({ body: r.raw }).where(sql`${directMessage.id} = ${r.id}`);
        else await db.update(report).set({ messageBody: r.raw }).where(sql`${report.id} = ${r.id}`);
      }
      total += rows.length;
      after = rows[rows.length - 1].id;
      // Deja respirar al resto de los pedidos entre tanda y tanda
      await new Promise((r) => setImmediate(r));
    }
  }
  return total;
}
