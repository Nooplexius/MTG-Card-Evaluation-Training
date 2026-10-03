import { describe, expect, it } from 'vitest';
import { normalizeApiRows } from '../../pipeline/exports/normalizeApi.ts';
import { chooseNewestValid, coverageProblems, validateData } from '../../pipeline/exports/validate.ts';
import { ALL_GROUPS, type SeventeenData, type SeventeenRow } from '../../pipeline/types.ts';
import { fixtures } from '../helpers/fixtures.ts';

function tlaData(over: Partial<SeventeenData> = {}, map?: (r: SeventeenRow) => SeventeenRow | null): SeventeenData {
  const rows = normalizeApiRows(fixtures().tla).rows.map((r) => (map ? map({ ...r }) : r)).filter((r): r is SeventeenRow => r !== null);
  return { kind: 'export', path: 'data/17lands/x.csv', date: '2026-10-01', dateSource: 'filename', precision: 'rounded', groups: ALL_GROUPS, rows, set: 'TLA', format: 'PremierDraft', ...over };
}

const shiftWr = (d: number) => (r: SeventeenRow) => ({ ...r, gihWr: r.gihWr === null ? null : r.gihWr + d });

describe('export validation', () => {
  it('accepts a complete all-time export', () => {
    const res = validateData(tlaData(), null);
    expect(res.reasons).toEqual([]);
    expect(res.metrics.graded).toBe(295);
    expect(res.metrics.mean).toBeGreaterThan(0.52);
  });

  it('refuses a color-filtered export (missing colors) and a rarity-filtered export', () => {
    const red = tlaData({}, (r) => (r.color.includes('R') ? r : null));
    expect(coverageProblems(red).join()).toMatch(/mono-colored W\/U\/B\/G/);
    expect(validateData(red, null).ok).toBe(false);
    const commons = tlaData({}, (r) => (r.rarity === 'C' ? r : null));
    const res = validateData(commons, null);
    expect(res.ok).toBe(false);
    expect(res.reasons.join()).toMatch(/no U\/R\/M rarity cards/);
  });

  it('refuses an export without the GIH columns', () => {
    expect(validateData(tlaData({ groups: ['seen', 'picked', 'improvement'] }), null).reasons.join()).toMatch(/# GIH/);
  });

  it('refuses a set-average GIH WR outside 52–61% (user-group or deck-color filter)', () => {
    const high = validateData(tlaData({}, shiftWr(0.07)), null);
    expect(high.ok).toBe(false);
    expect(high.reasons.join()).toMatch(/outside 52\.0%–61\.0%/);
    const low = validateData(tlaData({}, shiftWr(-0.05)), null);
    expect(low.ok).toBe(false);
  });

  it('refuses a mean that moved more than 1.5 points from the previous export, and accepts 1.4', () => {
    const prev = tlaData({ date: '2026-09-01' });
    const moved = validateData(tlaData({}, shiftWr(0.016)), prev);
    expect(moved.ok).toBe(false);
    expect(moved.reasons.join()).toMatch(/moved 1\.60 points/);
    expect(validateData(tlaData({}, shiftWr(0.014)), prev).ok).toBe(true);
  });

  it('refuses a partial export with fewer than 95% of the previous rows', () => {
    const prev = tlaData({ date: '2026-09-01' });
    let i = 0;
    const partial = tlaData({}, (r) => (i++ % 10 === 0 ? null : r));
    const res = validateData(partial, prev);
    expect(res.ok).toBe(false);
    expect(res.reasons.join()).toMatch(/fewer than 95%/);
  });

  it('refuses a shrinking # GIH total (a period other than All time)', () => {
    const prev = tlaData({ date: '2026-09-01' });
    const lastWeek = tlaData({}, (r) => ({ ...r, gih: r.gih === null ? null : Math.round(r.gih * 0.6) }));
    const res = validateData(lastWeek, prev);
    expect(res.ok).toBe(false);
    expect(res.reasons.join()).toMatch(/All time/);
  });
});

describe('newest valid data per set and format', () => {
  it('falls back to the previous valid export when the newest is refused', () => {
    const old = tlaData({ path: 'a.csv', date: '2026-09-01' });
    const bad = tlaData({ path: 'b.csv', date: '2026-10-01' }, (r) => (r.color.includes('G') ? r : null));
    const res = chooseNewestValid([bad, old]);
    expect(res.chosen?.path).toBe('a.csv');
    expect(res.newestRefused?.data.path).toBe('b.csv');
  });

  it('validates each candidate against the newest older valid one, not a refused one', () => {
    const a = tlaData({ path: 'a.csv', date: '2026-08-01' });
    const b = tlaData({ path: 'b.csv', date: '2026-09-01' }, (r) => ({ ...r, gih: r.gih === null ? null : Math.round(r.gih * 0.5) }));
    const c = tlaData({ path: 'c.csv', date: '2026-10-01' }, (r) => ({ ...r, gih: r.gih === null ? null : r.gih + 10 }));
    const res = chooseNewestValid([c, b, a]);
    expect(res.entries.map((e) => [e.data.path, e.result.ok, e.previous?.path ?? null])).toEqual([
      ['a.csv', true, null],
      ['b.csv', false, 'a.csv'],
      ['c.csv', true, 'a.csv'],
    ]);
    expect(res.chosen?.path).toBe('c.csv');
    expect(res.newestRefused).toBeNull();
  });

  it('breaks a same-date tie by the larger # GIH total, from either source', () => {
    const exp = tlaData({ path: 'export.csv', date: '2026-10-01' });
    const snap = tlaData({ path: 'snapshot.json', kind: 'snapshot', date: '2026-10-01' }, (r) => ({ ...r, gih: r.gih === null ? null : r.gih + 5 }));
    expect(chooseNewestValid([snap, exp]).chosen?.path).toBe('snapshot.json');
    const snapSmall = tlaData({ path: 'snapshot.json', kind: 'snapshot', date: '2026-10-01' }, (r) => ({ ...r, gih: r.gih === null ? null : Math.max(0, r.gih - 5) }));
    expect(chooseNewestValid([exp, snapSmall]).chosen?.path).toBe('export.csv');
  });

  it('prefers the newest date over a larger total', () => {
    const older = tlaData({ path: 'old.csv', date: '2026-09-01' }, (r) => ({ ...r, gih: r.gih === null ? null : r.gih }));
    const newer = tlaData({ path: 'new.csv', date: '2026-10-02' }, (r) => ({ ...r, gih: r.gih === null ? null : r.gih + 1 }));
    expect(chooseNewestValid([newer, older]).chosen?.path).toBe('new.csv');
  });
});
