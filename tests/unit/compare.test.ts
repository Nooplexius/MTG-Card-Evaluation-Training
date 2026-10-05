import { describe, expect, it } from 'vitest';
import { clearPair, COMPARE, COMPARE_LEVELS, diffZ, nextLevel, pickPair, type CompareCand } from '../../src/lib/compare.ts';
import { seededRng } from '../../src/lib/random.ts';

/** Roughly 17Lands-like: about 1.2 points of GIH WR per grade step, 2,000 to 40,000 games in hand. */
function pool(set: string, n: number, rng: () => number): CompareCand[] {
  return Array.from({ length: n }, (_, i) => {
    const g = i % 13;
    return { key: `${set}:${i}`, set, oracleId: `${set}-o${i}`, g, wr: 0.47 + g * 0.012 + rng() * 0.004, n: 2000 + Math.floor(rng() * 38000) };
  });
}

describe('compare mode pairs', () => {
  const rng = seededRng('compare');
  const cands = [...pool('AAA', 120, rng), ...pool('BBB', 90, rng)];

  it('always pairs two different cards from the same set with a clear win-rate order', () => {
    for (let i = 0; i < 300; i++) {
      const p = pickPair(cands, i % COMPARE_LEVELS.length, rng);
      expect(p).not.toBeNull();
      if (!p) continue;
      expect(p.left.set).toBe(p.right.set);
      expect(p.left.oracleId).not.toBe(p.right.oracleId);
      expect(Math.abs(p.left.wr - p.right.wr) * 100).toBeGreaterThanOrEqual(COMPARE.minDiffPp);
      expect(diffZ(p.left, p.right)).toBeGreaterThanOrEqual(COMPARE.minZ);
    }
  });

  it('keeps the grade gap inside the level window when such pairs exist', () => {
    for (let level = 0; level < COMPARE_LEVELS.length; level++) {
      for (let i = 0; i < 50; i++) {
        const p = pickPair(cands, level, rng);
        expect(p?.level).toBe(level);
        const gap = Math.abs((p?.left.g ?? 0) - (p?.right.g ?? 0));
        expect(gap).toBeGreaterThanOrEqual(COMPARE_LEVELS[level]);
        expect(gap).toBeLessThanOrEqual(COMPARE_LEVELS[level] + COMPARE.window);
      }
    }
  });

  it('falls back to an easier level, avoids recent cards and refuses noisy pairs', () => {
    const farApart = cands.filter((c) => c.set === 'AAA' && (c.g === 2 || c.g === 9));
    const p = pickPair(farApart, COMPARE_LEVELS.length - 1, rng);
    expect(p?.level).toBe(0);
    expect(p && Math.abs(p.left.g - p.right.g)).toBe(7);
    const avoid = new Set(cands.slice(0, 100).map((c) => c.key));
    for (let i = 0; i < 50; i++) {
      const q = pickPair(cands, 2, rng, { avoid });
      expect(q && (avoid.has(q.left.key) || avoid.has(q.right.key))).toBe(false);
    }
    const a: CompareCand = { key: 'X:1', set: 'X', oracleId: 'o1', g: 6, wr: 0.55, n: 120 };
    const b: CompareCand = { key: 'X:2', set: 'X', oracleId: 'o2', g: 7, wr: 0.57, n: 150 };
    expect(clearPair(a, b)).toBe(false);
    expect(pickPair([a, b], 5, rng)).toBeNull();
    expect(pickPair([a, { ...b, set: 'Y' }], 0, rng)).toBeNull();
  });

  it('prefers cards that were already shown with a grade', () => {
    const prefer = new Set(cands.filter((c) => c.set === 'AAA' && Number(c.key.split(':')[1]) % 4 === 0).map((c) => c.key));
    let hits = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      const p = pickPair(cands, 2, rng, { prefer });
      if (p && prefer.has(p.left.key)) hits++;
      if (p && prefer.has(p.right.key)) hits++;
    }
    expect(hits / (2 * N)).toBeGreaterThan(0.45);
  });
});

describe('compare difficulty staircase', () => {
  it('starts at the default level, steps up after two right answers and down after a miss', () => {
    expect(nextLevel([])).toBe(COMPARE.startLevel);
    expect(nextLevel([true])).toBe(COMPARE.startLevel);
    expect(nextLevel([true, true])).toBe(COMPARE.startLevel + 1);
    expect(nextLevel([true, true, false])).toBe(COMPARE.startLevel);
    expect(nextLevel([false, false, false, false])).toBe(0);
    expect(nextLevel(Array.from({ length: 40 }, () => true))).toBe(COMPARE_LEVELS.length - 1);
  });
});
