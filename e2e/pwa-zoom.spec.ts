import { expect, test } from "@playwright/test";

test.use({ isMobile: true, hasTouch: true, viewport: { width: 375, height: 700 } });

for (const instalada of [false, true]) {
  test(`zoom con dos dedos en ${instalada ? "la PWA instalada" : "el navegador"}`, async ({ page }) => {
    if (instalada) {
      await page.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
    }
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();

    const session = await page.context().newCDPSession(page);
    await session.send("Input.synthesizePinchGesture", {
      x: 185, y: 300, scaleFactor: 2, gestureSourceType: "touch",
    });
    const scale = await page.evaluate(() => window.visualViewport!.scale);
    if (instalada) expect(scale).toBe(1);
    else expect(scale).toBeGreaterThan(1);
  });
}
