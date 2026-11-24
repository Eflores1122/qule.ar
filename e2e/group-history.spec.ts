import { expect, test } from "@playwright/test";
import { createAccount, signIn } from "./fixtures";

test("mantiene el mensaje en su lugar al cargar el historial del grupo", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await signIn(page, await createAccount(baseURL!, "Historial"));
  await page.route("**/api/groups/general/messages*", async (route) => {
    const older = new URL(route.request().url()).searchParams.has("before");
    const messages = Array.from({ length: 40 }, (_, i) => {
      const n = i + (older ? 0 : 40);
      return {
        id: String(n), body: `Mensaje ${n}`, author: { id: "autor", name: "Autor" },
        scheduledAt: new Date(1_700_000_000_000 + n * 60_000).toISOString(),
      };
    });
    await route.fulfill({ json: { messages, queued: [], hasMore: !older } });
  });
  await page.goto("/grupos/general");
  const older = page.getByRole("button", { name: "Ver mensajes anteriores" });
  await older.scrollIntoViewIfNeeded();
  const text = page.getByText("Mensaje 40", { exact: true });
  const top = await text.evaluate(el => el.getBoundingClientRect().top);
  await older.click();
  await expect(page.getByText("Mensaje 0", { exact: true })).toBeAttached();
  expect(Math.abs(await text.evaluate(el => el.getBoundingClientRect().top) - top)).toBeLessThanOrEqual(1);
});

test("abre una cita lejana con una consulta y permite cancelar el salto", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await signIn(page, await createAccount(baseURL!, "Citas"));
  const queries: string[] = [];
  let hold = false;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/groups/general/messages*", async route => {
    const query = new URL(route.request().url()).searchParams;
    queries.push(query.toString());
    const around = query.has("around");
    if (around && hold) await gate;
    const following = query.has("after");
    const start = around ? 0 : 50;
    const messages = Array.from({ length: 50 }, (_, i) => {
      const n = i + start;
      return {
        id: String(n), body: `Mensaje ${n}`, author: { id: "autor", name: "Autor" },
        scheduledAt: new Date(1_700_000_000_000 + n * 60_000).toISOString(),
        replyTo: n === 99 ? { id: "10", authorName: "Autor", body: "Mensaje 10" } : null,
      };
    });
    await route.fulfill({ json: { messages, queued: [], hasMore: !around && !following, hasNewer: around } });
  });
  await page.goto("/grupos/general");
  const quote = page.getByRole("button", { name: "Autor Mensaje 10" });
  const end = page.getByRole("button", { name: "Ir al último mensaje" });
  await quote.click();
  await expect(page.locator("#gm-10")).toBeInViewport();
  await expect(page.locator(".gmsg")).toHaveCount(50);
  expect(queries).toEqual(["", "around=10"]);
  const newer = page.getByRole("button", { name: "Ver mensajes siguientes" });
  await newer.click();
  await expect(page.locator("#gm-99")).toBeAttached();
  await expect(page.locator(".gmsg")).toHaveCount(100);
  await expect(newer).toHaveCount(0);
  const posted = await page.request.post("/api/groups/general/messages", {
    headers: { Origin: baseURL! }, data: { body: "Mensaje en vivo" },
  });
  await expect(posted).toBeOK();
  await expect(page.getByText("Mensaje en vivo", { exact: true })).toHaveCount(1);

  await page.reload();
  hold = true;
  const aborted = page.waitForEvent("requestfailed", req => req.url().includes("around=10"));
  await quote.click();
  await expect(page.getByText("Buscando el mensaje citado…")).toBeVisible();
  await end.click();
  release();
  await aborted;
  await expect(page.locator("#gm-10")).toHaveCount(0);
  await expect(page.locator("#gm-99")).toBeInViewport();
});
