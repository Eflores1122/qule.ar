import { eq, like, notLike, or } from "drizzle-orm";
import { ENCRYPTED_PREFIX } from "../crypt.js";
import type { DB } from "./index.js";
import { profile } from "./schema.js";

export function encryptLegacyHealth(db: DB) {
  const pattern = `${ENCRYPTED_PREFIX}%`;
  const health = { hivStatus: profile.hivStatus, lastTested: profile.lastTested };

  return db.transaction(async (tx) => {
    // Drizzle descifra la muestra para validar la clave antes de atender o cifrar datos nuevos.
    await tx.select(health).from(profile)
      .where(or(like(profile.hivStatus, pattern), like(profile.lastTested, pattern)))
      .limit(1);

    const legacy = await tx.select({ id: profile.userId, ...health }).from(profile)
      .where(or(notLike(profile.hivStatus, pattern), notLike(profile.lastTested, pattern)))
      .for("update");
    for (const { id, ...values } of legacy) {
      await tx.update(profile).set(values).where(eq(profile.userId, id));
    }
    return legacy.length;
  });
}
