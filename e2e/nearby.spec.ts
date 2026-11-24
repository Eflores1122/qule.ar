import { expect, test } from "@playwright/test";
import { createAccount, signIn } from "./fixtures";

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

test("Atrás cierra los filtros de Gente antes de volver a la sección anterior", async ({ page, baseURL }) => {
  await signIn(page, await createAccount(baseURL!, "Andrea Filtros"));
  const tabs = page.getByRole("navigation", { name: "Secciones" });
  await tabs.getByRole("link", { name: "Yo", exact: true }).tap();
  await tabs.getByRole("link", { name: "Gente", exact: true }).tap();

  const filters = page.getByRole("button", { name: /^Filtros/ });
  const sheet = page.getByRole("dialog", { name: "Filtros" });
  const withPhoto = sheet.getByRole("checkbox", { name: "Solo con foto" });

  await filters.tap();
  await withPhoto.check();
  await page.goBack();
  await expect(page).toHaveURL(/\/cerca$/);
  await expect(sheet).toBeHidden();
  await expect(filters).toBeFocused();

  await filters.tap();
  await expect(withPhoto).not.toBeChecked();
  await sheet.getByRole("button", { name: "Cancelar" }).tap();
  await expect(sheet).toBeHidden();

  await filters.tap();
  await withPhoto.check();
  await sheet.getByRole("button", { name: "Aplicar" }).tap();
  await expect(sheet).toBeHidden();
  await expect(filters).toHaveText("Filtros · 1");

  await page.goBack();
  await expect(page).toHaveURL(/\/yo$/);
});
