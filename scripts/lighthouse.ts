/**
 * Lighthouse mobile audit of a cold first visit (default mobile preset: simulated slow 4G and 4× CPU).
 * Needs a running preview: `npm run build && npx vite preview --port 4173`, then `npm run lighthouse`.
 * Fails if Performance < 90, Accessibility < 95 or the first card (LCP) takes longer than 2.5 s.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';

const url = process.argv[2] ?? 'http://127.0.0.1:4173/';
const out = resolve(import.meta.dirname, '../artifacts');

/** The first DOM node snippet anywhere in an audit's details (its location differs between Lighthouse versions). */
function snippetIn(d: unknown): string | null {
  if (!d || typeof d !== 'object') return null;
  const o = d as Record<string, unknown>;
  if (o.type === 'node' && typeof o.snippet === 'string') return o.snippet;
  for (const v of Object.values(o)) {
    const s = Array.isArray(v) ? v.map(snippetIn).find((x) => x) : snippetIn(v);
    if (s) return s;
  }
  return null;
}

async function main() {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox'], chromePath: process.env.CHROME_PATH });
  try {
    const result = await lighthouse(url, { port: chrome.port, output: 'html', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices'] });
    if (!result) throw new Error('Lighthouse returned no result');
    const { lhr } = result;
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'lighthouse.html'), result.report as string);
    writeFileSync(join(out, 'lighthouse.json'), JSON.stringify(lhr));
    const perf = Math.round((lhr.categories.performance.score ?? 0) * 100);
    const a11y = Math.round((lhr.categories.accessibility.score ?? 0) * 100);
    const lcp = lhr.audits['largest-contentful-paint'].numericValue ?? Infinity;
    const lcpEl = snippetIn(lhr.audits['largest-contentful-paint-element']?.details) ?? snippetIn(lhr.audits['lcp-breakdown-insight']?.details) ?? '';
    const failed = Object.values(lhr.audits)
      .filter((a) => a.score !== null && a.score < 1 && lhr.categories.accessibility.auditRefs.some((r) => r.id === a.id))
      .map((a) => a.id);
    console.log(`Performance ${perf} · Accessibility ${a11y} · LCP ${(lcp / 1000).toFixed(2)} s (${lcpEl.slice(0, 80)})${failed.length ? ` · a11y issues: ${failed.join(', ')}` : ''}`);
    writeFileSync(join(out, 'lighthouse-summary.json'), JSON.stringify({ perf, a11y, lcpMs: Math.round(lcp), lcpElement: lcpEl, a11yIssues: failed }, null, 2));
    if (perf < 90 || a11y < 95 || lcp > 2500) process.exitCode = 1;
  } finally {
    await chrome.kill();
  }
}

main();
