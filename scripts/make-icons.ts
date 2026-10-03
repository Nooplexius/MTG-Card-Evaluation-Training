/** Renders public/icons/favicon.svg to the PNG sizes the web manifest and iOS need. */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = resolve(import.meta.dirname, '..');
const svg = readFileSync(join(ROOT, 'public/icons/favicon.svg'), 'utf8');

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const shots: Array<{ file: string; size: number; pad: number }> = [
    { file: 'icon-192.png', size: 192, pad: 0 },
    { file: 'icon-512.png', size: 512, pad: 0 },
    { file: 'icon-maskable-512.png', size: 512, pad: 0.12 },
    { file: 'apple-touch-icon.png', size: 180, pad: 0 },
  ];
  for (const s of shots) {
    const inner = Math.round(s.size * (1 - 2 * s.pad));
    await page.setViewportSize({ width: s.size, height: s.size });
    await page.setContent(`<html><body style="margin:0;background:#0e1311;display:grid;place-items:center;width:${s.size}px;height:${s.size}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</body></html>`);
    await page.screenshot({ path: join(ROOT, 'public/icons', s.file), omitBackground: false });
  }
  await browser.close();
}

main();
