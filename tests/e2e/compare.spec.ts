import { expect, test, type Page } from '@playwright/test';

async function pairReady(page: Page) {
  await expect(page.locator('.compare__card .card-box.is-loaded .card-box__img')).toHaveCount(2, { timeout: 30_000 });
  await expect(page.getByRole('button', { name: /^Pick left/ })).toBeEnabled();
}

/** Every sampled point inside both card images must hit the image itself. */
async function cardsUncovered(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), undefined, { timeout: 5000 }).catch(() => undefined);
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    for (const img of document.querySelectorAll<HTMLImageElement>('.compare__card .card-box__img')) {
      const r = img.getBoundingClientRect();
      for (const fx of [0.08, 0.5, 0.92])
        for (const fy of [0.06, 0.5, 0.94]) {
          const el = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
          if (el !== img) out.push(`${fx},${fy}: ${el?.className || el?.tagName}`);
        }
    }
    return out;
  });
  expect(bad).toEqual([]);
}

test('compare mode: pick the card with the higher GIH WR, see both numbers, keep score', async ({ page }) => {
  await page.goto('/#/compare');
  await pairReady(page);
  const vp = page.viewportSize() as { width: number; height: number };
  const pick = (await page.locator('.compare__pick').first().boundingBox()) as { y: number; height: number };
  expect(pick.y + pick.height).toBeLessThanOrEqual(vp.height);
  expect(pick.y).toBeGreaterThan(vp.height * 0.6);
  expect(await page.evaluate(() => (document.scrollingElement as Element).scrollHeight <= innerHeight + 1)).toBe(true);
  await cardsUncovered(page);
  await page.screenshot({ path: 'artifacts/screens/compare-pick.png' });

  await page.getByRole('button', { name: /^Pick left/ }).click();
  await expect(page.locator('.compare__verdict')).toBeVisible();
  await expect(page.locator('.compare__wr')).toHaveCount(2);
  await expect(page.locator('.compare__col.is-winner')).toHaveCount(1);
  await expect(page.locator('.compare__col.is-picked')).toHaveCount(1);
  await expect(page.locator('.compare__score')).toContainText('of 1 right');
  await cardsUncovered(page);
  await page.screenshot({ path: 'artifacts/screens/compare-reveal.png' });

  const before = await page.locator('.compare__card .card-box__img').first().getAttribute('src');
  await page.getByRole('button', { name: 'Next pair' }).click();
  await pairReady(page);
  expect(await page.locator('.compare__card .card-box__img').first().getAttribute('src')).not.toBe(before);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.compare__verdict')).toBeVisible();
  await expect(page.locator('.compare__score')).toContainText('of 2 right');

  await page.reload();
  await pairReady(page);
  const stored = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open('loupe');
        req.onsuccess = () => {
          const tx = req.result.transaction('compares', 'readonly');
          const c = tx.objectStore('compares').count();
          c.onsuccess = () => resolve(c.result);
          c.onerror = () => reject(c.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
  expect(stored).toBe(2);
});
