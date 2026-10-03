/** Dev helper: opens the app on a phone viewport, prints console errors and saves screenshots. */
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://127.0.0.1:5173/';
const out = process.argv[3] ?? '/tmp/peek';
const w = Number(process.argv[4] ?? 390);
const h = Number(process.argv[5] ?? 844);
const steps = (process.argv[6] ?? '').split(',').filter(Boolean);

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
  await page.goto(url);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}-0.png` });
  let i = 1;
  for (const s of steps) {
    if (s.startsWith('click:')) await page.locator(s.slice(6)).first().click();
    else if (s.startsWith('tap:')) await page.locator(s.slice(4)).first().tap();
    else if (s.startsWith('key:')) await page.keyboard.press(s.slice(4));
    else if (s.startsWith('wait:')) await page.waitForTimeout(Number(s.slice(5)));
    else if (s.startsWith('goto:')) await page.goto(s.slice(5));
    else if (s === 'shot') {
      await page.screenshot({ path: `${out}-${i}.png` });
      i++;
    }
  }
  await browser.close();
}

main();
