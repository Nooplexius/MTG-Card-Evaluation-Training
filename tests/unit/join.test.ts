import { describe, expect, it } from 'vitest';
import { normalizeApiRows } from '../../pipeline/exports/normalizeApi.ts';
import { normName } from '../../pipeline/inputs/cardsCsv.ts';
import { buildJoinIndex, joinRow, setMatchRate } from '../../pipeline/join.ts';
import { buildLimitedSet } from '../../pipeline/limitedSets.ts';
import type { SeventeenRow } from '../../pipeline/types.ts';
import { fixtures } from '../helpers/fixtures.ts';

const f = fixtures();
const idx = buildJoinIndex(f.cards, f.cardsCsv);
const ls = (code: string) => buildLimitedSet(code, f.setsCfg, f.scrySets, f.cards);
const asExport = (rows: SeventeenRow[]) => rows.map((r) => ({ ...r, mtgaId: undefined }));
const csvNames = (exp: string) => [...(f.cardsCsv.get(exp)?.keys() ?? [])];
const rowNamed = (name: string): SeventeenRow => ({ name, color: '', rarity: 'C', gih: 1000, gihWr: 0.55 });

describe('limited sets', () => {
  it('folds bonus sheets into their parent and maps SPM to OM1', () => {
    expect(ls('TLA')).toMatchObject({ main: 'tla', bonus: ['tle'], cardsCsvCodes: ['TLA', 'TLE'] });
    expect(ls('OTJ').bonus.sort()).toEqual(['big', 'otp']);
    expect(ls('OTJ').covers).toContain('BIG');
    expect(ls('OM1')).toMatchObject({ main: 'om1', bonus: ['omb'], format: 'PickTwoDraft', covers: ['OM1', 'SPM'] });
    expect(ls('TMT').bonus).toContain('pza');
    expect(ls('TMT').bonus).not.toContain('ttmt');
    expect(ls('TLA').bonus).not.toContain('ptla');
    expect(ls('MKM').displayCodes).toContain('spg');
    expect(ls('TLA').displayCodes).not.toContain('spg');
  });
});

describe('join chain', () => {
  it('joins every TLA row by mtga_id, tagging the 61 TLE bonus-sheet cards', () => {
    const rows = normalizeApiRows(f.tla).rows;
    const out = rows.map((r) => joinRow(r, ls('TLA'), idx));
    expect(out.filter((o) => !o.ok)).toEqual([]);
    const matches = out.map((o) => (o.ok ? o.match : null)).filter((m) => m !== null);
    expect(matches.filter((m) => m.bonus === 'tle')).toHaveLength(61);
    expect(matches.every((m) => m.step === 1)).toBe(true);
    const tp = matches.find((m) => m.matched.arena_id === 98622);
    expect(tp?.display.set).toBe('tle');
    expect(tp?.display.name).toBe("Teferi's Protection");
    expect(matches.find((m) => m.matched.arena_id === 97274)?.display.name).toBe("Aang's Journey");
  });

  it('joins a TLA export (names only) through cards.csv to the same oracle cards', () => {
    const rows = normalizeApiRows(f.tla).rows;
    const byId = rows.map((r) => joinRow(r, ls('TLA'), idx));
    const byName = asExport(rows).map((r) => joinRow(r, ls('TLA'), idx));
    byName.forEach((o, i) => {
      expect(o.ok).toBe(true);
      const a = byId[i];
      if (o.ok && a.ok) {
        expect(o.match.oracleId).toBe(a.match.oracleId);
        expect(o.match.display.set).toBe(a.match.display.set);
      }
    });
  });

  it('shows OM1 cards with their Arena printing (om1, printed_name) even though mtga ids point at spm', () => {
    const rows = normalizeApiRows(f.om1).rows;
    for (const source of [rows, asExport(rows)]) {
      const out = source.map((r) => joinRow(r, ls('OM1'), idx));
      expect(out.filter((o) => !o.ok)).toEqual([]);
      const m = out.map((o) => (o.ok ? o.match : null)).filter((x) => x !== null);
      expect(m.filter((x) => x.bonus === 'omb')).toHaveLength(40);
      expect(m.filter((x) => x.bonus === null).every((x) => x.display.set === 'om1')).toBe(true);
      const av = m.find((x) => x.display.name === 'Anti-Venom, Horrifying Healer');
      expect(av?.display.set).toBe('om1');
      expect(av?.display.printed_name).toBeTruthy();
      expect(av?.display.printed_name).not.toBe('Anti-Venom, Horrifying Healer');
    }
  });

  it('matches DFC rows by front-face name', () => {
    const peter = joinRow(rowNamed('Peter Parker'), ls('OM1'), idx);
    expect(peter.ok && peter.match.display.name).toBe('Peter Parker // Amazing Spider-Man');
    expect(peter.ok && peter.match.display.set).toBe('om1');
    const yangchen = joinRow(rowNamed('The Legend of Yangchen'), ls('TLA'), idx);
    expect(yangchen.ok && yangchen.match.display.layout).toBe('transform');
  });

  it('finds TMT Source Material (pza) cards by name though they have no arena_id', () => {
    const names = csvNames('PZA');
    expect(names.length).toBe(20);
    for (const n of names) {
      const o = joinRow(rowNamed(n), ls('TMT'), idx);
      expect(o.ok, n).toBe(true);
      if (o.ok) {
        expect(o.match.bonus).toBe('pza');
        expect(o.match.display.set).toBe('pza');
      }
    }
  });

  it('uses the Special Guests printing from the wave released with the set', () => {
    const mkm = ls('MKM');
    const wave = f.cards.filter((c) => c.set === 'spg' && c.released_at === mkm.spgDate);
    expect(wave.length).toBe(10);
    for (const c of wave) {
      const o = joinRow(rowNamed(c.name.split(' // ')[0]), mkm, idx);
      expect(o.ok && o.match.display.set, c.name).toBe('spg');
      expect(o.ok && o.match.display.released_at).toBe(mkm.spgDate);
    }
  });

  it('keeps The Big Score cards in OTJ, tagged as a bonus sheet', () => {
    const big = f.cards.filter((c) => c.set === 'big' && c.arena_id);
    const o = joinRow(rowNamed(big[0].name.split(' // ')[0]), ls('OTJ'), idx);
    expect(o.ok && o.match.bonus).toBe('big');
  });

  it('reports a name with no match anywhere', () => {
    const o = joinRow(rowNamed('Definitely Not A Card'), ls('TLA'), idx);
    expect(o.ok).toBe(false);
  });
});

describe('set inference', () => {
  it('identifies TLA and OM1 exports (Marvel names) uniquely at ≥ 90%', () => {
    const candidates = ['TLA', 'OM1', 'TMT', 'OTJ', 'MKM', 'DSK'].map(ls);
    const tlaRows = asExport(normalizeApiRows(f.tla).rows);
    const om1Rows = asExport(normalizeApiRows(f.om1).rows);
    const rate = (rows: SeventeenRow[]) => Object.fromEntries(candidates.map((c) => [c.code, setMatchRate(rows, c, idx)]));
    const t = rate(tlaRows);
    expect(t.TLA).toBe(1);
    expect(Object.entries(t).filter(([, v]) => v >= 0.9).map(([k]) => k)).toEqual(['TLA']);
    const o = rate(om1Rows);
    expect(o.OM1).toBe(1);
    expect(Object.entries(o).filter(([, v]) => v >= 0.9).map(([k]) => k)).toEqual(['OM1']);
  });

  it('does not count matches from Arena printings elsewhere (step 3) toward inference', () => {
    const tlaRows = asExport(normalizeApiRows(f.tla).rows);
    expect(setMatchRate(tlaRows, ls('MKM'), idx)).toBeLessThan(0.2);
    expect(normName('  Aang’s Journey ')).toBe("aang's journey");
  });
});
