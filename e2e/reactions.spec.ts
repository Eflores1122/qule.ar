import { expect, request, test } from "@playwright/test";
import { createAccount } from "./fixtures";

test("se puede reaccionar con risa a un mensaje, pero no mandarla como toque", async ({ baseURL }) => {
  const ana = await createAccount(baseURL!, "Ana Risa");
  const beto = await createAccount(baseURL!, "Beto Risa");
  const login = async (account: typeof ana) => {
    const api = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL! } });
    await expect(await api.post("/api/auth/sign-in/email", { data: { email: account.email, password: account.password } })).toBeOK();
    const me = await (await api.get("/api/me")).json();
    return { api, id: me.user.id as string };
  };
  const a = await login(ana);
  const b = await login(beto);
  try {
    const conv = await (await a.api.post("/api/conversations", { data: { userId: b.id } })).json();
    const sent = await a.api.post(`/api/conversations/${conv.id}/messages`, { data: { body: "¿Sabés cuál es el colmo de un mate? Que lo ceben." } });
    await expect(sent).toBeOK();
    const message = await sent.json();

    await expect(await b.api.put(`/api/reactions/dm/${message.id}`, { data: { kind: "risa" } })).toBeOK();
    const { messages } = await (await a.api.get(`/api/conversations/${conv.id}/messages`)).json();
    expect(messages.find((m: { id: string }) => m.id === message.id).reactions).toEqual([{ kind: "risa", by: [b.id] }]);

    expect((await b.api.post(`/api/users/${a.id}/toques`, { data: { kind: "risa" } })).status()).toBe(400);
  } finally {
    await a.api.dispose();
    await b.api.dispose();
  }
});
