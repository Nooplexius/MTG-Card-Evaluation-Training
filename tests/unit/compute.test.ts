import { describe, expect, it } from 'vitest';
import { computeBuild, type ComputeInput } from '../../pipeline/compute.ts';
import { toCsv } from '../../pipeline/exports/csv.ts';
import { rowsToExportTable } from '../../pipeline/exports/format.ts';
import { normalizeApiRows } from '../../pipeline/exports/normalizeApi.ts';
import { parseExportCsv } from '../../pipeline/exports/parseExport.ts';
import type { ScryCard } from '../../pipeline/inputs/scryfall.ts';
import { standardSetCodes } from '../../pipeline/inputs/standard.ts';
import { renderStatus } from '../../pipeline/status.ts';
import { ALL_GROUPS, type SeventeenData, type SeventeenRow } from '../../pipeline/types.ts';
import type { SetStatus } from '../../src/lib/data.ts';
import { fixtures } from '../helpers/fixtures.ts';

const f = fixtures();

/** Minimal legal printings for Standard sets outside the fixture subset, so the Scryfall cross-check agrees. */
function withStandardStubs(cards: ScryCard[]): ScryCard[] {
  const have = new Set(cards.map((c) => c.set));
  const stubs: ScryCard[] = [];
  for (const code of standardSetCodes(f.wis, '2026-10-03')) {
    const s = code.toLowerCase();
    if (have.has(s)) continue;
    for (let i = 0; i < 3; i++)
      stubs.push({ id: `stub-${s}-${i}`, oracle_id: `stub-${s}-${i}`, name: `Stub ${s} ${i}`, lang: 'en', layout: 'normal', set: s, set_type: 'expansion', collector_number: String(i + 1), released_at: '2024-01-01', rarity: 'common', booster: true, type_line: 'Creature — Stub', legalities: { standard: 'legal' } });
  }
  return [...cards, ...stubs];
}
const CARDS = withStandardStubs(f.cards);

function exportOf(rows: SeventeenRow[], path: string, date: string): SeventeenData {
  const parsed = parseExportCsv(toCsv(rowsToExportTable(rows, ALL_GROUPS)));
  return { kind: 'export', path, date, dateSource: 'filename', precision: 'rounded', groups: parsed.groups, rows: parsed.rows };
}
const tlaRows = () => normalizeApiRows(f.tla).rows;
const om1Rows = () => normalizeApiRows(f.om1).rows;

function input(over: Partial<ComputeInput> = {}): ComputeInput {
  return {
    today: '2026-10-03',
    generatedAt: '2026-10-03T12:00:00Z',
    pipeline: f.pipeline,
    setsCfg: f.setsCfg,
    wis: f.wis,
    scrySets: f.scrySets,
    cards: CARDS,
    tags: f.tags,
    cardsCsv: f.cardsCsv,
    keywords: f.keywords,
    exports: [exportOf(tlaRows(), 'data/17lands/card-ratings-2026-10-01.csv', '2026-10-01'), exportOf(om1Rows(), 'data/17lands/card-ratings-2026-10-01 (1).csv', '2026-10-01')],
    exportErrors: [],
    snapshots: [],
    synthetic: [],
    fetch: { disabled: false, halted: false, activeSets: ['FRA'], filtersDate: '2026-10-03', releaseDates: {}, state: { sets: {} } },
    lastGood: null,
    ...over,
  };
}

const st = (out: ReturnType<typeof computeBuild>, code: string) => out.status.sets.find((s) => s.code === code) as SetStatus;

describe('build: pool and status on 2026-10-03', () => {
  const out = computeBuild(input());

  it('builds TLA and OM1 from exports with zero unmatched cards and 17Lands grades', () => {
    expect(out.fatal).toEqual([]);
    expect(out.unmatched).toEqual([]);
    expect(out.manifest.sets.map((s) => s.code)).toEqual(['OM1', 'TLA']);
    const tla = out.setFiles.find((s) => s.code === 'TLA')!;
    expect(tla.cards).toHaveLength(295);
    expect(tla.n).toBe(295);
    expect(tla.cards.filter((c) => c.b === 'tle').length).toBeGreaterThan(0);
    expect(tla.cards[0].r).toBe(1);
    expect(new Set(tla.cards.map((c) => c.g)).size).toBeGreaterThan(8);
    const om1 = out.setFiles.find((s) => s.code === 'OM1')!;
    expect(om1.format).toBe('PickTwoDraft');
    expect(om1.cards.filter((c) => c.b === null).every((c) => c.p.set === 'om1')).toBe(true);
    expect(out.manifest.synthetic).toBe(false);
  });

  it('lists every Standard-legal limited set with a state and export links for the rest', () => {
    expect(out.status.sets.map((s) => s.code)).toEqual(['WOE', 'LCI', 'MKM', 'OTJ', 'BLB', 'DSK', 'FDN', 'DFT', 'TDM', 'FIN', 'EOE', 'OM1', 'TLA', 'ECL', 'TMT', 'SOS', 'MSH', 'HOB', 'FRA']);
    expect(st(out, 'TLA')).toMatchObject({ state: 'live', inPool: true, source: 'export', dataDate: '2026-10-01', cards: 295 });
    expect(st(out, 'WOE')).toMatchObject({ state: 'missing', inPool: false });
    expect(st(out, 'FRA')).toMatchObject({ state: 'held-back', active: true, eligibleFrom: '2026-10-12' });
    expect(st(out, 'FRA').reason).toMatch(/embargo until 2026-10-12/);
    expect(st(out, 'OTJ').standardCodes).toEqual(['OTJ', 'BIG']);
    expect(st(out, 'OM1').standardCodes.sort()).toEqual(['OM1', 'SPM']);
    const text = renderStatus(out.status);
    expect(text).toContain('expansion=WOE&format=PremierDraft&view=table&columns=seen,picked,played,opening,drawn,everInHand,notSeen,improvement');
    expect(text).toContain('expansion=FRA');
    expect(text).not.toMatch(/\n {2}TLA {2}https/);
  });

  it('labels each set with source and window', () => {
    const tla = out.manifest.sets.find((s) => s.code === 'TLA')!;
    expect(tla.windowLabel).toBe('all time through Oct 1, 2026');
    expect(tla.cardDataUrl).toBe('https://www.17lands.com/card_data?expansion=TLA&format=PremierDraft');
  });
});

describe('build: set eligibility over time and with config switches', () => {
  it('holds back a set without a release date and includes FRA with the embargo off from 2026-10-06', () => {
    const noRel = { ...f.setsCfg, sets: { ...f.setsCfg.sets, TLA: { ...f.setsCfg.sets.TLA, arenaRelease: undefined } } };
    const out = computeBuild(input({ setsCfg: noRel }));
    expect(st(out, 'TLA')).toMatchObject({ state: 'held-back', inPool: false });
    expect(st(out, 'TLA').reason).toMatch(/no Arena release date/);
    const off = computeBuild(input({ today: '2026-10-06', pipeline: { ...f.pipeline, respect17LandsEmbargo: false } }));
    expect(st(off, 'FRA').state).toBe('missing');
    const on = computeBuild(input({ today: '2026-10-06' }));
    expect(st(on, 'FRA').state).toBe('held-back');
  });

  it('holds back a set with fewer than 15 graded cards', () => {
    let i = 0;
    const few = tlaRows().map((r) => (i++ < 14 ? r : { ...r, gihWr: null }));
    const out = computeBuild(input({ exports: [exportOf(few, 'data/17lands/few.csv', '2026-10-01')] }));
    expect(st(out, 'TLA')).toMatchObject({ state: 'held-back', inPool: false });
    expect(st(out, 'TLA').reason).toMatch(/only \d+ cards have a GIH WR; 15 are needed/);
  });
});

describe('build: refusals, fetch failures and staleness', () => {
  it('keeps the previous valid export when the newest is refused, and flags it', () => {
    const filtered = tlaRows().filter((r) => r.color.includes('U'));
    const out = computeBuild(
      input({ exports: [exportOf(tlaRows(), 'data/17lands/card-ratings-2026-09-01.csv', '2026-09-01'), exportOf(filtered, 'data/17lands/card-ratings-2026-10-02.csv', '2026-10-02')] }),
    );
    expect(st(out, 'TLA')).toMatchObject({ state: 'refused', inPool: true, dataDate: '2026-09-01' });
    expect(st(out, 'TLA').reason).toMatch(/2026-10-02\.csv refused: looks filtered/);
    expect(out.manifest.sets.find((s) => s.code === 'TLA')?.dataDate).toBe('2026-09-01');
  });

  it('marks an active set stale when its newest data is more than 2 days old', () => {
    const fetch = { disabled: true, halted: false, activeSets: ['TLA'], filtersDate: '2026-09-20', releaseDates: {}, state: { sets: {} } };
    const fresh = computeBuild(input({ today: '2026-10-03', fetch }));
    expect(st(fresh, 'TLA').state).toBe('live');
    const stale = computeBuild(input({ today: '2026-10-04', fetch }));
    expect(st(stale, 'TLA').state).toBe('stale');
    expect(st(stale, 'TLA').flags.join()).toMatch(/3 days old.*switched off/);
    const inactive = computeBuild(input({ today: '2026-12-01', fetch: { ...fetch, activeSets: [] } }));
    expect(st(inactive, 'TLA').state).toBe('live');
  });

  it('reports a failed daily fetch while keeping the last snapshot', () => {
    const snap: SeventeenData = { kind: 'snapshot', path: 'data-branch:snapshots/TLA/PremierDraft/2026-10-02.json', set: 'TLA', format: 'PremierDraft', date: '2026-10-02', dateSource: 'fetch', precision: 'full', groups: ALL_GROUPS, rows: tlaRows() };
    const fetch = { disabled: false, halted: true, activeSets: ['TLA'], filtersDate: '2026-10-03', releaseDates: {}, state: { haltedOn: '2026-10-03', sets: { TLA: { date: '2026-10-03', status: 'rate-limited' as const, httpStatus: 429, message: 'HTTP 429 Too Many Requests' } } } };
    const out = computeBuild(input({ exports: [], snapshots: [snap], fetch }));
    expect(st(out, 'TLA')).toMatchObject({ state: 'fetch-failed', inPool: true, source: 'fetch', dataDate: '2026-10-02' });
    expect(st(out, 'TLA').reason).toMatch(/429/);
  });

  it('uses fetched snapshots, which carry full precision and mtga ids', () => {
    const snap: SeventeenData = { kind: 'snapshot', path: 'data-branch:snapshots/TLA/PremierDraft/2026-10-03.json', set: 'TLA', format: 'PremierDraft', date: '2026-10-03', dateSource: 'fetch', precision: 'full', groups: ALL_GROUPS, rows: tlaRows() };
    const out = computeBuild(input({ snapshots: [snap] }));
    expect(st(out, 'TLA')).toMatchObject({ source: 'fetch', dataDate: '2026-10-03' });
    expect(out.setFiles.find((s) => s.code === 'TLA')?.precision).toBe('full');
  });
});

describe('build: synthetic fallback and last good data', () => {
  it('builds on synthetic samples only when there is no valid 17Lands data at all', () => {
    const syn = { ...exportOf(tlaRows(), 'data/synthetic/card-ratings-2026-10-03.csv', '2026-10-03'), kind: 'synthetic' as const };
    const out = computeBuild(input({ exports: [], synthetic: [syn] }));
    expect(out.manifest.synthetic).toBe(true);
    expect(st(out, 'TLA')).toMatchObject({ state: 'missing', inPool: true, source: 'synthetic' });
    const real = computeBuild(input({ synthetic: [syn] }));
    expect(real.manifest.synthetic).toBe(false);
  });

  it('keeps the last good data for a set whose Standard legality is disputed', () => {
    const good = computeBuild(input());
    const lgManifest = { ...good.manifest, dataHash: 'x', tagsFile: 't', statusFile: 's' };
    const lastGood = { manifest: lgManifest, setFiles: new Map(good.setFiles.map((s) => [s.code, s] as const)) };
    const cards = CARDS.map((c) => (c.set === 'tla' ? { ...c, legalities: { standard: 'not_legal' } } : c));
    const out = computeBuild(input({ cards, lastGood, exports: [] }));
    expect(st(out, 'TLA')).toMatchObject({ state: 'live', inPool: true });
    expect(st(out, 'TLA').flags.join()).toMatch(/disputed/);
    expect(out.manifest.sets.find((s) => s.code === 'TLA')?.heldOver).toBe(true);
    const none = computeBuild(input({ cards }));
    expect(st(none, 'TLA')).toMatchObject({ state: 'held-back', inPool: false });
  });

  it('fails loudly when the Standard list is unusable', () => {
    const out = computeBuild(input({ wis: { sets: [] } }));
    expect(out.fatal.length).toBeGreaterThan(0);
  });
});
