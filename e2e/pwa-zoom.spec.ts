import { expect, test } from "@playwright/test";

test.use({ isMobile: true, hasTouch: true, viewport: { width: 375, height: 700 } });

for (const instalada of [false, true]) {
  test(`zoom con dos dedos en ${instalada ? "la PWA instalada" : "el navegador"}`, async ({ page }) => {
    if (instalada) {
      await page.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
    }
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();

    const viewport = page.locator('meta[name="viewport"]');
    const gestureBlocked = await page.evaluate(() =>
      !document.dispatchEvent(new Event("gesturestart", { bubbles: true, cancelable: true }))
    );
    expect(gestureBlocked).toBe(instalada);

    if (instalada) {
      await expect(viewport).toHaveAttribute("content", /maximum-scale=1(?:,|$)/);
      await expect(viewport).toHaveAttribute("content", /user-scalable=no(?:,|$)/);
      const session = await page.context().newCDPSession(page);
      await session.send("Input.synthesizePinchGesture", {
        x: 185, y: 300, scaleFactor: 2, gestureSourceType: "touch",
      });
      expect(await page.evaluate(() => window.visualViewport!.scale)).toBe(1);
    } else {
      await expect(viewport).not.toHaveAttribute("content", /maximum-scale|user-scalable/);
    }
  });
}
