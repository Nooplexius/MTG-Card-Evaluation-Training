import { cholesky, cholSolve } from './linalg.ts';

/**
 * How the user's evidence ages. A first look's weight halves after `halfLife` newer first looks (practice, not
 * calendar time, is what changes skill). The half-life is chosen per user from the data: each candidate is scored by
 * how well a model fitted only on earlier first looks predicts the next ones, and the longest memory that is not
 * clearly worse than the best wins (the one-standard-error rule). A user whose grading is stable keeps all of their
 * evidence and its full statistical power; one who changes forgets just fast enough to follow.
 */
export const DECAY = {
  /** Candidates, longest memory first; Infinity means no decay. 100 keeps about 290 effective first looks. */
  halfLives: [Infinity, 1600, 800, 400, 200, 100] as number[],
  /** Fewer first looks than this can't show drift reliably: no decay. */
  minLooks: 150,
  /** Prequential scoring: refit every `block` first looks, starting after `burnIn`, over at most `window` looks. */
  block: 20,
  burnIn: 60,
  window: 1500,
};

/** Weights for `n` items in chronological order: the newest weighs 1, one `halfLife` older weighs 1/2. */
export function decayWeights(n: number, halfLife: number): Float64Array {
  const d = new Float64Array(n);
  const k = Number.isFinite(halfLife) ? Math.LN2 / halfLife : 0;
  for (let i = 0; i < n; i++) d[i] = Math.exp(-k * (n - 1 - i));
  return d;
}

/** Kish's effective sample size of a set of weights: (Σw)² / Σw². */
export function kish(w: ArrayLike<number>): number {
  let s = 0;
  let s2 = 0;
  for (let i = 0; i < w.length; i++) {
    s += w[i];
    s2 += w[i] * w[i];
  }
  return s2 > 0 ? (s * s) / s2 : 0;
}

/** One observation for prequential scoring: sparse design row (column, value), response and its variance. */
export interface PreqRow {
  x: Array<[number, number]>;
  y: number;
  v: number;
}

export interface HalfLifeChoice {
  halfLife: number;
  /** Mean predictive loss per scored first look, per candidate (lower is better); empty when no scoring ran. */
  scores: Array<{ halfLife: number; error: number }>;
  scored: number;
}

/**
 * One-step-ahead predictive losses, −log p(y | earlier rows) up to a constant, of a ridge-regularized weighted
 * least-squares model refitted every `block` rows on all earlier rows with exponential forgetting. The predictive
 * variance is the row's own variance plus the fit's uncertainty at that row, so a short memory pays for estimating
 * from less data. The data part of the normal equations decays; the ridge prior does not, so rarely seen columns
 * never wind up.
 */
export function prequentialErrors(rows: PreqRow[], p: number, ridge: ArrayLike<number>, halfLife: number, start: number, block: number): number[] {
  const n = rows.length;
  const delta = Number.isFinite(halfLife) ? Math.pow(2, -1 / halfLife) : 1;
  const D = new Float64Array(p * p);
  const b = new Float64Array(p);
  const add = (r: PreqRow, wgt: number) => {
    for (const [j, xj] of r.x) {
      b[j] += wgt * xj * r.y;
      for (const [k, xk] of r.x) D[j * p + k] += wgt * xj * xk;
    }
  };
  for (let i = 0; i < start; i++) add(rows[i], Math.pow(delta, start - 1 - i) / rows[i].v);
  const errors: number[] = [];
  const A = new Float64Array(p * p);
  for (let t = start; t < n; ) {
    const end = Math.min(n, t + block);
    A.set(D);
    for (let j = 0; j < p; j++) A[j * p + j] += ridge[j];
    const L = cholesky(A, p);
    const theta = L ? cholSolve(L, p, b) : new Float64Array(p);
    const xv = new Float64Array(p);
    for (let i = t; i < end; i++) {
      let pred = 0;
      xv.fill(0);
      for (const [j, xj] of rows[i].x) {
        pred += theta[j] * xj;
        xv[j] = xj;
      }
      let fitVar = 0;
      if (L) {
        const s = cholSolve(L, p, xv);
        for (const [j, xj] of rows[i].x) fitVar += xj * s[j];
      }
      const q = rows[i].v + fitVar / delta;
      errors.push(0.5 * (Math.log(q) + (rows[i].y - pred) ** 2 / q));
    }
    const scale = Math.pow(delta, end - t);
    if (scale !== 1) {
      for (let j = 0; j < p * p; j++) D[j] *= scale;
      for (let j = 0; j < p; j++) b[j] *= scale;
    }
    for (let i = t; i < end; i++) add(rows[i], Math.pow(delta, end - 1 - i) / rows[i].v);
    t = end;
  }
  return errors;
}

/**
 * Picks the half-life: the longest candidate whose prequential error is within one standard error of the best one's,
 * with standard errors from block totals (predictions within a block share one fit, so single rows aren't independent).
 */
export function chooseHalfLife(rows: PreqRow[], p: number, ridge: ArrayLike<number>, opts: Partial<typeof DECAY> = {}): HalfLifeChoice {
  const cfg = { ...DECAY, ...opts };
  const n = rows.length;
  if (n < cfg.minLooks) return { halfLife: Infinity, scores: [], scored: 0 };
  const start = Math.max(cfg.burnIn, n - cfg.window);
  const errs = cfg.halfLives.map((h) => prequentialErrors(rows, p, ridge, h, start, cfg.block));
  const means = errs.map((e) => e.reduce((s, x) => s + x, 0) / e.length);
  let best = 0;
  for (let c = 1; c < means.length; c++) if (means[c] < means[best]) best = c;
  const blocks = Math.ceil(errs[0].length / cfg.block);
  let pick = best;
  for (let c = 0; c < best; c++) {
    const diffs: number[] = [];
    for (let k = 0; k < blocks; k++) {
      let s = 0;
      for (let i = k * cfg.block; i < Math.min(errs[c].length, (k + 1) * cfg.block); i++) s += errs[c][i] - errs[best][i];
      diffs.push(s);
    }
    const m = diffs.reduce((s, x) => s + x, 0) / diffs.length;
    const sd = Math.sqrt(diffs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, diffs.length - 1));
    if (m <= sd / Math.sqrt(diffs.length)) {
      pick = c;
      break;
    }
  }
  return { halfLife: cfg.halfLives[pick], scores: cfg.halfLives.map((h, c) => ({ halfLife: h, error: means[c] })), scored: errs[0].length };
}
