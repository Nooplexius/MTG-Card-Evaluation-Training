import { describe, expect, it } from 'vitest';
import { colorContext, colorGroupFor, competitionRanks, crowdGaps, midRankPercentiles } from '../../src/lib/setstats.ts';

describe('crowd gap', () => {
  it('classifies cards drafted well ahead of or behind their performance (≥ 25 percentile points)', () => {
    const cards = Array.from({ length: 100 }, (_, i) => ({ gihWr: 0.5 + i * 0.001, alsa: 10 - i * 0.08 }));
    cards[10] = { gihWr: 0.51, alsa: 1.5 };
    cards[90] = { gihWr: 0.59, alsa: 9.9 };
    const res = crowdGaps(cards);
    expect(res[10].crowd).toBe('over');
    expect(res[10].gap as number).toBeGreaterThanOrEqual(25);
    expect(res[90].crowd).toBe('under');
    expect(res[50].crowd).toBeNull();
  });

  it('puts the threshold exactly at 25 points', () => {
    const base = Array.from({ length: 4 }, (_, i) => ({ gihWr: 0.5 + i * 0.01, alsa: 8 - i }));
    const swapped = [{ ...base[0], alsa: 7 }, { ...base[1], alsa: 8 }, base[2], base[3]];
    const res = crowdGaps(swapped);
    expect(res[0].gap).toBe(25);
    expect(res[0].crowd).toBe('over');
    expect(res[1].gap).toBe(-25);
    expect(res[1].crowd).toBe('under');
  });

  it('has no class without ALSA', () => {
    expect(crowdGaps([{ gihWr: 0.5, alsa: null }])[0]).toMatchObject({ crowd: null, gap: null });
  });
});

describe('set statistics', () => {
  it('ranks with ties sharing a rank', () => {
    expect(competitionRanks([0.6, 0.55, 0.6, 0.5])).toEqual([1, 3, 1, 4]);
  });
  it('computes mid-rank percentiles', () => {
    expect(midRankPercentiles([1, 2, 3, 4])).toEqual([12.5, 37.5, 62.5, 87.5]);
  });
  it('uses the color pair with ≥ 5 graded cards, else all multicolor; colorless uses all colorless', () => {
    const cards = [
      ...Array.from({ length: 5 }, () => ({ color: 'UB', gihWr: 0.6 })),
      ...Array.from({ length: 2 }, () => ({ color: 'RG', gihWr: 0.5 })),
      { color: '', gihWr: 0.55 },
      { color: 'R', gihWr: 0.52 },
    ];
    const ctx = colorContext(cards);
    expect(colorGroupFor('BU', ctx)?.key).toBe('UB');
    expect(colorGroupFor('RG', ctx)?.key).toBe('multi');
    expect(colorGroupFor('RG', ctx)?.stat.n).toBe(7);
    expect(colorGroupFor('', ctx)?.key).toBe('colorless');
    expect(colorGroupFor('R', ctx)?.label).toBe('Mono-red cards');
  });
});
