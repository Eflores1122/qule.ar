import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

process.env.NODE_ENV = "test";
process.env.SIGNUP_POW_BITS = "8";
process.env.BETTER_AUTH_SECRET = "clave-de-pruebas-del-desafio";
const { issueChallenge, leadingZeroBits, solve, verifySolution } = await import("./botCheck.js");

test("cuenta los bits en cero del principio", () => {
  assert.equal(leadingZeroBits(Buffer.from([0xff])), 0);
  assert.equal(leadingZeroBits(Buffer.from([0x00, 0x01])), 15);
  assert.equal(leadingZeroBits(Buffer.from([0x00, 0x00, 0x80])), 16);
  assert.equal(leadingZeroBits(Buffer.from([0x0f])), 4);
});

test("acepta una solución correcta una sola vez", async () => {
  const { challenge, bits } = issueChallenge();
  assert.equal(bits, 8);
  const nonce = solve(challenge, bits);
  assert.ok(leadingZeroBits(createHash("sha256").update(`${challenge}:${nonce}`).digest()) >= 8);
  assert.equal(await verifySolution(`${challenge}:${nonce}`), "ok");
  assert.equal(await verifySolution(`${challenge}:${nonce}`), "used");
});

test("rechaza lo que falta, lo inventado y lo vencido", async () => {
  assert.equal(await verifySolution(undefined), "missing");
  assert.equal(await verifySolution("cualquier-cosa"), "invalid");
  const { challenge, bits } = issueChallenge();
  const nonce = solve(challenge, bits);
  // Firma cambiada
  const forged = challenge.replace(/\.[^.]+$/, ".firmatrucha");
  assert.equal(await verifySolution(`${forged}:${nonce}`), "invalid");
  // Más fácil que lo exigido, aunque esté bien firmado
  const easy = issueChallenge(1);
  assert.equal(await verifySolution(`${easy.challenge}:${solve(easy.challenge, 1)}`), "invalid");
  // Un número que no resuelve
  let wrong = 0;
  while (leadingZeroBits(createHash("sha256").update(`${challenge}:${wrong}`).digest()) >= bits) wrong++;
  assert.equal(await verifySolution(`${challenge}:${wrong}`), "invalid");
  // Vencido
  const old = issueChallenge(8, Date.now() - 11 * 60_000);
  assert.equal(await verifySolution(`${old.challenge}:${solve(old.challenge, 8)}`), "expired");
});
