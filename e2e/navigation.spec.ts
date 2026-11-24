import { expect, request, test } from "@playwright/test";
import { createAccount, signIn } from "./fixtures";

test("Volver desde un grupo deja la búsqueda y la pestaña como estaban", async ({ page, baseURL }) => {
  const owner = await createAccount(baseURL!, "Dueña Vuelta");
  const viewer = await createAccount(baseURL!, "Visita Vuelta");
  const word = `Vuelta${owner.email.slice(0, 6)}`;

  const api = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL! } });
  try {
    await expect(await api.post("/api/auth/sign-in/email", { data: { email: owner.email, password: owner.password } })).toBeOK();
    await expect(await api.post("/api/groups", { data: { name: `Club ${word}`, description: "Para probar el volver" } })).toBeOK();
  } finally {
    await api.dispose();
  }

  await signIn(page, viewer);
  await page.getByRole("link", { name: "Grupos", exact: true }).click();
  await page.getByRole("tab", { name: "Todos los grupos" }).click();
  await page.getByRole("searchbox", { name: "Buscar grupos" }).fill(word);
  await expect(page).toHaveURL(new RegExp(`q=${word}`));

  await page.getByRole("link", { name: new RegExp(`Club ${word}`) }).click();
  await expect(page).toHaveURL(/\/grupos\/[^/?]+/);
  await page.getByRole("button", { name: /^Volver/ }).first().click();

  await expect(page.getByRole("tab", { name: "Todos los grupos" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("searchbox", { name: "Buscar grupos" })).toHaveValue(word);
  await expect(page.getByRole("link", { name: new RegExp(`Club ${word}`) })).toBeVisible();
});

test("Volver a la lista de grupos recupera el scroll", async ({ page, baseURL }) => {
  const viewer = await createAccount(baseURL!, "Scroll Vuelta");
  await page.setViewportSize({ width: 375, height: 500 });
  await signIn(page, viewer);
  await page.getByRole("link", { name: "Grupos", exact: true }).click();
  await page.getByRole("tab", { name: "Todos los grupos" }).click();
  await expect(page.locator(".glist .gcard").first()).toBeVisible();

  // Con la lista bajada, ir a Mensajes y volver a Grupos con la barra de abajo
  const scrolled = await page.locator(".page").evaluate((el) => {
    el.scrollTop = Math.min(200, el.scrollHeight - el.clientHeight);
    el.dispatchEvent(new Event("scroll"));
    return el.scrollTop;
  });
  await page.getByRole("link", { name: "Mensajes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mensajes" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("tab", { name: "Todos los grupos" })).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => page.locator(".page").evaluate((el) => el.scrollTop)).toBe(scrolled);
});
