import type { Rng } from './random.ts';
import { shuffle, weightedIndex } from './random.ts';
import type { SchedItem, SelectionReason } from './types.ts';

/**
 * Adaptive sequencing after Mettler & Kellman's ARTS: misses return after a short delay and then at expanding
 * intervals, fast correct answers stretch intervals more than slow ones, mastered cards retire. All parameters live here.
 */
export const SCHED = {
  /** Share of Adaptive trials that are uniform first-look probes (headline metrics use only these and Random mode). */
  probeShare: 0.2,
  /** Review share grows with the number of due cards, up to this cap. */
  reviewCap: 0.35,
  reviewPerDue: 0.08,
  /** Share of the remaining new-card trials aimed at the user's weak facets. */
  weakShare: 0.3,
  /** A miss returns after this many trials (inclusive range), so the answer is no longer in working memory. */
  missDelay: [3, 5] as const,
  /** Within-session expanding intervals in trials after a recovered miss. */
  trialLadder: [5, 12, 30] as const,
  /** Cross-session intervals in days. */
  dayLadder: [1, 3, 7, 21] as const,
  /** A correct first look gets one retention check after this many days. */
  firstCorrectDays: 7,
  retireStreak: 3,
  retiredCheckDays: 60,
  /** Band stratification: target ∝ natural^gamma, capped at bandCap × natural. */
  bandGamma: 0.5,
  bandCap: 2,
  /** Weight multipliers for sharing a set or color with each of the last two cards. */
  interleaveSet: 0.5,
  interleaveColor: 0.65,
  interleaveWindow: 2,
  /** Response-time fluency: interval × clamp(reference / rt). */
  rtRefMs: 6000,
  fluencyMin: 0.6,
  fluencyMax: 1.6,
};

export type SchedConfig = typeof SCHED;

export const DAY_MS = 86_400_000;

export interface Candidate {
  key: string;
  oracleId: string;
  set: string;
  band: number;
  colorKey: string;
}

export interface WeakFacet {
  id: string;
  keys: Set<string>;
  weight: number;
}

export interface SchedContext {
  trial: number;
  now: number;
  candidates: Candidate[];
  sched: Map<string, SchedItem>;
  exposed: Set<string>;
  recent: Candidate[];
  weak: WeakFacet[];
  exclude: Set<string>;
  rng: Rng;
  cfg?: SchedConfig;
}

export interface Pick {
  key: string;
  reason: SelectionReason;
  /** Probability that this card was chosen on this trial under the full mixture. */
  prob: number;
  uniform: boolean;
}

interface Slot {
  reason: SelectionReason;
  p: number;
  keys: string[];
  weights: number[];
}

export function isDue(item: SchedItem | undefined, trial: number, now: number): boolean {
  if (!item) return false;
  if (item.dueTrial !== null && trial >= item.dueTrial) return true;
  return item.dueTs !== null && now >= item.dueTs;
}

function duePriority(item: SchedItem, trial: number, now: number): number {
  let p = 1 + 0.5 * Math.min(item.lapses, 4);
  if (item.dueTrial !== null && trial >= item.dueTrial) p += 0.25 * Math.min(trial - item.dueTrial, 12) + 1;
  else if (item.dueTs !== null) p += Math.min((now - item.dueTs) / DAY_MS, 14) * 0.1;
  if (item.retired) p *= 0.5;
  return p;
}

/** Target share per grade band: ∝ natural^gamma, never above cap × natural. */
export function bandTargets(natural: number[], gamma: number, cap: number): number[] {
  const total = natural.reduce((a, b) => a + b, 0);
  if (total <= 0) return natural.map(() => 0);
  const p = natural.map((x) => x / total);
  let q = p.map((x) => (x > 0 ? Math.pow(x, gamma) : 0));
  const fixed = new Array(p.length).fill(false);
  for (let iter = 0; iter < p.length; iter++) {
    const freeMass = 1 - q.reduce((s, v, i) => s + (fixed[i] ? v : 0), 0);
    const freeSum = q.reduce((s, v, i) => s + (fixed[i] ? 0 : v), 0);
    q = q.map((v, i) => (fixed[i] ? v : freeSum > 0 ? (v / freeSum) * freeMass : 0));
    let changed = false;
    q.forEach((v, i) => {
      if (!fixed[i] && v > cap * p[i]) {
        q[i] = cap * p[i];
        fixed[i] = true;
        changed = true;
      }
    });
    if (!changed) break;
  }
  return q;
}

function interleave(c: Candidate, recent: Candidate[], cfg: SchedConfig): number {
  let w = 1;
  for (const r of recent.slice(-cfg.interleaveWindow)) {
    if (r.set === c.set) w *= cfg.interleaveSet;
    if (r.colorKey === c.colorKey) w *= cfg.interleaveColor;
  }
  return w;
}

/** Builds the Adaptive mixture for one trial. Exposed for tests. */
export function adaptiveSlots(ctx: SchedContext): Slot[] {
  const cfg = ctx.cfg ?? SCHED;
  const avail = ctx.candidates.filter((c) => !ctx.exclude.has(c.key));
  const fresh = avail.filter((c) => !ctx.exposed.has(c.oracleId));
  const recentKeys = new Set(ctx.recent.slice(-2).map((r) => r.key));
  const due = avail.filter((c) => !recentKeys.has(c.key) && isDue(ctx.sched.get(c.key), ctx.trial, ctx.now));

  const probe: Slot = { reason: 'probe', p: cfg.probeShare, keys: fresh.map((c) => c.key), weights: fresh.map(() => 1) };
  const review: Slot = {
    reason: 'review',
    p: Math.min(cfg.reviewCap, cfg.reviewPerDue * due.length),
    keys: due.map((c) => c.key),
    weights: due.map((c) => duePriority(ctx.sched.get(c.key) as SchedItem, ctx.trial, ctx.now) * interleave(c, ctx.recent, cfg)),
  };
  const weakKeys = new Map<string, number>();
  for (const f of ctx.weak) for (const k of f.keys) weakKeys.set(k, (weakKeys.get(k) ?? 0) + f.weight);
  const weakFresh = fresh.filter((c) => weakKeys.has(c.key));
  const weak: Slot = { reason: 'weak-facet', p: 0, keys: weakFresh.map((c) => c.key), weights: weakFresh.map((c) => (weakKeys.get(c.key) as number) * interleave(c, ctx.recent, cfg)) };

  const natural = [0, 0, 0, 0, 0];
  for (const c of avail) natural[c.band]++;
  const target = bandTargets(natural, cfg.bandGamma, cfg.bandCap);
  const freshByBand = [0, 0, 0, 0, 0];
  for (const c of fresh) freshByBand[c.band]++;
  const explore: Slot = {
    reason: 'explore',
    p: 0,
    keys: fresh.map((c) => c.key),
    weights: fresh.map((c) => (freshByBand[c.band] > 0 ? target[c.band] / freshByBand[c.band] : 0) * interleave(c, ctx.recent, cfg)),
  };

  const rest = Math.max(0, 1 - probe.p - review.p);
  weak.p = weak.keys.length > 0 ? rest * cfg.weakShare : 0;
  explore.p = rest - weak.p;

  let slots = [probe, review, weak, explore].filter((s) => s.keys.length > 0 && s.p > 0 && s.weights.some((w) => w > 0));
  if (slots.length === 0) {
    const pool = avail.filter((c) => !recentKeys.has(c.key));
    const list = pool.length > 0 ? pool : avail;
    if (list.length === 0) return [];
    const weights = list.map((c) => {
      const it = ctx.sched.get(c.key);
      const age = it ? Math.max(1, ctx.trial - it.lastTrial) : 50;
      return Math.min(age, 200) * interleave(c, ctx.recent, cfg);
    });
    slots = [{ reason: 'review', p: 1, keys: list.map((c) => c.key), weights }];
  }
  const total = slots.reduce((s, x) => s + x.p, 0);
  return slots.map((s) => ({ ...s, p: s.p / total }));
}

/** Probability of each key under a mixture of slots. */
export function mixtureProb(slots: Slot[], key: string): number {
  let p = 0;
  for (const s of slots) {
    const i = s.keys.indexOf(key);
    if (i < 0) continue;
    const w = s.weights.reduce((a, b) => a + (b > 0 ? b : 0), 0);
    if (w > 0) p += s.p * (Math.max(0, s.weights[i]) / w);
  }
  return p;
}

export function pickAdaptive(ctx: SchedContext): Pick | null {
  const slots = adaptiveSlots(ctx);
  if (slots.length === 0) return null;
  const si = weightedIndex(slots.map((s) => s.p), ctx.rng);
  const slot = slots[si];
  const ki = weightedIndex(slot.weights, ctx.rng);
  if (ki < 0) return null;
  const key = slot.keys[ki];
  return { key, reason: slot.reason, prob: mixtureProb(slots, key), uniform: slot.reason === 'probe' };
}

/** Random mode: uniform over the filtered pool without replacement. */
export class ShuffleBag {
  private bag: string[] = [];
  private signature = '';

  draw(keys: string[], exclude: Set<string>, rng: Rng): Pick | null {
    const sig = `${keys.length}:${keys[0] ?? ''}:${keys[keys.length - 1] ?? ''}`;
    if (sig !== this.signature) {
      this.signature = sig;
      this.bag = shuffle(keys, rng);
    }
    const keySet = new Set(keys);
    this.bag = this.bag.filter((k) => keySet.has(k));
    let avail = this.bag.filter((k) => !exclude.has(k));
    if (avail.length === 0) {
      this.bag = shuffle(keys, rng);
      avail = this.bag.filter((k) => !exclude.has(k));
      if (avail.length === 0) return null;
    }
    const key = avail[0];
    this.bag.splice(this.bag.indexOf(key), 1);
    return { key, reason: 'random', prob: 1 / avail.length, uniform: true };
  }

  /** Puts a skipped card back so it comes up again. */
  requeue(key: string, rng: Rng) {
    const at = Math.floor(rng() * (this.bag.length + 1));
    this.bag.splice(at, 0, key);
  }

  snapshot(): string[] {
    return [...this.bag];
  }

  restore(bag: string[], keys: string[]) {
    this.bag = bag;
    this.signature = `${keys.length}:${keys[0] ?? ''}:${keys[keys.length - 1] ?? ''}`;
  }
}

export interface Outcome {
  key: string;
  oracleId: string;
  err: number;
  rtMs: number;
  trial: number;
  now: number;
  rtRefMs?: number;
}

/** Fast correct answers stretch intervals more than slow ones. */
export function fluency(rtMs: number, refMs: number, cfg: SchedConfig = SCHED): number {
  if (!(rtMs > 0)) return 1;
  return Math.max(cfg.fluencyMin, Math.min(cfg.fluencyMax, refMs / rtMs));
}

export function updateAfter(prev: SchedItem | undefined, o: Outcome, rng: Rng, cfg: SchedConfig = SCHED): SchedItem {
  const base: SchedItem = prev ?? { key: o.key, oracleId: o.oracleId, lastTrial: o.trial, lastTs: o.now, dueTrial: null, dueTs: null, step: 0, streak: 0, lapses: 0, retired: false, lastRt: o.rtMs, lastErr: o.err, seen: 0 };
  const it: SchedItem = { ...base, lastTrial: o.trial, lastTs: o.now, lastRt: o.rtMs, lastErr: o.err, seen: base.seen + 1 };
  const miss = Math.abs(o.err) >= 2;
  const f = fluency(o.rtMs, o.rtRefMs ?? cfg.rtRefMs, cfg);
  if (miss) {
    const [lo, hi] = cfg.missDelay;
    it.streak = 0;
    it.lapses += 1;
    it.step = 0;
    it.retired = false;
    it.dueTrial = o.trial + lo + Math.floor(rng() * (hi - lo + 1));
    it.dueTs = o.now + cfg.dayLadder[0] * DAY_MS;
    return it;
  }
  it.streak += 1;
  const nTrialRungs = cfg.trialLadder.length;
  if (!prev || prev.seen === 0) it.step = nTrialRungs + Math.max(0, (cfg.dayLadder as readonly number[]).indexOf(cfg.firstCorrectDays));
  if (it.streak >= cfg.retireStreak && it.step > nTrialRungs) {
    it.retired = true;
    it.dueTrial = null;
    it.dueTs = o.now + cfg.retiredCheckDays * f * DAY_MS;
    return it;
  }
  const step = Math.max(0, it.step);
  if (step < nTrialRungs) {
    it.dueTrial = o.trial + Math.max(2, Math.round(cfg.trialLadder[step] * f));
    it.dueTs = o.now + cfg.dayLadder[0] * DAY_MS;
  } else {
    const d = cfg.dayLadder[Math.min(cfg.dayLadder.length - 1, step - nTrialRungs)];
    it.dueTrial = null;
    it.dueTs = o.now + d * f * DAY_MS;
  }
  it.step = step + 1;
  return it;
}

/** Combined ladder: in-session trial rungs, then cross-session day rungs. */
export function ladder(cfg: SchedConfig = SCHED): Array<{ trials?: number; days?: number }> {
  return [...cfg.trialLadder.map((t) => ({ trials: t })), ...cfg.dayLadder.map((d) => ({ days: d }))];
}
