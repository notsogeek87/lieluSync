// Renders public/logo.svg to the PNG sizes needed by Stremio (manifest logo) and browsers.
// Usage: node scripts/render-icons.mjs  (set PLAYWRIGHT_PATH if playwright is installed globally)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? "playwright");

const svg = readFileSync(new URL("../public/logo.svg", import.meta.url), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [size, out] of [[256, "public/logo-256.png"], [180, "src/app/apple-icon.png"], [512, "public/logo-512.png"]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log("wrote", out);
}
await browser.close();
