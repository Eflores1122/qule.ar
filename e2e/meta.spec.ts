import { APP_DESCRIPTION } from "@mortero/brand";
import { expect, test } from "@playwright/test";

test("el HTML público anuncia la portada y el dominio configurado en el build", async ({ request }) => {
  // Los rastreadores de redes leen la respuesta HTML sin ejecutar JavaScript.
  const response = await request.get("/");
  await expect(response).toBeOK();
  const html = await response.text();
  const siteUrl = (process.env.APP_URL ?? "https://qule.ar").replace(/\/+$/, "");
  const imageUrl = `${siteUrl}/og-cover.png`;

  expect(html).toMatch(/<title>[^<]+<\/title>/);
  expect(html).toContain(`<meta name="description" content="${APP_DESCRIPTION}"`);
  expect(html).toContain(`<link rel="canonical" href="${siteUrl}/"`);
  expect(html).toContain(`<meta property="og:url" content="${siteUrl}/"`);
  expect(html).toContain('<meta property="og:type" content="website"');
  expect(html).toMatch(/<meta property="og:title" content="[^"]+"/);
  expect(html).toContain(`<meta property="og:description" content="${APP_DESCRIPTION}"`);
  expect(html).toContain(`<meta name="twitter:description" content="${APP_DESCRIPTION}"`);
  expect(html).toContain(`<meta property="og:image" content="${imageUrl}"`);
  expect(html).toContain('<meta property="og:image:type" content="image/png"');
  expect(html).toMatch(/<meta property="og:image:alt" content="[^"]*mate[^"]*"/);
  expect(html).toContain(`<meta name="twitter:image" content="${imageUrl}"`);

  const served = await request.get("/og-cover.png");
  await expect(served).toBeOK();
  expect(served.headers()["content-type"]).toMatch(/^image\/png\b/);
});
