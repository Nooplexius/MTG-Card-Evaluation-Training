import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { cardReady, grade, next } from './helpers.ts';

const DIST = join(import.meta.dirname, '../../dist');

async function throttle(page: Page, rate = 4) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
}

/** Commits a grade with real pointer events and returns ms from pointer-up until the reveal is painted. */
async function timeReveal(page: Page, label: string): Promise<number> {
  return page.evaluate(async (l) => {
    const key = document.querySelector(`.pad button[aria-label="${l}"]`) as HTMLElement;
    const r = key.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, button: 0, pointerId: 7, isPrimary: true, pointerType: 'touch', clientX: r.left + 5, clientY: r.top + 5 };
    key.dispatchEvent(new PointerEvent('pointerdown', opts));
    const t0 = performance.now();
    key.dispatchEvent(new PointerEvent('pointerup', opts));
    await new Promise<void>((done) => {
      const check = () => (document.querySelector('.reveal__truth .chip') ? requestAnimationFrame(() => done()) : requestAnimationFrame(check));
      check();
    });
    return performance.now() - t0;
  }, label);
}

/** Presses Next and returns ms until the next card's (preloaded) image is shown, plus ms until its deal-in finished. */
async function timeNext(page: Page): Promise<{ shown: number; settled: number }> {
  return page.evaluate(async () => {
    const before = document.querySelector('.card-box__img')?.getAttribute('src');
    const t0 = performance.now();
    (document.querySelector('button.next') as HTMLButtonElement).click();
    const shown = await new Promise<number>((done) => {
      const check = () => {
        const img = document.querySelector('.card-box.is-loaded .card-box__img') as HTMLImageElement | null;
        if (img && img.getAttribute('src') !== before && img.complete && img.naturalWidth > 0) requestAnimationFrame(() => done(performance.now() - t0));
        else requestAnimationFrame(check);
      };
      check();
    });
    await new Promise<void>((done) => {
      const check = () => (document.getAnimations().some((a) => a.playState === 'running') ? requestAnimationFrame(check) : done());
      requestAnimationFrame(check);
    });
    return { shown, settled: performance.now() - t0 };
  });
}

/** Waits for the reveal sequence (stamp, count-up, strip marker) to finish; returns ms since commit. */
async function revealSettled(page: Page, since: number): Promise<number> {
  return page.evaluate(async (t0) => {
    await new Promise<void>((done) => {
      const check = () => (document.getAnimations().some((a) => a.playState === 'running') ? requestAnimationFrame(check) : done());
      requestAnimationFrame(check);
    });
    await new Promise((r) => setTimeout(r, 0));
    return performance.now() - t0;
  }, since);
}

test('core loop budgets under 4× CPU throttling: reveal < 50 ms, next card < 100 ms, rep ≤ 1.5 s, smooth frames', async ({ page }) => {
  await page.goto('/');
  await cardReady(page);
  await grade(page, 'C');
  await next(page);
  await cardReady(page);
  await page.waitForTimeout(1500);
  await throttle(page, 4);
  const reveals: number[] = [];
  const nexts: number[] = [];
  const reps: number[] = [];
  const frames: number[] = [];
  for (let i = 0; i < 5; i++) {
    await cardReady(page);
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      const w = window as unknown as { __frames: number[]; __rec: boolean };
      w.__frames = [];
      w.__rec = true;
      const tick = (t: number) => {
        w.__frames.push(t);
        if (w.__rec) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const commitAt = await page.evaluate(() => performance.now());
    reveals.push(await timeReveal(page, ['C', 'B', 'D plus', 'A minus', 'C minus'][i]));
    const revealDone = await revealSettled(page, commitAt);
    const n = await timeNext(page);
    nexts.push(n.shown);
    reps.push(revealDone + n.settled);
    const f = await page.evaluate(() => {
      const w = window as unknown as { __frames: number[]; __rec: boolean };
      w.__rec = false;
      return w.__frames;
    });
    for (let k = 1; k < f.length; k++) frames.push(f[k] - f[k - 1]);
  }
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const meanFrame = frames.reduce((a, b) => a + b, 0) / frames.length;
  const long = frames.filter((x) => x > 34).length / frames.length;
  const report = { revealMs: reveals.map(Math.round), nextCardMs: nexts.map(Math.round), repMs: reps.map(Math.round), fps: Math.round(1000 / meanFrame), longFrames: `${Math.round(long * 100)}%` };
  console.log(`budgets: ${JSON.stringify(report)}`);
  test.info().annotations.push({ type: 'budgets', description: JSON.stringify(report) });
  expect(median(reveals)).toBeLessThan(50);
  expect(median(nexts)).toBeLessThan(100);
  expect(Math.max(...reps)).toBeLessThanOrEqual(1500);
  expect(1000 / meanFrame).toBeGreaterThanOrEqual(50);
  expect(long).toBeLessThan(0.1);
});

test('warm repeat visit shows the first card within 1 s with the service worker', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, undefined, { timeout: 30_000 });
  await cardReady(page);
  await grade(page, 'C');
  await next(page);
  await cardReady(page);
  await page.waitForTimeout(3000);
  await throttle(page, 4);
  await page.reload();
  const ms = await page.evaluate(async () => {
    await new Promise<void>((done) => {
      const check = () => {
        const img = document.querySelector('.card-box.is-loaded .card-box__img') as HTMLImageElement | null;
        if (img && img.complete && img.naturalWidth > 0) done();
        else requestAnimationFrame(check);
      };
      check();
    });
    return performance.now();
  });
  console.log(`warm first card: ${Math.round(ms)} ms`);
  test.info().annotations.push({ type: 'warm-first-card-ms', description: String(Math.round(ms)) });
  expect(ms).toBeLessThan(1000);
});

test('initial JavaScript is about 200 KB gzipped or less (data excluded)', async () => {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/(?:src|href)="\/?(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  const worker = readdirSync(join(DIST, 'assets')).filter((f) => f.startsWith('engine.worker') && f.endsWith('.js')).map((f) => `assets/${f}`);
  const files = [...new Set([...scripts, ...worker])];
  const sizes = files.map((f) => ({ f, gz: gzipSync(readFileSync(join(DIST, f))).length }));
  const total = sizes.reduce((s, x) => s + x.gz, 0);
  console.log(`initial JS: ${sizes.map((s) => `${s.f} ${(s.gz / 1024).toFixed(1)} KB`).join(', ')} = ${(total / 1024).toFixed(1)} KB gzipped`);
  expect(total).toBeLessThanOrEqual(200 * 1024);
});
