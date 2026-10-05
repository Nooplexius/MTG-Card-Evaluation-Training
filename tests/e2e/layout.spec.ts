import { expect, test, type Page } from '@playwright/test';
import { cardReady, grade } from './helpers.ts';

/** Samples points inside the card image: each must hit the image itself, so nothing is drawn over it. */
async function expectCardUncovered(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), undefined, { timeout: 5000 }).catch(() => undefined);
  const covered = await page.evaluate(() => {
    const img = document.querySelector('.card-box__img') as HTMLImageElement | null;
    if (!img) return ['no image'];
    const r = img.getBoundingClientRect();
    const bad: string[] = [];
    for (const fx of [0.08, 0.5, 0.92])
      for (const fy of [0.06, 0.5, 0.94]) {
        const el = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
        if (el !== img) bad.push(`${fx},${fy}: ${el?.className || el?.tagName}`);
      }
    return bad;
  });
  expect(covered).toEqual([]);
}

test('card and grade pad fit one viewport without scrolling, and nothing covers the card', async ({ page }) => {
  await page.goto('/');
  await cardReady(page);
  const vp = page.viewportSize() as { width: number; height: number };
  const card = (await page.locator('.card-box__img').boundingBox()) as { x: number; y: number; width: number; height: number };
  const pad = (await page.locator('.pad').boundingBox()) as { x: number; y: number; width: number; height: number };
  expect(card.y + card.height).toBeLessThanOrEqual(pad.y + 1);
  expect(pad.y + pad.height).toBeLessThanOrEqual(vp.height + 1);
  expect(card.width).toBeGreaterThanOrEqual(vp.width >= 390 ? 280 : 230);
  expect(await page.evaluate(() => (document.scrollingElement as Element).scrollHeight <= innerHeight + 1)).toBe(true);
  for (const key of await page.locator('.pad button').all()) {
    const b = (await key.boundingBox()) as { width: number; height: number };
    expect(b.width).toBeGreaterThanOrEqual(48);
    expect(b.height).toBeGreaterThanOrEqual(48);
  }
  await expectCardUncovered(page);
  await grade(page, 'C');
  await expectCardUncovered(page);
  const reveal = (await page.locator('.reveal').boundingBox()) as { y: number };
  const shrunk = (await page.locator('.card-box__img').boundingBox()) as { y: number; height: number };
  expect(shrunk.y + shrunk.height).toBeLessThanOrEqual(reveal.y + 1);
});

test('wide screens put the card beside the pad and accept keyboard grades', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await cardReady(page);
  const card = (await page.locator('.card-box__img').boundingBox()) as { x: number; width: number };
  const pad = (await page.locator('.pad').boundingBox()) as { x: number };
  expect(pad.x).toBeGreaterThan(card.x + card.width - 1);
  await page.keyboard.press('b');
  await page.keyboard.press('=');
  await expect(page.locator('button.next')).toBeVisible();
  await expect(page.locator('.reveal__side .chip')).toHaveText('B+');
  await page.keyboard.press('ArrowRight');
  await cardReady(page);
  await expect(page.locator('.pad')).toBeVisible();
});
