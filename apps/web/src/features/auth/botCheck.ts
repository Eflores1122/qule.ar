import { api } from "../../api";

/**
 * Chequeo anti-bots al crear una cuenta (ver apps/api/src/botCheck.ts). Busca un número que, junto con el desafío,
 * dé un SHA-256 con `bits` bits en cero al principio. Corre en segundo plano mientras la persona completa el
 * formulario: no manda nada a terceros ni hace falta tocar nada.
 */
function zeroBits(hash: Uint8Array): number {
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

const BATCH = 512;

async function solve(challenge: string, bits: number): Promise<string> {
  const enc = new TextEncoder();
  for (let start = 0; ; start += BATCH) {
    const hashes = await Promise.all(
      Array.from({ length: BATCH }, (_, i) => crypto.subtle.digest("SHA-256", enc.encode(`${challenge}:${start + i}`))),
    );
    const found = hashes.findIndex((h) => zeroBits(new Uint8Array(h)) >= bits);
    if (found >= 0) return String(start + found);
  }
}

/** Pide un desafío y lo resuelve. Devuelve el encabezado para mandar al crear la cuenta (vacío si no hace falta). */
export async function botCheckHeaders(): Promise<Record<string, string>> {
  const { challenge, bits } = await api<{ challenge: string | null; bits: number }>("/signup-challenge");
  if (!challenge || bits <= 0) return {};
  return { "x-qule-desafio": `${challenge}:${await solve(challenge, bits)}` };
}
