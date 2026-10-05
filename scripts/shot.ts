/** Screenshots of a route at a viewport: `npx tsx scripts/shot.ts <route> <width>x<height> <out.png> [pick]` (preview on 4173). */
import { chromium } from '@playwright/test';

const [route = '/', size = '390x844', out = 'artifacts/screens/shot.png', action] = process.argv.slice(2);
const [width, height] = size.split('x').map(Number);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(`http://127.0.0.1:4173${route}`);
await page.locator(`${route.includes('compare') ? '.compare__card ' : '.route-practice:not([hidden]) '}.card-box.is-loaded .card-box__img`).first().waitFor({ timeout: 30_000 });
await page.waitForTimeout(800);
if (action === 'pick') {
  await page.getByRole('button', { name: /^Pick left/ }).click();
  await page.waitForTimeout(900);
}
await page.screenshot({ path: out });
const overflow = await page.evaluate(() => (document.scrollingElement as Element).scrollHeight - innerHeight);
console.log(`${out}: scroll overflow ${overflow}px`);
await browser.close();
