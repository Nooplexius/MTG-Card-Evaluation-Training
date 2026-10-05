/** Dev helper: reports service worker registration state on the preview build. */
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on('console', (m) => console.log('[console]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
ctx.on('serviceworker', (w) => console.log('[sw] started', w.url()));
await page.goto('http://127.0.0.1:4173/');
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(1500);
  const s = await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    return { controller: !!navigator.serviceWorker.controller, regs: regs.map((r) => ({ scope: r.scope, active: r.active?.state, installing: r.installing?.state, waiting: r.waiting?.state })) };
  });
  console.log(i, JSON.stringify(s));
  if (s.controller) break;
}
await browser.close();
