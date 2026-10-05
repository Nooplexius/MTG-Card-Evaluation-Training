import { C_INDEX } from './grades.ts';
import type { Evaluation } from './types.ts';

/** An evaluation scored against a grade basis (latest grade by default, or the stored snapshot). */
export interface Point {
  e: Evaluation;
  actual: number;
  err: number;
  /** The card's grade changed since this evaluation was made. */
  changed: boolean;
}

export function toPoints(evals: Evaluation[], latest: (key: string) => number | undefined, basis: 'latest' | 'snapshot' = 'latest'): Point[] {
  return evals.map((e) => {
    const now = latest(e.key);
    const actual = basis === 'latest' && now !== undefined ? now : e.actual;
    return { e, actual, err: e.user - actual, changed: now !== undefined && now !== e.actual };
  });
}

export interface Headline {
  n: number;
  mae: number | null;
  exact: number | null;
  within: number | null;
  bias: number | null;
  slope: number | null;
  intercept: number | null;
  spearman: number | null;
  /** MAE of the most recent half minus the earlier half (negative = improving), when n >= 20. */
  trend: number | null;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export interface CalibrationFit {
  slope: number;
  intercept: number;
  seSlope: number;
  seIntercept: number;
  /** Residual SD around the line, in steps. */
  resid: number;
}

/** Weighted OLS of (user − C) on (actual − C): slope < 1 means compression, the intercept is the bias at C. */
export function calibrationLine(points: Array<{ actual: number; user: number; w?: number }>): CalibrationFit | null {
  if (points.length < 3) return null;
  let sw = 0;
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    const w = p.w ?? 1;
    sw += w;
    sx += w * (p.actual - C_INDEX);
    sy += w * (p.user - C_INDEX);
  }
  const mx = sx / sw;
  const my = sy / sw;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    const w = p.w ?? 1;
    const dx = p.actual - C_INDEX - mx;
    sxx += w * dx * dx;
    sxy += w * dx * (p.user - C_INDEX - my);
  }
  if (sxx <= 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let rss = 0;
  for (const p of points) {
    const r = p.user - C_INDEX - (intercept + slope * (p.actual - C_INDEX));
    rss += (p.w ?? 1) * r * r;
  }
  const dof = Math.max(1, points.length - 2);
  const sigma2 = (rss / sw) * (points.length / dof);
  return { slope, intercept, seSlope: Math.sqrt(sigma2 / sxx), seIntercept: Math.sqrt(sigma2 * (1 / sw + (mx * mx) / sxx)), resid: Math.sqrt(sigma2) };
}

function ranks(xs: number[]): number[] {
  const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

export function spearman(a: number[], b: number[]): number | null {
  if (a.length < 3) return null;
  const ra = ranks(a);
  const rb = ranks(b);
  const ma = mean(ra) as number;
  const mb = mean(rb) as number;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  if (da === 0 || db === 0) return null;
  return num / Math.sqrt(da * db);
}

export function headline(points: Point[]): Headline {
  const n = points.length;
  if (n === 0) return { n, mae: null, exact: null, within: null, bias: null, slope: null, intercept: null, spearman: null, trend: null };
  const cal = calibrationLine(points.map((p) => ({ actual: p.actual, user: p.e.user })));
  let trend: number | null = null;
  if (n >= 20) {
    const sorted = [...points].sort((a, b) => a.e.ts - b.e.ts);
    const half = Math.floor(n / 2);
    trend = (mean(sorted.slice(half).map((p) => Math.abs(p.err))) as number) - (mean(sorted.slice(0, half).map((p) => Math.abs(p.err))) as number);
  }
  return {
    n,
    mae: mean(points.map((p) => Math.abs(p.err))),
    exact: points.filter((p) => p.err === 0).length / n,
    within: points.filter((p) => Math.abs(p.err) <= 1).length / n,
    bias: mean(points.map((p) => p.err)),
    slope: cal?.slope ?? null,
    intercept: cal?.intercept ?? null,
    spearman: spearman(points.map((p) => p.e.user), points.map((p) => p.actual)),
    trend,
  };
}

/** Headline first-look metrics use uniformly sampled first looks only (Random mode and Adaptive probes). */
export function isHeadlineFirstLook(e: Evaluation): boolean {
  return e.firstLook && e.uniform;
}

export function learningCurve(points: Point[], window = 20): Array<{ i: number; ts: number; mae: number }> {
  const sorted = [...points].sort((a, b) => a.e.ts - b.e.ts);
  const out: Array<{ i: number; ts: number; mae: number }> = [];
  let sum = 0;
  for (let i = 0; i < sorted.length; i++) {
    sum += Math.abs(sorted[i].err);
    if (i >= window) sum -= Math.abs(sorted[i - window].err);
    if (i >= Math.min(window, sorted.length) - 1) out.push({ i: i + 1, ts: sorted[i].e.ts, mae: sum / Math.min(window, i + 1) });
  }
  return out;
}

export function calibrationBins(points: Point[]): Array<{ actual: number; n: number; meanUser: number | null }> {
  return Array.from({ length: 13 }, (_, g) => {
    const xs = points.filter((p) => p.actual === g).map((p) => p.e.user);
    return { actual: g, n: xs.length, meanUser: mean(xs) };
  });
}

export function confusion(points: Point[]): number[][] {
  const m = Array.from({ length: 13 }, () => new Array<number>(13).fill(0));
  for (const p of points) m[p.actual][p.e.user]++;
  return m;
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface Streaks {
  correctNow: number;
  correctBest: number;
  /** Consecutive days (ending today or yesterday) with at least one evaluation. */
  days: number;
  today: number;
}

export function streaks(evals: Evaluation[], now = Date.now()): Streaks {
  const sorted = [...evals].sort((a, b) => a.ts - b.ts);
  let cur = 0;
  let best = 0;
  for (const e of sorted) {
    if (Math.abs(e.user - e.actual) <= 1) cur++;
    else cur = 0;
    best = Math.max(best, cur);
  }
  const days = new Set(sorted.map((e) => dayKey(e.ts)));
  const today = dayKey(now);
  let d = 0;
  const cursor = new Date(now);
  if (!days.has(today)) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor.getTime()))) {
    d++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { correctNow: cur, correctBest: best, days: d, today: sorted.filter((e) => dayKey(e.ts) === today).length };
}

export interface GroupRow {
  id: string;
  label: string;
  n: number;
  mae: number | null;
  bias: number | null;
  exact: number | null;
  within: number | null;
  trend: number | null;
}

export function groupRow(id: string, label: string, points: Point[]): GroupRow {
  const h = headline(points);
  return { id, label, n: h.n, mae: h.mae, bias: h.bias, exact: h.exact, within: h.within, trend: h.trend };
}
