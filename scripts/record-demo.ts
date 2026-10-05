/**
 * Records the core loop at 390×844 (needs the preview on 4173): a first visit, a few graded cards with their reveals,
 * zoom, then a compare round. `npx tsx scripts/record-demo.ts [outDir]`; writes a .webm and prints its path.
 */
import { chromium, type Page } from '@playwright/test';

const out = process.argv[2] ?? 'artifacts/video';
const base = 'http://127.0.0.1:4173/';
const size = { width: 390, height: 844 };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: size, deviceScaleFactor: 2, isMobile: true, hasTouch: true, recordVideo: { dir: out, size } });
const page = await context.newPage();
const pause = (ms: number) => page.waitForTimeout(ms);

async function cardReady(p: Page) {
  await p.locator('.route-practice:not([hidden]) .card-box.is-loaded .card-box__img').waitFor({ timeout: 30_000 });
  await p.locator('.shell').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);
}

async function gradeCard(label: string, look = 1400, read = 2600) {
  await cardReady(page);
  await pause(look);
  await page.locator(`.pad button[aria-label="${label}"]`).click();
  await page.locator('button.next').waitFor();
  await pause(read);
}

await page.goto(base);
await gradeCard('B', 1800);
await page.locator('button.next').click();
await gradeCard('C+');
await page.locator('button.next').click();
await cardReady(page);
await pause(900);
await page.locator('.route-practice:not([hidden]) .card-box__hit').click();
await page.locator('.zoom').waitFor();
await pause(1800);
await page.getByRole('button', { name: /close/i }).first().click();
await gradeCard('B\u2212', 700);
await page.locator('button.next').click();
await gradeCard('A\u2212', 1200, 2400);
await page.locator('button.next').click();
await cardReady(page);
await pause(800);

await page.goto(`${base}#/compare`);
await page.locator('.compare__card .card-box.is-loaded .card-box__img').nth(1).waitFor({ timeout: 30_000 });
await pause(2200);
await page.getByRole('button', { name: /^Pick left/ }).click();
await pause(3200);
await page.getByRole('button', { name: 'Next pair' }).click();
await page.getByRole('button', { name: /^Pick right/ }).waitFor();
await pause(2000);
await page.getByRole('button', { name: /^Pick right/ }).click();
await pause(3000);

const video = page.video();
await context.close();
await browser.close();
console.log(video ? await video.path() : 'no video');
