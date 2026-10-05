/** Dev helper: plays a few cards on the preview build and lists the service worker caches. */
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:4173/');
await page.waitForFunction(() => navigator.serviceWorker?.controller != null);
for (let i = 0; i < 4; i++) {
  await page.locator('.card-box.is-loaded .card-box__img').waitFor({ timeout: 20000 });
  await page.locator('.pad button[aria-label="C"]').click();
  await page.locator('button.next').click();
}
await page.waitForTimeout(3000);
const info = await page.evaluate(async () => {
  const names = await caches.keys();
  const out: Record<string, string[]> = {};
  for (const n of names) out[n] = (await (await caches.open(n)).keys()).map((r) => r.url).slice(0, 4).concat([`(${(await (await caches.open(n)).keys()).length} total)`]);
  return out;
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
