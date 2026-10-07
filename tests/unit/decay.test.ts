import { describe, expect, it } from 'vitest';
import { chooseHalfLife, DECAY, decayWeights, kish, prequentialErrors, type PreqRow } from '../../src/lib/decay.ts';
import { gaussian, seededRng } from '../../src/lib/random.ts';

/** y = level (or level + 2 before `change`) for a quarter of the rows marked by a feature, plus noise. */
function series(n: number, seed: string, change?: number): PreqRow[] {
  const rng = seededRng(seed);
  return Array.from({ length: n }, (_, i) => {
    const marked = rng() < 0.25;
    const effect = marked && change !== undefined && i < change ? 2 : 0;
    const x: Array<[number, number]> = [[0, 1]];
    if (marked) x.push([1, 1]);
    return { x, y: 0.3 + effect + 1.2 * gaussian(rng), v: 1.44 };
  });
}

describe('evidence decay', () => {
  it('weighs the newest item 1 and one half-life older 1/2, with the effective size a long memory implies', () => {
    const d = decayWeights(1000, 100);
    expect(d[999]).toBe(1);
    expect(d[899]).toBeCloseTo(0.5, 10);
    const delta = Math.pow(2, -1 / 100);
    expect(Math.abs(kish(d) - (1 + delta) / (1 - delta))).toBeLessThan(1);
    expect(kish(decayWeights(500, Infinity))).toBe(500);
  });

  it('keeps every observation for steady data', () => {
    const ridge = [1e-6, 2];
    let full = 0;
    for (let s = 0; s < 20; s++) if (chooseHalfLife(series(600, `steady:${s}`), 2, ridge).halfLife === Infinity) full++;
    expect(full).toBeGreaterThanOrEqual(16);
  });

  it('forgets after a change, choosing a finite half-life', () => {
    const ridge = [1e-6, 2];
    let finite = 0;
    for (let s = 0; s < 20; s++) if (Number.isFinite(chooseHalfLife(series(600, `change:${s}`, 250), 2, ridge).halfLife)) finite++;
    expect(finite).toBeGreaterThanOrEqual(18);
  });

  it('does not decay with too little data, and scores every candidate when it runs', () => {
    const ridge = [1e-6, 2];
    expect(chooseHalfLife(series(DECAY.minLooks - 1, 'small', 50), 2, ridge)).toEqual({ halfLife: Infinity, scores: [], scored: 0 });
    const c = chooseHalfLife(series(400, 'scored'), 2, ridge);
    expect(c.scores.map((s) => s.halfLife)).toEqual(DECAY.halfLives);
    expect(c.scored).toBe(400 - DECAY.burnIn);
  });

  it('charges a short memory for its uncertainty in the predictive loss', () => {
    const rows = series(400, 'loss');
    const mean = (h: number) => {
      const e = prequentialErrors(rows, 2, [1e-6, 2], h, 60, 20);
      return e.reduce((s, x) => s + x, 0) / e.length;
    };
    expect(mean(25)).toBeGreaterThan(mean(Infinity));
  });
});
