// Genera los íconos PNG de la app a partir de public/icon.svg.
// Correr después de cambiar el ícono: npm run icons --workspace web
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const pub = new URL("../public/", import.meta.url);
const svg = await readFile(new URL("icon.svg", pub));
const out = [
  ["icon-192.png", 192, 0],
  ["icon-512.png", 512, 0],
  // Para "maskable" (Android recorta en círculo): el dibujo más chico, con margen
  ["icon-maskable-512.png", 512, 0.12],
  ["apple-touch-icon.png", 180, 0],
];
for (const [name, size, pad] of out) {
  const inner = Math.round(size * (1 - pad * 2));
  await sharp({ create: { width: size, height: size, channels: 4, background: "#0c0b0d" } })
    .composite([{ input: await sharp(svg).resize(inner, inner).png().toBuffer(), gravity: "center" }])
    .png()
    .toFile(new URL(name, pub).pathname);
  console.log("✓", name);
}
