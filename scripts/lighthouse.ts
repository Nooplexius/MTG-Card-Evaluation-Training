/**
 * Lighthouse mobile audit of a cold first visit (default mobile preset: simulated slow 4G and 4× CPU).
 * Needs a running preview: `npm run build && npm run preview`, then `npm run lighthouse [-- --runs 3] [url]`.
 * Judges the median run: fails if Performance < 90, Accessibility < 95 or the first card (LCP) takes longer than 2.5 s.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';

const args = process.argv.slice(2);
const runsArg = args.indexOf('--runs');
const runs = runsArg >= 0 ? Math.max(1, Number(args[runsArg + 1]) || 1) : 1;
const url = args.find((a, i) => !a.startsWith('--') && i !== runsArg + 1) ?? 'http://127.0.0.1:4173/';
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

interface Run {
  perf: number;
  a11y: number;
  lcpMs: number;
  fcpMs: number;
  tbtMs: number;
  cls: number;
  benchmarkIndex: number;
  lcpElement: string;
  a11yIssues: string[];
  html: string;
  json: string;
}

async function once(): Promise<Run> {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox'], chromePath: process.env.CHROME_PATH });
  try {
    const result = await lighthouse(url, { port: chrome.port, output: 'html', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices'] });
    if (!result) throw new Error('Lighthouse returned no result');
    const { lhr } = result;
    const a = lhr.audits;
    return {
      perf: Math.round((lhr.categories.performance.score ?? 0) * 100),
      a11y: Math.round((lhr.categories.accessibility.score ?? 0) * 100),
      lcpMs: Math.round(a['largest-contentful-paint'].numericValue ?? Infinity),
      fcpMs: Math.round(a['first-contentful-paint'].numericValue ?? Infinity),
      tbtMs: Math.round(a['total-blocking-time'].numericValue ?? Infinity),
      cls: a['cumulative-layout-shift'].numericValue ?? 0,
      benchmarkIndex: Math.round(lhr.environment.benchmarkIndex ?? 0),
      lcpElement: snippetIn(a['largest-contentful-paint-element']?.details) ?? snippetIn(a['lcp-breakdown-insight']?.details) ?? '',
      a11yIssues: Object.values(a)
        .filter((x) => x.score !== null && x.score < 1 && lhr.categories.accessibility.auditRefs.some((r) => r.id === x.id))
        .map((x) => x.id),
      html: result.report as string,
      json: JSON.stringify(lhr),
    };
  } finally {
    await chrome.kill();
  }
}

const line = (r: Run) =>
  `Performance ${r.perf} · Accessibility ${r.a11y} · LCP ${(r.lcpMs / 1000).toFixed(2)} s · FCP ${(r.fcpMs / 1000).toFixed(2)} s · TBT ${r.tbtMs} ms · CLS ${r.cls.toFixed(3)} · benchmarkIndex ${r.benchmarkIndex}${r.a11yIssues.length ? ` · a11y issues: ${r.a11yIssues.join(', ')}` : ''}`;

const results: Run[] = [];
for (let i = 0; i < runs; i++) {
  const r = await once();
  results.push(r);
  if (runs > 1) console.log(`run ${i + 1}: ${line(r)}`);
}
const median = [...results].sort((x, y) => x.perf - y.perf || y.lcpMs - x.lcpMs)[Math.floor((results.length - 1) / 2)];
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'lighthouse.html'), median.html);
writeFileSync(join(out, 'lighthouse.json'), median.json);
const summary = { runs: results.map(({ html: _h, json: _j, ...r }) => r), median: { perf: median.perf, a11y: median.a11y, lcpMs: median.lcpMs, tbtMs: median.tbtMs } };
writeFileSync(join(out, 'lighthouse-summary.json'), JSON.stringify(summary, null, 2));
console.log(`${runs > 1 ? 'median: ' : ''}${line(median)} (${median.lcpElement.slice(0, 80)})`);
if (median.perf < 90 || median.a11y < 95 || median.lcpMs > 2500) process.exitCode = 1;
