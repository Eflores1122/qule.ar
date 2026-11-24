import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env.js";
import { hit } from "./shared.js";

/**
 * Chequeo anti-bots al crear una cuenta, sin terceros: nada de reCAPTCHA ni de mandar datos afuera.
 *
 * Es una "prueba de trabajo": el servidor da un desafío firmado y el navegador busca un número que, junto con el
 * desafío, dé un SHA-256 que empiece con SIGNUP_POW_BITS bits en cero. Con 16 bits son unas 65.000 cuentas: un par
 * de segundos en un celu, mientras la persona completa el formulario. A un bot que crea miles de cuentas le sale caro.
 *
 * El desafío vence a los 10 minutos y sirve una sola vez. Además, el formulario tiene un campo trampa invisible:
 * si viene completo, es un bot.
 */
const TTL_MS = 10 * 60_000;
const secret = createHash("sha256").update(`desafio:${env.BETTER_AUTH_SECRET}`).digest();
const sign = (payload: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export function issueChallenge(bits = env.SIGNUP_POW_BITS, now = Date.now()) {
  const payload = `${randomBytes(12).toString("base64url")}.${now + TTL_MS}.${bits}`;
  return { challenge: `${payload}.${sign(payload)}`, bits };
}

export function leadingZeroBits(hash: Buffer): number {
  let bits = 0;
  for (const byte of hash) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    return bits + Math.clz32(byte) - 24;
  }
  return bits;
}

/** Lo mismo que hace el navegador (ver apps/web/src/features/auth/botCheck.ts). Para las pruebas. */
export function solve(challenge: string, bits: number): string {
  for (let n = 0; ; n++) {
    if (leadingZeroBits(createHash("sha256").update(`${challenge}:${n}`).digest()) >= bits) return String(n);
  }
}

export type CheckResult = "ok" | "missing" | "invalid" | "expired" | "used";

/** Revisa la solución que manda el navegador (encabezado x-qule-desafio: "desafío:número"). */
export async function verifySolution(header: string | null | undefined, now = Date.now()): Promise<CheckResult> {
  if (!header) return "missing";
  const cut = header.lastIndexOf(":");
  if (cut < 0) return "invalid";
  const challenge = header.slice(0, cut);
  const nonce = header.slice(cut + 1);
  const parts = challenge.split(".");
  if (parts.length !== 4 || !/^\d{1,12}$/.test(nonce)) return "invalid";
  const [id, expires, bits, mac] = parts;
  const expected = Buffer.from(sign(`${id}.${expires}.${bits}`));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return "invalid";
  // No se acepta un desafío más fácil que el que se exige hoy
  if (Number(bits) < env.SIGNUP_POW_BITS) return "invalid";
  if (Number(expires) < now) return "expired";
  if (leadingZeroBits(createHash("sha256").update(`${challenge}:${nonce}`).digest()) < Number(bits)) return "invalid";
  // Una sola vez, contando en todos los procesos del API
  if (!(await hit(`desafio:${id}`, 1, TTL_MS))) return "used";
  return "ok";
}
