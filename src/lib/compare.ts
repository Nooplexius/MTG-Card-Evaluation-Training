import { randomInt, type Rng } from './random.ts';

/** A pool card as compare mode sees it: GIH WR and its sample size, plus the 17Lands grade. */
export interface CompareCand {
  key: string;
  set: string;
  oracleId: string;
  g: number;
  wr: number;
  n: number;
}

/** Difficulty levels, easiest first: the smallest grade gap (in steps) between the two cards. */
export const COMPARE_LEVELS = [6, 4, 3, 2, 1, 0] as const;

export const COMPARE = {
  startLevel: 2,
  /** A pair's grade gap is between the level's minimum and this many steps more. */
  window: 2,
  /** The win-rate order must be clear: at least this many standard errors and percentage points apart. */
  minZ: 2,
  minDiffPp: 1,
  /** Share of picks drawn from cards already shown with a grade, which keeps unseen cards for first looks. */
  preferShare: 0.7,
  history: 60,
} as const;

export function diffZ(a: CompareCand, b: CompareCand): number {
  const se = Math.sqrt((a.wr * (1 - a.wr)) / Math.max(1, a.n) + (b.wr * (1 - b.wr)) / Math.max(1, b.n));
  return se > 0 ? Math.abs(a.wr - b.wr) / se : 0;
}

/** Two different cards whose GIH WR order the samples settle. */
export function clearPair(a: CompareCand, b: CompareCand): boolean {
  return a.oracleId !== b.oracleId && Math.abs(a.wr - b.wr) * 100 >= COMPARE.minDiffPp && diffZ(a, b) >= COMPARE.minZ;
}

export interface PairPick {
  left: CompareCand;
  right: CompareCand;
  level: number;
  z: number;
}

function choose(list: CompareCand[], rng: Rng, prefer?: Set<string>): CompareCand {
  if (prefer && prefer.size > 0 && rng() < COMPARE.preferShare) {
    const pref = list.filter((c) => prefer.has(c.key));
    if (pref.length > 0) return pref[randomInt(rng, pref.length)];
  }
  return list[randomInt(rng, list.length)];
}

/**
 * Two cards from the same set and format with a clear win-rate order, at the requested level if possible,
 * otherwise the nearest easier level, then harder ones. Sides are random.
 */
export function pickPair(cands: CompareCand[], level: number, rng: Rng, opts: { avoid?: Set<string>; prefer?: Set<string> } = {}): PairPick | null {
  const bySet = new Map<string, CompareCand[]>();
  for (const c of cands) {
    if (opts.avoid?.has(c.key)) continue;
    const list = bySet.get(c.set);
    if (list) list.push(c);
    else bySet.set(c.set, [c]);
  }
  const usable = [...bySet.values()].filter((l) => l.length >= 2).flat();
  if (usable.length < 2) return null;
  const top = COMPARE_LEVELS.length - 1;
  const start = Math.max(0, Math.min(top, level));
  const order = [start];
  for (let l = start - 1; l >= 0; l--) order.push(l);
  for (let l = start + 1; l <= top; l++) order.push(l);
  for (const lv of order) {
    const min = COMPARE_LEVELS[lv];
    const max = min + COMPARE.window;
    for (let attempt = 0; attempt < 40; attempt++) {
      const a = choose(usable, rng, opts.prefer);
      const bs = (bySet.get(a.set) ?? []).filter((b) => {
        const gap = Math.abs(a.g - b.g);
        return b.key !== a.key && gap >= min && gap <= max && clearPair(a, b);
      });
      if (bs.length === 0) continue;
      const b = choose(bs, rng, opts.prefer);
      const [left, right] = rng() < 0.5 ? [a, b] : [b, a];
      return { left, right, level: lv, z: diffZ(a, b) };
    }
  }
  return null;
}

/** Two right answers in a row step up a level and a miss steps down (a 2-down-1-up staircase, about 71% right). */
export function nextLevel(results: boolean[]): number {
  let level: number = COMPARE.startLevel;
  let run = 0;
  for (const right of results) {
    if (right) {
      run += 1;
      if (run >= 2) {
        level = Math.min(COMPARE_LEVELS.length - 1, level + 1);
        run = 0;
      }
    } else {
      level = Math.max(0, level - 1);
      run = 0;
    }
  }
  return level;
}

export function levelLabel(level: number): string {
  const min = COMPARE_LEVELS[level] ?? 0;
  return `Level ${level + 1} of ${COMPARE_LEVELS.length} · grades ${min}–${min + COMPARE.window} steps apart`;
}
