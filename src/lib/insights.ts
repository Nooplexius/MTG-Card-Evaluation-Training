import { chooseHalfLife, DECAY, decayWeights, kish, type HalfLifeChoice, type PreqRow } from './decay.ts';
import type { Facet } from './facets.ts';
import { C_INDEX } from './grades.ts';
import { cholesky, cholSolve } from './linalg.ts';

/** One first-look evaluation prepared for the model. */
export interface FirstLook {
  key: string;
  printingId: string;
  user: number;
  actual: number;
  /** Sampling noise of the actual grade, in steps. */
  se: number;
  facets: string[];
  rtMs: number;
  seq: number;
  ts: number;
  name?: string;
}

/** Evidence thresholds and penalties; tuned with tests/unit/insights.sim.test.ts. */
export const INSIGHT = {
  minEffect: 0.5,
  zMain: 2.58,
  zInteraction: 3.29,
  minNeffMain: 8,
  minNeffInteraction: 25,
  lambdaMain: 2,
  lambdaInteraction: 6,
  minFirstLooks: 40,
  compressionSlope: 0.8,
  expansionSlope: 1.25,
  zBehavior: 3,
  inconsistencyTau: 1.75,
  speedGap: 0.35,
  fatigueGap: 0.35,
  fatigueEarly: 8,
  fatigueLate: 16,
  strengthGap: 0.4,
  strengthMinN: 30,
  zStrength: 3.29,
  maxCardInsights: 4,
  maxStrengths: 2,
  maxBehaviors: 2,
};

export interface FacetEffect {
  facetId: string;
  effect: number;
  se: number;
  nEff: number;
  n: number;
}

export interface InsightExample {
  key: string;
  printingId: string;
  user: number;
  actual: number;
  name?: string;
}

export interface Insight {
  id: string;
  kind: 'facet' | 'strength' | 'behavior';
  headline: string;
  detail: string;
  tip?: string;
  /** Signed effect in steps (facets: + means you overrate). */
  effect: number;
  lo: number;
  hi: number;
  n: number;
  nEff: number;
  impact: number;
  facet?: Pick<Facet, 'id' | 'label' | 'noun' | 'query'>;
  examples: InsightExample[];
}

export interface Model {
  /** Facets the stepwise fit kept, in the order they entered. */
  selected: string[];
  n: number;
  tau: number;
  slope: number;
  seSlope: number;
  intercept: number;
  seIntercept: number;
  effects: FacetEffect[];
  residuals: number[];
  /** First looks after which a first look counts half (Infinity: nothing decays). */
  halfLife: number;
  /** Kish effective number of first looks under that decay. */
  nEff: number;
}

const steps = (x: number) => `${Math.abs(x).toFixed(1)} step${Math.abs(x).toFixed(1) === '1.0' ? '' : 's'}`;
const letterNote = (x: number) => (Math.abs(x) >= 2.5 ? ' — almost a full letter grade' : Math.abs(x) >= 1.4 ? ' — half a letter grade' : '');

function nEff(ws: number[]): number {
  const s = ws.reduce((a, b) => a + b, 0);
  const s2 = ws.reduce((a, b) => a + b * b, 0);
  return s2 > 0 ? (s * s) / s2 : 0;
}

interface Row {
  a: number;
  y: number;
  fs: Set<string>;
}

interface SmallFit {
  theta: Float64Array;
  /** Full inverse G of the (penalized) normal matrix, row-major. */
  ginv: Float64Array;
  /** Sandwich G (Xᵀ diag(w·d) X + Λ) G, before the dispersion factor; equals G when nothing decays. */
  cov: Float64Array;
  resid: number[];
  phi: number;
  p: number;
}

/** Decay factors of the rows, with their sum and Kish effective size. */
interface Decay {
  d: Float64Array;
  sum: number;
  kish: number;
}

/**
 * Weighted least squares on [1, actual − C, selected facet indicators], ridge λ on the facet columns only. Weights
 * are w = d / (τ² + SE²): decay times precision. Down-weighting old rows makes the estimate track the user's
 * current grading but leaves less information behind it, which the sandwich covariance charges for, so tests on
 * these effects keep their nominal error rates.
 */
function wlsFit(rows: Row[], w: Float64Array, dec: Decay, selected: Facet[], lambda: number): SmallFit | null {
  const p = 2 + selected.length;
  const A = new Float64Array(p * p);
  const M = new Float64Array(p * p);
  const b = new Float64Array(p);
  const x = new Float64Array(p);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    x[0] = 1;
    x[1] = r.a;
    for (let k = 0; k < selected.length; k++) x[2 + k] = r.fs.has(selected[k].id) ? 1 : 0;
    const m = w[i] * dec.d[i];
    for (let j = 0; j < p; j++) {
      if (x[j] === 0) continue;
      b[j] += w[i] * x[j] * r.y;
      for (let k = 0; k < p; k++) {
        A[j * p + k] += w[i] * x[j] * x[k];
        M[j * p + k] += m * x[j] * x[k];
      }
    }
  }
  for (const Z of [A, M]) {
    Z[0] += 1e-9;
    Z[p + 1] += 1e-9;
    for (let k = 2; k < p; k++) Z[k * p + k] += lambda;
  }
  const L = cholesky(A, p);
  if (!L) return null;
  const theta = cholSolve(L, p, b);
  const ginv = new Float64Array(p * p);
  const e = new Float64Array(p);
  for (let j = 0; j < p; j++) {
    e.fill(0);
    e[j] = 1;
    const c = cholSolve(L, p, e);
    for (let k = 0; k < p; k++) ginv[k * p + j] = c[k];
  }
  const GM = new Float64Array(p * p);
  for (let i = 0; i < p; i++) for (let k = 0; k < p; k++) for (let j = 0; j < p; j++) GM[i * p + k] += ginv[i * p + j] * M[j * p + k];
  const cov = new Float64Array(p * p);
  for (let i = 0; i < p; i++) for (let k = 0; k < p; k++) for (let j = 0; j < p; j++) cov[i * p + k] += GM[i * p + j] * ginv[j * p + k];
  const resid = rows.map((r) => {
    let pred = theta[0] + theta[1] * r.a;
    for (let k = 0; k < selected.length; k++) if (r.fs.has(selected[k].id)) pred += theta[2 + k];
    return r.y - pred;
  });
  const wrss = resid.reduce((s, v, i) => s + w[i] * v * v, 0);
  return { theta, ginv, cov, resid, phi: Math.max(1, ((wrss / dec.sum) * dec.kish) / Math.max(1, dec.kish - p)), p };
}

/** Effect of adding one facet to the current model (Frisch–Waugh): the facet indicator residualized on the model's columns. */
function conditionalEffect(rows: Row[], w: Float64Array, dec: Decay, fit: SmallFit, selected: Facet[], f: Facet, lambda: number): FacetEffect {
  const p = fit.p;
  const h = new Float64Array(p);
  const members: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i].fs.has(f.id)) continue;
    members.push(w[i]);
    h[0] += w[i];
    h[1] += w[i] * rows[i].a;
    for (let k = 0; k < selected.length; k++) if (rows[i].fs.has(selected[k].id)) h[2 + k] += w[i];
  }
  const beta = new Float64Array(p);
  for (let j = 0; j < p; j++) for (let k = 0; k < p; k++) beta[j] += fit.ginv[j * p + k] * h[k];
  let S = 0;
  let S2 = 0;
  let g = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    let proj = beta[0] + beta[1] * r.a;
    for (let k = 0; k < selected.length; k++) if (r.fs.has(selected[k].id)) proj += beta[2 + k];
    const xt = (r.fs.has(f.id) ? 1 : 0) - proj;
    S += w[i] * xt * xt;
    S2 += w[i] * dec.d[i] * xt * xt;
    g += w[i] * fit.resid[i] * xt;
  }
  return { facetId: f.id, effect: g / (S + lambda), se: Math.sqrt(fit.phi * (S2 + lambda)) / (S + lambda), nEff: nEff(members), n: members.length };
}

/**
 * Forward stepwise fit. Start from the calibration line (user − C) = α + β (actual − C); repeatedly add the facet
 * whose conditional effect is strongest among those that pass the evidence bar, refitting jointly each time.
 * Facets that merely overlap a real effect (creature type for "big bodies", burn for "red") lose their apparent
 * effect once the real one is in, so the grouping effect of a plain ridge fit doesn't dilute or smear it.
 * Weights are 1/(τ̂² + SE²), τ̂ re-estimated from the residuals of the current model. Facet effects are lightly
 * shrunk (ridge λ), interactions harder.
 */
export function fitModel(looks: FirstLook[], facets: Facet[], halfLife = Infinity): Model | null {
  const n = looks.length;
  if (n < 10) return null;
  const used = facets.filter((f) => looks.some((l) => l.facets.includes(f.id)));
  const rows: Row[] = looks.map((l) => ({ a: l.actual - C_INDEX, y: l.user - C_INDEX, fs: new Set(l.facets) }));
  const d = decayWeights(n, halfLife);
  const dec: Decay = { d, sum: d.reduce((a, b) => a + b, 0), kish: kish(d) };
  const meanSe2 = looks.reduce((s, l, i) => s + d[i] * l.se * l.se, 0) / dec.sum;
  let tau2 = 1.5;
  const weights = () => Float64Array.from(looks, (l, i) => d[i] / (tau2 + l.se * l.se));
  let w = weights();
  const selected: Facet[] = [];
  let fit = wlsFit(rows, w, dec, selected, INSIGHT.lambdaMain);
  if (!fit) return null;
  let conditional: FacetEffect[] = [];
  for (let step = 0; step < 12; step++) {
    for (let it = 0; it < 2; it++) {
      const cur = fit as SmallFit;
      const rss = cur.resid.reduce((s, x, i) => s + d[i] * x * x, 0);
      tau2 = Math.max(0.09, ((rss / dec.sum) * dec.kish) / Math.max(1, dec.kish - cur.p) - meanSe2);
      w = weights();
      fit = wlsFit(rows, w, dec, selected, INSIGHT.lambdaMain);
      if (!fit) return null;
    }
    const current = fit as SmallFit;
    conditional = used.filter((f) => !selected.includes(f)).map((f) => conditionalEffect(rows, w, dec, current, selected, f, f.interaction ? INSIGHT.lambdaInteraction : INSIGHT.lambdaMain));
    const byId = new Map(used.map((f) => [f.id, f] as const));
    const best = conditional.filter((e) => passes(e, byId.get(e.facetId) as Facet)).sort((a, b) => Math.abs(b.effect / b.se) - Math.abs(a.effect / a.se))[0];
    if (!best) break;
    selected.push(byId.get(best.facetId) as Facet);
    const next = wlsFit(rows, w, dec, selected, INSIGHT.lambdaMain);
    if (!next) break;
    fit = next;
  }
  const final = fit as SmallFit;
  const selectedEffects: FacetEffect[] = selected.map((f, k) => {
    const members: number[] = [];
    looks.forEach((l, i) => {
      if (l.facets.includes(f.id)) members.push(w[i]);
    });
    return { facetId: f.id, effect: final.theta[2 + k], se: Math.sqrt(final.phi * final.cov[(2 + k) * final.p + 2 + k]), nEff: nEff(members), n: members.length };
  });
  const p = final.p;
  return {
    n,
    tau: Math.sqrt(tau2),
    slope: final.theta[1],
    seSlope: Math.sqrt(final.phi * final.cov[p + 1]),
    intercept: final.theta[0],
    seIntercept: Math.sqrt(final.phi * final.cov[0]),
    effects: [...selectedEffects, ...conditional.filter((e) => !selected.some((f) => f.id === e.facetId))],
    residuals: final.resid,
    selected: selected.map((f) => f.id),
    halfLife,
    nEff: dec.kish,
  };
}

export type MemoryChoice = HalfLifeChoice & { model?: Model | null };

/**
 * Chooses how fast this user's evidence decays (see decay.ts). Candidates are scored on a compact version of the
 * model: the calibration line plus the facets that matter under either no decay or the shortest memory, so a
 * fading old bias and an emerging new one can both make a shorter memory predict better.
 */
export function chooseMemory(looks: FirstLook[], facets: Facet[]): MemoryChoice {
  if (looks.length < DECAY.minLooks) return { halfLife: Infinity, scores: [], scored: 0 };
  const all = fitModel(looks, facets, Infinity);
  if (!all) return { halfLife: Infinity, scores: [], scored: 0, model: all };
  const shortest = DECAY.halfLives[DECAY.halfLives.length - 1];
  const recent = fitModel(looks, facets, shortest);
  const byId = new Map(facets.map((f) => [f.id, f] as const));
  const notable = (m: Model | null) =>
    m
      ? [
          ...m.selected,
          ...m.effects
            .filter((e) => e.se > 0 && Math.abs(e.effect) >= 1.5 * e.se)
            .sort((a, b) => Math.abs(b.effect / b.se) - Math.abs(a.effect / a.se))
            .map((e) => e.facetId),
        ]
      : [];
  const cols = [...new Set([...notable(all), ...notable(recent)])].filter((id) => byId.has(id) && !byId.get(id)?.interaction).slice(0, 16);
  const tau2 = all.tau * all.tau;
  const rows: PreqRow[] = looks.map((l) => {
    const x: Array<[number, number]> = [
      [0, 1],
      [1, l.actual - C_INDEX],
    ];
    cols.forEach((id, k) => {
      if (l.facets.includes(id)) x.push([2 + k, 1]);
    });
    return { x, y: l.user - C_INDEX, v: tau2 + l.se * l.se };
  });
  const p = 2 + cols.length;
  const ridge = Float64Array.from({ length: p }, (_, j) => (j < 2 ? 1e-6 : INSIGHT.lambdaMain));
  const choice = chooseHalfLife(rows, p, ridge);
  return { ...choice, model: choice.halfLife === Infinity ? all : choice.halfLife === shortest ? recent : undefined };
}

function passes(e: FacetEffect, f: Facet): boolean {
  const z = f.interaction ? INSIGHT.zInteraction : INSIGHT.zMain;
  const minN = f.interaction ? INSIGHT.minNeffInteraction : INSIGHT.minNeffMain;
  return Math.abs(e.effect) >= INSIGHT.minEffect && Math.abs(e.effect) >= z * e.se && e.nEff >= minN;
}

/** Weighted mean, variance and Kish effective size; with equal weights, the usual mean and sample variance. */
function wstats(xs: number[], ds: number[]): { mean: number; v: number; ne: number } {
  let sw = 0;
  let sx = 0;
  for (let i = 0; i < xs.length; i++) {
    sw += ds[i];
    sx += ds[i] * xs[i];
  }
  const mean = sw > 0 ? sx / sw : 0;
  let ss = 0;
  for (let i = 0; i < xs.length; i++) ss += ds[i] * (xs[i] - mean) ** 2;
  const ne = kish(ds);
  return { mean, v: ne > 1 && sw > 0 ? ((ss / sw) * ne) / (ne - 1) : 0, ne };
}

/** Welch's t on decay-weighted samples, each needing an effective size of at least 15. */
function welch(a: number[], da: number[], b: number[], db: number[]): { diff: number; t: number } | null {
  const A = wstats(a, da);
  const B = wstats(b, db);
  if (A.ne < 15 || B.ne < 15) return null;
  const se = Math.sqrt(A.v / A.ne + B.v / B.ne);
  if (!(se > 0)) return null;
  return { diff: A.mean - B.mean, t: (A.mean - B.mean) / se };
}

export interface InsightResult {
  model: Model | null;
  insights: Insight[];
  /**
   * Facets for the scheduler's weak-facet share: those that pass the evidence bar plus suspicious ones (|z| ≥ 1.5),
   * so a real weakness collects evidence (and practice) quickly while a fluke regresses toward zero.
   */
  weak: Array<{ facetId: string; effect: number; confirmed: boolean }>;
  firstLooks: number;
  needed: number;
  /** How the evidence decays: the chosen half-life (in first looks), the effective sample and the scored candidates. */
  memory: { halfLife: number; nEff: number; n: number; scores: HalfLifeChoice['scores'] } | null;
}

/**
 * Synthesizes the model into a handful of insights ranked by impact (effect × how often the facet comes up). Older
 * first looks count less, at the rate chosen by `chooseMemory` unless `opts.halfLife` fixes it.
 */
export function computeInsights(looksIn: FirstLook[], facets: Facet[], facetShare: ReadonlyMap<string, number>, opts: { halfLife?: number } = {}): InsightResult {
  const none = { model: null, insights: [], weak: [], firstLooks: looksIn.length, needed: INSIGHT.minFirstLooks, memory: null };
  if (looksIn.length < INSIGHT.minFirstLooks) return none;
  const looks = [...looksIn].sort((a, b) => a.ts - b.ts);
  const mem: MemoryChoice = opts.halfLife !== undefined ? { halfLife: opts.halfLife, scores: [], scored: 0 } : chooseMemory(looks, facets);
  const model = mem.model ?? fitModel(looks, facets, mem.halfLife);
  if (!model) return none;
  const d = Array.from(decayWeights(looks.length, model.halfLife));
  const decays = Number.isFinite(model.halfLife);
  const byId = new Map(facets.map((f) => [f.id, f] as const));
  const card: Insight[] = [];
  const weak: Array<{ facetId: string; effect: number; confirmed: boolean }> = [];
  for (const e of model.effects) {
    const f = byId.get(e.facetId);
    if (!f || !model.selected.includes(f.id) || !passes(e, f)) continue;
    weak.push({ facetId: f.id, effect: e.effect, confirmed: true });
    const over = e.effect > 0;
    const examples = looks
      .map((l, i) => ({ l, r: model.residuals[i], d: d[i] }))
      .filter((x) => x.l.facets.includes(f.id) && (over ? x.r > 0 : x.r < 0))
      .sort((a, b) => Math.abs(b.r) * b.d - Math.abs(a.r) * a.d)
      .slice(0, 3)
      .map(({ l }) => ({ key: l.key, printingId: l.printingId, user: l.user, actual: l.actual, name: l.name }));
    card.push({
      id: `facet:${f.id}`,
      kind: 'facet',
      headline: `You ${over ? 'overrate' : 'underrate'} ${f.noun} by about ${steps(e.effect)}${letterNote(e.effect)}`,
      detail: `Compared with your own calibration line, your first looks at ${f.noun} land ${steps(e.effect)} ${over ? 'above' : 'below'} the 17Lands grade, on ${e.n} cards${decays ? ', weighted toward your recent ones' : ''}.`,
      effect: e.effect,
      lo: e.effect - 1.96 * e.se,
      hi: e.effect + 1.96 * e.se,
      n: e.n,
      nEff: e.nEff,
      impact: Math.abs(e.effect) * (facetShare.get(f.id) ?? 0),
      facet: { id: f.id, label: f.label, noun: f.noun, query: f.query },
      examples,
    });
  }
  card.sort((a, b) => b.impact - a.impact || Math.abs(b.effect) - Math.abs(a.effect));
  const suspicious = model.effects
    .filter((e) => !weak.some((w) => w.facetId === e.facetId) && Math.abs(e.effect) >= 0.4 && Math.abs(e.effect) >= 1.5 * e.se && e.nEff >= 3 && !byId.get(e.facetId)?.interaction)
    .sort((a, b) => Math.abs(b.effect / b.se) - Math.abs(a.effect / a.se))
    .slice(0, 3);
  for (const e of suspicious) weak.push({ facetId: e.facetId, effect: e.effect, confirmed: false });

  const behavior: Insight[] = [];
  const absR = model.residuals.map(Math.abs);
  const zSlope = (model.slope - 1) / model.seSlope;
  if (model.slope <= INSIGHT.compressionSlope && -zSlope >= INSIGHT.zBehavior) {
    behavior.push({
      id: 'behavior:compression',
      kind: 'behavior',
      headline: `You compress grades toward C: your grade moves ${model.slope.toFixed(1)} steps for every step the truth moves`,
      detail: 'Strong cards get graded too low and weak cards too high. This alone makes rares and removal look "underrated" and filler look "overrated", so Loupe separates it from your facet results.',
      tip: 'Use the ends of the scale. When a card would be a first pick, say A− or better; when you would never play it, say D or lower.',
      effect: model.slope - 1,
      lo: model.slope - 1 - 1.96 * model.seSlope,
      hi: model.slope - 1 + 1.96 * model.seSlope,
      n: model.n,
      nEff: model.nEff,
      impact: Math.abs(1 - model.slope) * 3,
      examples: [],
    });
  } else if (model.slope >= INSIGHT.expansionSlope && zSlope >= INSIGHT.zBehavior) {
    behavior.push({
      id: 'behavior:expansion',
      kind: 'behavior',
      headline: `You stretch grades toward the extremes: ${model.slope.toFixed(1)} steps for every step the truth moves`,
      detail: 'Good cards get graded too high and weak cards too low.',
      tip: 'Most cards in a set are C-level. Save A grades for bombs and premium removal, and F for unplayables.',
      effect: model.slope - 1,
      lo: model.slope - 1 - 1.96 * model.seSlope,
      hi: model.slope - 1 + 1.96 * model.seSlope,
      n: model.n,
      nEff: model.nEff,
      impact: Math.abs(model.slope - 1) * 3,
      examples: [],
    });
  }
  if (Math.abs(model.intercept) >= INSIGHT.minEffect && Math.abs(model.intercept) / model.seIntercept >= INSIGHT.zBehavior) {
    const high = model.intercept > 0;
    behavior.push({
      id: high ? 'behavior:optimism' : 'behavior:pessimism',
      kind: 'behavior',
      headline: `You grade about ${steps(model.intercept)} too ${high ? 'high' : 'low'} across the board`,
      detail: `Around C, where most cards sit, your grades run ${steps(model.intercept)} ${high ? 'above' : 'below'} 17Lands.`,
      tip: high ? 'Anchor on C: an average playable is a C. Make each card earn its B.' : 'Average playables are C, not D. Most cards in a deck are C-level.',
      effect: model.intercept,
      lo: model.intercept - 1.96 * model.seIntercept,
      hi: model.intercept + 1.96 * model.seIntercept,
      n: model.n,
      nEff: model.nEff,
      impact: Math.abs(model.intercept) * 2,
      examples: [],
    });
  }
  if (model.tau >= INSIGHT.inconsistencyTau) {
    behavior.push({
      id: 'behavior:inconsistency',
      kind: 'behavior',
      headline: `Your grades scatter: about ±${model.tau.toFixed(1)} steps around your own average for similar cards`,
      detail: 'This is spread rather than bias: you are not consistently high or low, but similar cards get quite different grades.',
      tip: 'Pick two reference cards per set, one B and one C−, and compare each new card against them before grading.',
      effect: model.tau,
      lo: model.tau,
      hi: model.tau,
      n: model.n,
      nEff: model.nEff,
      impact: model.tau,
      examples: [],
    });
  }
  const timed = looks.map((_, i) => i).filter((i) => looks[i].rtMs > 0);
  const rts = timed.map((i) => looks[i].rtMs);
  if (kish(timed.map((i) => d[i])) >= 40) {
    const med = [...rts].sort((a, b) => a - b)[Math.floor(rts.length / 2)];
    const fastI = timed.filter((i) => looks[i].rtMs < med);
    const slowI = timed.filter((i) => looks[i].rtMs >= med);
    const w = welch(
      fastI.map((i) => absR[i]),
      fastI.map((i) => d[i]),
      slowI.map((i) => absR[i]),
      slowI.map((i) => d[i]),
    );
    if (w && w.diff >= INSIGHT.speedGap && w.t >= INSIGHT.zBehavior) {
      behavior.push({
        id: 'behavior:speed',
        kind: 'behavior',
        headline: `Your quick answers are ${steps(w.diff)} less accurate than your slower ones`,
        detail: `Grades given in under ${(med / 1000).toFixed(1)} s miss by more.`,
        tip: 'Read the whole text box and the mana value before you grade. A second more per card pays for itself.',
        effect: w.diff,
        lo: w.diff,
        hi: w.diff,
        n: rts.length,
        nEff: kish(timed.map((i) => d[i])),
        impact: w.diff * 2,
        examples: [],
      });
    }
  }
  const earlyI = looks.map((_, i) => i).filter((i) => looks[i].seq > 0 && looks[i].seq <= INSIGHT.fatigueEarly);
  const lateI = looks.map((_, i) => i).filter((i) => looks[i].seq >= INSIGHT.fatigueLate);
  const fw = welch(
    lateI.map((i) => absR[i]),
    lateI.map((i) => d[i]),
    earlyI.map((i) => absR[i]),
    earlyI.map((i) => d[i]),
  );
  if (fw && fw.diff >= INSIGHT.fatigueGap && fw.t >= INSIGHT.zBehavior) {
    behavior.push({
      id: 'behavior:fatigue',
      kind: 'behavior',
      headline: `Accuracy drops by ${steps(fw.diff)} after card ${INSIGHT.fatigueLate - 1} of a session`,
      detail: 'Your misses grow late in long sessions.',
      tip: 'Try 10-card sessions and come back later in the day.',
      effect: fw.diff,
      lo: fw.diff,
      hi: fw.diff,
      n: lateI.length,
      nEff: kish(lateI.map((i) => d[i])),
      impact: fw.diff * 1.5,
      examples: [],
    });
  }

  const strengths: Insight[] = [];
  const overall = wstats(absR, d).mean;
  for (const f of facets) {
    const inI = looks.map((_, i) => i).filter((i) => looks[i].facets.includes(f.id));
    if (kish(inI.map((i) => d[i])) < INSIGHT.strengthMinN || card.some((c) => c.facet?.id === f.id)) continue;
    const outI = looks.map((_, i) => i).filter((i) => !looks[i].facets.includes(f.id));
    const inF = inI.map((i) => absR[i]);
    const w = welch(
      outI.map((i) => absR[i]),
      outI.map((i) => d[i]),
      inF,
      inI.map((i) => d[i]),
    );
    if (!w || w.diff < INSIGHT.strengthGap || w.t < INSIGHT.zStrength) continue;
    const mIn = wstats(inF, inI.map((i) => d[i])).mean;
    strengths.push({
      id: `strength:${f.id}`,
      kind: 'strength',
      headline: `You read ${f.noun} well: off by ${mIn.toFixed(1)} steps there against ${overall.toFixed(1)} overall`,
      detail: `On ${inF.length} first looks, after accounting for your calibration.`,
      effect: -w.diff,
      lo: -w.diff,
      hi: -w.diff,
      n: inF.length,
      nEff: kish(inI.map((i) => d[i])),
      impact: w.diff * (facetShare.get(f.id) ?? 0),
      facet: { id: f.id, label: f.label, noun: f.noun, query: f.query },
      examples: [],
    });
  }
  strengths.sort((a, b) => b.impact - a.impact);
  behavior.sort((a, b) => b.impact - a.impact);
  const insights = [...card.slice(0, INSIGHT.maxCardInsights), ...behavior.slice(0, INSIGHT.maxBehaviors), ...strengths.slice(0, INSIGHT.maxStrengths)];
  return { model, insights, weak, firstLooks: looks.length, needed: INSIGHT.minFirstLooks, memory: { halfLife: model.halfLife, nEff: model.nEff, n: model.n, scores: mem.scores } };
}

/**
 * Shrunken facet effect on first looks made after a drill started, measured against the calibration line only
 * (the model's own residuals already remove the facet effect). Comparing it with the shrunken pre-drill estimate
 * avoids crediting the drill with plain regression to the mean.
 */
export function drillProgress(model: Model, looks: FirstLook[], facetId: string, since: number): { n: number; effect: number; se: number } | null {
  const xs = looks
    .filter((l) => l.ts >= since && l.facets.includes(facetId))
    .map((l) => ({ l, r: l.user - C_INDEX - model.intercept - model.slope * (l.actual - C_INDEX) }));
  if (xs.length < 5) return null;
  const w = xs.map((x) => 1 / (model.tau * model.tau + x.l.se * x.l.se));
  const sw = w.reduce((a, b) => a + b, 0);
  const mean = xs.reduce((s, x, i) => s + w[i] * x.r, 0) / (sw + INSIGHT.lambdaMain);
  return { n: xs.length, effect: mean, se: Math.sqrt(1 / (sw + INSIGHT.lambdaMain)) };
}
