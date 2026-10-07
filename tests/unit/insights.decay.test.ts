import { describe, expect, it } from 'vitest';
import { decayWeights, kish } from '../../src/lib/decay.ts';
import type { Facet } from '../../src/lib/facets.ts';
import { fitModel, type FirstLook } from '../../src/lib/insights.ts';
import { gaussian, seededRng } from '../../src/lib/random.ts';

const facets: Facet[] = [
  { id: 'f:a', label: 'A', noun: 'a cards', group: 'Test', query: 'a' },
  { id: 'f:b', label: 'B', noun: 'b cards', group: 'Test', query: 'b' },
];

function looks(n: number): FirstLook[] {
  const rng = seededRng('decay-model');
  return Array.from({ length: n }, (_, i) => {
    const fs = [rng() < 0.3 ? 'f:a' : '', rng() < 0.3 ? 'f:b' : ''].filter(Boolean);
    const actual = Math.max(0, Math.min(12, Math.round(5 + 2 * gaussian(rng))));
    const user = Math.max(0, Math.min(12, Math.round(actual + (fs.includes('f:a') ? 1.5 : 0) + 1.1 * gaussian(rng))));
    return { key: `k${i}`, printingId: `p${i}`, user, actual, se: 0.4, facets: fs, rtMs: 3000, seq: (i % 20) + 1, ts: i };
  });
}

describe('insights model with decay', () => {
  const data = looks(600);
  const effect = (m: ReturnType<typeof fitModel>, id: string) => m?.effects.find((e) => e.facetId === id);

  it('without decay matches a near-infinite half-life, so steady users see unchanged results', () => {
    const a = fitModel(data, facets, Infinity);
    const b = fitModel(data, facets, 1e12);
    expect(a?.selected).toEqual(b?.selected);
    expect(effect(a, 'f:a')?.effect).toBeCloseTo(effect(b, 'f:a')?.effect ?? NaN, 6);
    expect(effect(a, 'f:a')?.se).toBeCloseTo(effect(b, 'f:a')?.se ?? NaN, 6);
    expect(a?.nEff).toBe(600);
  });

  it('charges decay in the standard errors and reports the effective sample', () => {
    const all = fitModel(data, facets, Infinity);
    const recent = fitModel(data, facets, 100);
    expect(recent?.halfLife).toBe(100);
    expect(recent?.nEff).toBeCloseTo(kish(decayWeights(600, 100)), 6);
    expect(effect(recent, 'f:a')?.se ?? 0).toBeGreaterThan(1.3 * (effect(all, 'f:a')?.se ?? Infinity));
    expect(recent?.seSlope ?? 0).toBeGreaterThan(all?.seSlope ?? Infinity);
    expect(recent?.selected).toContain('f:a');
  });
});
