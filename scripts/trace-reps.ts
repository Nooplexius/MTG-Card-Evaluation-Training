/**
 * Diagnoses core-loop jank: replays the budgets flow (needs the preview on 4173) under CPU throttling and prints
 * each rep's reveal and next-card times next to the background network activity (page and service worker) during it.
 * `npx tsx scripts/trace-reps.ts [throttle=12] [runs=3]`
 */
import { chromium, type Page } from '@playwright/test';

const rate = Number(process.argv[2] ?? 12);
const runs = Number(process.argv[3] ?? 3);
const LABELS = ['C', 'B', 'D+', 'A\u2212', 'C\u2212'];

async function ready(page: Page) {
  await page.locator('.route-practice:not([hidden]) .card-box.is-loaded .card-box__img').waitFor({ timeout: 30_000 });
  await page.locator('.shell').waitFor({ state: 'detached' }).catch(() => undefined);
}

for (let run = 0; run < runs; run++) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'allow' });
  const page = await context.newPage();
  const t0 = Date.now();
  const net: Array<{ at: number; what: string }> = [];
  const note = (what: string) => net.push({ at: Date.now() - t0, what });
  context.on('request', (r) => {
    const u = new URL(r.url());
    const kind = u.hostname === 'cards.scryfall.io' ? 'image' : u.pathname.includes('/data/') ? `data ${u.pathname.split('/').pop()?.slice(0, 12)}` : u.pathname.split('/').pop() || '/';
    note(`${r.serviceWorker() ? 'sw ' : ''}${kind}`);
  });
  await page.goto('http://127.0.0.1:4173/');
  await ready(page);
  await page.locator('.pad button[aria-label="C"]').click();
  await page.locator('button.next').click();
  await ready(page);
  await page.waitForTimeout(1500);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  const reps: string[] = [];
  for (let i = 0; i < 5; i++) {
    await ready(page);
    await page.waitForTimeout(1200);
    const start = Date.now() - t0;
    const reveal = await page.evaluate(`(async () => {
      const key = document.querySelector('.pad button[aria-label="${LABELS[i]}"]');
      const r = key.getBoundingClientRect();
      const opts = { bubbles: true, cancelable: true, button: 0, pointerId: 7, isPrimary: true, pointerType: 'touch', clientX: r.left + 5, clientY: r.top + 5 };
      key.dispatchEvent(new PointerEvent('pointerdown', opts));
      const t = performance.now();
      key.dispatchEvent(new PointerEvent('pointerup', opts));
      await new Promise((done) => { const check = () => (document.querySelector('.reveal__truth .chip') ? requestAnimationFrame(() => done()) : requestAnimationFrame(check)); check(); });
      const shown = performance.now() - t;
      await new Promise((done) => { const check = () => (document.getAnimations().some((a) => a.playState === 'running') ? requestAnimationFrame(check) : done()); requestAnimationFrame(check); });
      return Math.round(shown);
    })()`);
    const next = await page.evaluate(`(async () => {
      const before = document.querySelector('.card-box__img')?.getAttribute('src');
      const t = performance.now();
      document.querySelector('button.next').click();
      return await new Promise((done) => { const check = () => { const img = document.querySelector('.card-box.is-loaded .card-box__img'); if (img && img.getAttribute('src') !== before && img.complete && img.naturalWidth > 0) requestAnimationFrame(() => done(Math.round(performance.now() - t))); else requestAnimationFrame(check); }; check(); });
    })()`);
    const end = Date.now() - t0;
    const during = net.filter((n) => n.at >= start - 300 && n.at <= end);
    const counts = new Map<string, number>();
    for (const n of during) {
      const k = n.what.replace(/data .*/, 'data file').replace(/^sw data .*/, 'sw data file');
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    reps.push(`  rep ${i} @${start}ms: reveal ${reveal} ms, next ${next} ms; network: ${[...counts].map(([k, v]) => `${k}×${v}`).join(', ') || 'none'}`);
  }
  const sw = net.filter((n) => n.what.startsWith('sw ') || n.what === 'sw.js');
  console.log(`run ${run + 1}: sw.js at ${net.find((n) => n.what === 'sw.js')?.at ?? '-'} ms, ${sw.length} SW requests (${sw[0]?.at ?? '-'}–${sw.at(-1)?.at ?? '-'} ms)`);
  console.log(reps.join('\n'));
  await browser.close();
}
