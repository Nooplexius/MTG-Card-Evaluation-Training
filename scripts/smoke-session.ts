/** Dev helper: grades a 20-card session through the UI, then opens insights, stats and history. */
// Grades a full 20-card session through the UI, then visits insights, stats and history.
import { chromium } from '@playwright/test';
const base = 'http://127.0.0.1:5173/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base);
const grades = ['B plus', 'C', 'C minus', 'B', 'D plus', 'A minus', 'C plus', 'B minus', 'D', 'C'];
for (let i = 0; i < 20; i++) {
  await page.locator(`button[aria-label="${grades[i % grades.length]}"]`).click({ timeout: 15000 });
  await page.locator('button.next').waitFor({ timeout: 15000 });
  if (i === 2) await page.screenshot({ path: '/tmp/s-reveal.png' });
  await page.locator('button.next').click();
}
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/s-summary.png', fullPage: true });
await page.goto(base + '#/insights'); await page.waitForTimeout(2500); await page.screenshot({ path: '/tmp/s-insights.png', fullPage: true });
await page.goto(base + '#/stats'); await page.waitForTimeout(3000);
for (const [i, y] of [0, 700, 1300, 1900].entries()) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(500); await page.screenshot({ path: `/tmp/s-stats-${i}.png` }); }
await page.goto(base + '#/history'); await page.waitForTimeout(2000); await page.screenshot({ path: '/tmp/s-history.png' });
console.log('errors:', errors.slice(0, 10));
await browser.close();
