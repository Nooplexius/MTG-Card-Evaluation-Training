import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { cardReady, feedbackCount, grade, next, play } from './helpers.ts';

test('a full session, a query filter, stats and insights, and progress that survives a reload', async ({ page }) => {
  await page.goto('/');
  await play(page, 20);
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await expect(page.getByText('20 cards graded')).toBeVisible();

  await page.getByRole('button', { name: 'New session' }).click();
  await page.goto('/#/filter');
  await page.getByLabel('Scryfall search').fill('t:creature c:r');
  const counted = page.locator('.filter__count[data-query="t:creature c:r"]');
  await expect(counted).toContainText('cards');
  const count = Number((await counted.locator('b').innerText()).replace(/,/g, ''));
  const total = await page.evaluate(async () => {
    const m = (await (await fetch('data/manifest.json')).json()) as { sets: Array<{ cards: number }> };
    return m.sets.reduce((n, s) => n + s.cards, 0);
  });
  expect(count).toBeGreaterThan(20);
  expect(count).toBeLessThan(total);
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await expect(page.locator('.filter-chip__text')).toHaveText('t:creature c:r');
  await cardReady(page);
  await grade(page, 'C');
  await next(page);
  for (let i = 0; i < 3; i++) {
    await cardReady(page);
    await expect(page.locator('.card-text__type').first()).toBeAttached();
    const types = await page.locator('.card-text__type').allTextContents();
    expect(types.join(' // ')).toMatch(/Creature/);
    await grade(page, 'B');
    await next(page);
  }

  await page.goto('/#/stats');
  await expect(page.getByRole('heading', { name: 'Stats' })).toBeVisible();
  await expect(page.locator('.head-table')).toBeVisible();
  await expect(page.getByText(/2[4-9] evaluations|3\d evaluations/)).toBeVisible();
  await page.goto('/#/insights');
  await expect(page.getByRole('heading', { name: 'Insights' })).toBeVisible();
  await expect(page.getByText(/first looks/).first()).toBeVisible();

  await page.reload();
  await page.goto('/#/history');
  await expect(page.locator('.hist-row').nth(23)).toBeVisible();
  await page.goto('/');
  await cardReady(page);
  await expect(page.locator('.credit__count')).not.toHaveText('1 / 20');
});

test('a grade tapped on the static first screen before the app loads is kept', async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  await page.route(/\/assets\/index-[\w-]+\.js$/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/');
  await expect(page.locator('.shell .card-box__img')).toBeVisible();
  await page.locator('.shell .pad button[aria-label="B"]').click();
  await expect(page.locator('.shell .key.is-pressed')).toHaveCount(1);
  release();
  await expect(page.locator('button.next')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.shell')).toHaveCount(0);
  await page.goto('/#/history');
  await expect(page.locator('.hist-row')).toHaveCount(1);
});

test('practice keeps working offline from cached cards', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, undefined, { timeout: 30_000 });
  await play(page, 6);
  await page.waitForTimeout(4000);
  await context.setOffline(true);
  await page.reload();
  await cardReady(page);
  await expect(page.locator('.credit')).toContainText('Offline');
  for (let i = 0; i < 4; i++) {
    await cardReady(page);
    await grade(page, 'C+');
    await next(page);
  }
  await page.goto('/#/history');
  await expect(page.locator('.hist-row').nth(9)).toBeVisible();
  await context.setOffline(false);
});

test('a touch tap starts audio and the sounds are loud enough for a phone speaker', async ({ page }) => {
  await page.addInitScript(`
    window.__peak = 0;
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (dest, ...rest) {
      if (dest instanceof AudioDestinationNode) {
        const an = this.context.createAnalyser();
        an.fftSize = 2048;
        connect.call(this, an);
        const buf = new Float32Array(an.fftSize);
        const tick = () => { an.getFloatTimeDomainData(buf); for (const x of buf) window.__peak = Math.max(window.__peak, Math.abs(x)); setTimeout(tick, 10); };
        tick();
      }
      return connect.call(this, dest, ...rest);
    };
  `);
  await page.goto('/');
  await cardReady(page);
  await page.locator('.pad button[aria-label="B"]').tap();
  await expect(page.locator('button.next')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __peak: number }).__peak), { timeout: 3000 }).toBeGreaterThan(0.25);
});

test('changing the session length applies to the session in progress', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByRole('radio', { name: 'Endless', exact: true }).click();
  await page.goto('/');
  await play(page, 11);
  await cardReady(page);
  await expect(page.locator('.credit__count')).toHaveText('12');
  await page.goto('/#/settings');
  await page.getByRole('radio', { name: '10', exact: true }).click();
  await page.goto('/');
  await cardReady(page);
  await expect(page.locator('.credit__count')).toHaveText('10 / 10');
  await grade(page, 'C');
  await next(page);
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
});

test('every control gives sound, haptic and motion feedback', async ({ page }) => {
  await page.goto('/');
  await cardReady(page);
  const tools = ['Text view', 'Menu'];
  for (const name of tools) {
    const before = await feedbackCount(page);
    await page.getByRole('button', { name, exact: true }).first().click();
    expect(await feedbackCount(page), name).toBeGreaterThan(before);
  }
  for (const route of ['settings', 'stats', 'history', 'filter', 'about']) {
    await page.goto(`/#/${route}`);
    await page.waitForTimeout(600);
    const buttons = page.locator('main button:visible, .screen button:visible');
    const n = Math.min(await buttons.count(), 12);
    for (let i = 0; i < n; i++) {
      const b = buttons.nth(i);
      const label = (await b.getAttribute('aria-label')) ?? (await b.innerText());
      if (/back|practice|import|export|install|drill/i.test(label)) continue;
      const before = await feedbackCount(page);
      await b.click({ trial: false }).catch(() => undefined);
      expect(await feedbackCount(page), `${route}: ${label}`).toBeGreaterThan(before);
      if (!page.url().includes(`#/${route}`)) await page.goto(`/#/${route}`);
    }
  }
});

test('progress survives export and import', async ({ page, browser }) => {
  await page.goto('/');
  await play(page, 5);
  await page.goto('/#/settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const file = join(mkdtempSync(join(tmpdir(), 'loupe-')), 'backup.json');
  await (await download).saveAs(file);

  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p2 = await fresh.newPage();
  await p2.goto('/#/history');
  await expect(p2.getByText('Nothing here yet.')).toBeVisible();
  await p2.goto('/#/settings');
  await p2.locator('input[type="file"]').setInputFiles(file);
  await expect(p2.getByRole('status')).toContainText('Restored 5 evaluations');
  await p2.reload();
  await p2.goto('/#/history');
  await expect(p2.locator('.hist-row')).toHaveCount(5);
  await fresh.close();
});
