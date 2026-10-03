export type CrowdClass = 'over' | 'under';

export const CROWD_GAP_POINTS = 25;

/** Competition ranking ("1224"): rank 1 is the highest value. */
export function competitionRanks(values: readonly number[]): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  const ranks = new Array<number>(values.length);
  let rank = 0;
  for (let pos = 0; pos < order.length; pos++) {
    if (pos === 0 || order[pos][0] !== order[pos - 1][0]) rank = pos + 1;
    ranks[order[pos][1]] = rank;
  }
  return ranks;
}

/** Mid-rank percentile in [0, 100]: share below plus half the ties. */
export function midRankPercentiles(values: readonly number[]): number[] {
  const n = values.length;
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((v) => {
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    const below = lo;
    let eqEnd = below;
    while (eqEnd < n && sorted[eqEnd] === v) eqEnd++;
    return (100 * (below + 0.5 * (eqEnd - below))) / n;
  });
}

export interface CrowdInput {
  gihWr: number;
  alsa: number | null | undefined;
}

export interface CrowdResult {
  /** Percentile of draft priority (earlier picks are higher); null without ALSA. */
  draftPct: number | null;
  perfPct: number;
  gap: number | null;
  crowd: CrowdClass | null;
}

/**
 * Crowd gap: ALSA percentile (lower ALSA = taken earlier) against GIH WR percentile among graded cards.
 * A gap of 25 points or more is crowd:over (drafted ahead of its performance) or crowd:under.
 */
export function crowdGaps(cards: readonly CrowdInput[]): CrowdResult[] {
  const perf = midRankPercentiles(cards.map((c) => c.gihWr));
  const withAlsa = cards.map((c, i) => ({ i, alsa: c.alsa })).filter((x): x is { i: number; alsa: number } => typeof x.alsa === 'number' && Number.isFinite(x.alsa));
  const draftById = new Map<number, number>();
  if (withAlsa.length > 0) {
    const perfSub = midRankPercentiles(withAlsa.map((x) => cards[x.i].gihWr));
    const draftSub = midRankPercentiles(withAlsa.map((x) => -x.alsa));
    withAlsa.forEach((x, j) => {
      draftById.set(x.i, draftSub[j]);
      perf[x.i] = perfSub[j];
    });
  }
  return cards.map((_, i) => {
    const draftPct = draftById.get(i) ?? null;
    if (draftPct === null) return { draftPct: null, perfPct: perf[i], gap: null, crowd: null };
    const gap = draftPct - perf[i];
    const crowd: CrowdClass | null = gap >= CROWD_GAP_POINTS ? 'over' : gap <= -CROWD_GAP_POINTS ? 'under' : null;
    return { draftPct, perfPct: perf[i], gap, crowd };
  });
}

export interface ColorGroupStat {
  n: number;
  avg: number;
}

export type ColorContext = Record<string, ColorGroupStat>;

const WUBRG = 'WUBRG';

export function normalizeColor(color: string | null | undefined): string {
  const set = new Set((color ?? '').toUpperCase().split('').filter((ch) => WUBRG.includes(ch)));
  return WUBRG.split('').filter((ch) => set.has(ch)).join('');
}

/** Average GIH WR per exact color string plus "multi" and "colorless" groups. */
export function colorContext(cards: ReadonlyArray<{ color: string; gihWr: number }>): ColorContext {
  const acc = new Map<string, { n: number; sum: number }>();
  const add = (key: string, wr: number) => {
    const cur = acc.get(key) ?? { n: 0, sum: 0 };
    cur.n += 1;
    cur.sum += wr;
    acc.set(key, cur);
  };
  for (const c of cards) {
    const col = normalizeColor(c.color);
    if (col.length === 0) add('colorless', c.gihWr);
    else {
      add(col, c.gihWr);
      if (col.length > 1) add('multi', c.gihWr);
    }
  }
  const out: ColorContext = {};
  for (const [k, v] of acc) out[k] = { n: v.n, avg: v.sum / v.n };
  return out;
}

export const MIN_PAIR_CARDS = 5;

/** Which color group describes a card: its mono color, its pair (if >= 5 graded cards), all multicolor, or colorless. */
export function colorGroupFor(color: string, ctx: ColorContext): { key: string; label: string; stat: ColorGroupStat } | null {
  const col = normalizeColor(color);
  if (col.length === 0) return ctx.colorless ? { key: 'colorless', label: 'Colorless cards', stat: ctx.colorless } : null;
  if (col.length === 1) return ctx[col] ? { key: col, label: `Mono-${COLOR_NAMES[col]} cards`, stat: ctx[col] } : null;
  const pair = ctx[col];
  if (pair && pair.n >= MIN_PAIR_CARDS) return { key: col, label: `${col} cards`, stat: pair };
  return ctx.multi ? { key: 'multi', label: 'Multicolor cards', stat: ctx.multi } : null;
}

export const COLOR_NAMES: Record<string, string> = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };
