import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dailyFetch, FILTERS_URL, cardDataUrl, readFetchState, releaseDatesFrom, snapshotPath, type FetchTarget } from '../../pipeline/inputs/seventeen.ts';
import { loadSnapshots } from '../../pipeline/exports/discover.ts';
import { eligibility } from '../../pipeline/eligibility.ts';
import { fixtures } from '../helpers/fixtures.ts';

type Responder = (url: string) => { status: number; body?: unknown } | Error;

function mockFetch(responder: Responder) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const fn = async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, headers: init?.headers ?? {} });
    const r = responder(url);
    if (r instanceof Error) throw r;
    return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };
  return { fn, calls };
}

const filtersWith = (live: Record<string, string[]>) => ({ ...fixtures().filters, live_formats_by_expansion: live });
const RULES = { minDaysLive: 7, respect17LandsEmbargo: true, embargoDays: 13 };
const targets = (today: string): FetchTarget[] =>
  [
    { code: 'FRA', format: 'PremierDraft', rel: '2026-09-29' },
    { code: 'WOE', format: 'PremierDraft', rel: '2023-09-05' },
    { code: 'TLA', format: 'PremierDraft', rel: '2025-11-18' },
  ].map((t) => ({ code: t.code, format: t.format, eligible: eligibility(t.rel, today, RULES).eligible }));

const UA = 'Loupe/1.0 (+https://example.test/app/)';
const newDb = () => ({ root: mkdtempSync(join(tmpdir(), 'loupe-db-')) });

describe('daily 17Lands fetch (fixtures only)', () => {
  it('on 2026-10-03 reads the active list but requests nothing: FRA is embargoed, WOE is live only in QuickDraft', async () => {
    const db = newDb();
    const m = mockFetch((url) => (url === FILTERS_URL ? { status: 200, body: fixtures().filters } : { status: 500 }));
    const res = await dailyFetch({ enabled: true, today: '2026-10-03', targets: targets('2026-10-03'), db, userAgent: UA, fetch: m.fn });
    expect(m.calls.map((c) => c.url)).toEqual([FILTERS_URL]);
    expect(res.activeSets).toEqual(['FRA']);
    expect(m.calls[0].headers['User-Agent']).toContain('https://example.test/app/');
    expect(releaseDatesFrom(res.filters).FRA).toBe('2026-09-29');
  });

  it('from 2026-10-12 fetches FRA Premier Draft once per day and stores a snapshot', async () => {
    const db = newDb();
    const m = mockFetch((url) => (url === FILTERS_URL ? { status: 200, body: fixtures().filters } : { status: 200, body: { copyright: 'c', notes: 'n', data: fixtures().tla.data } }));
    const res = await dailyFetch({ enabled: true, today: '2026-10-12', targets: targets('2026-10-12'), db, userAgent: UA, fetch: m.fn });
    expect(m.calls.map((c) => c.url)).toEqual([FILTERS_URL, cardDataUrl('FRA', 'PremierDraft')]);
    expect(res.requested.at(-1)).toMatchObject({ code: 'FRA', status: 'ok' });
    expect(existsSync(snapshotPath(db, 'FRA', 'PremierDraft', '2026-10-12'))).toBe(true);
    const again = await dailyFetch({ enabled: true, today: '2026-10-12', targets: targets('2026-10-12'), db, userAgent: UA, fetch: m.fn });
    expect(m.calls).toHaveLength(2);
    expect(again.requested).toEqual([]);
    const next = await dailyFetch({ enabled: true, today: '2026-10-13', targets: targets('2026-10-13'), db, userAgent: UA, fetch: m.fn });
    expect(m.calls).toHaveLength(4);
    expect(next.requested.map((r) => r.code)).toEqual(['(filters)', 'FRA']);
    const snaps = loadSnapshots(db).data;
    expect(snaps.map((s) => [s.set, s.format, s.date, s.kind, s.precision])).toEqual([
      ['FRA', 'PremierDraft', '2026-10-12', 'snapshot', 'full'],
      ['FRA', 'PremierDraft', '2026-10-13', 'snapshot', 'full'],
    ]);
    expect(snaps[0].rows[0].mtgaId).toBeTypeOf('number');
  });

  it('skips a set that is live only in a different format than configured', async () => {
    const db = newDb();
    const live = { FRA: ['QuickDraft'], WOE: ['PremierDraft'], TLA: ['QuickDraft'] };
    const m = mockFetch((url) => (url === FILTERS_URL ? { status: 200, body: filtersWith(live) } : { status: 200, body: { data: fixtures().tla.data } }));
    const res = await dailyFetch({ enabled: true, today: '2026-10-12', targets: targets('2026-10-12'), db, userAgent: UA, fetch: m.fn });
    expect(res.activeSets).toEqual(['WOE']);
    expect(m.calls.map((c) => c.url)).toEqual([FILTERS_URL, cardDataUrl('WOE', 'PremierDraft')]);
  });

  it('runs requests one at a time and stops for the day on a 429, keeping last good data', async () => {
    const db = newDb();
    const live = { FRA: ['PremierDraft'], WOE: ['PremierDraft'], TLA: ['PremierDraft'] };
    let inFlight = 0;
    let maxInFlight = 0;
    const calls: string[] = [];
    const fn = async (url: string) => {
      calls.push(url);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      if (url === FILTERS_URL) return new Response(JSON.stringify(filtersWith(live)), { status: 200 });
      if (url.includes('expansion=WOE')) return new Response('slow down', { status: 429 });
      return new Response(JSON.stringify({ data: fixtures().tla.data }), { status: 200 });
    };
    const res = await dailyFetch({ enabled: true, today: '2026-10-12', targets: targets('2026-10-12'), db, userAgent: UA, fetch: fn });
    expect(maxInFlight).toBe(1);
    expect(calls).toEqual([FILTERS_URL, cardDataUrl('FRA', 'PremierDraft'), cardDataUrl('WOE', 'PremierDraft')]);
    expect(res.halted).toBe(true);
    expect(res.failures).toEqual([{ code: 'WOE', message: 'HTTP 429 Too Many Requests' }]);
    const state = readFetchState(db);
    expect(state.haltedOn).toBe('2026-10-12');
    expect(state.sets.WOE).toMatchObject({ status: 'rate-limited', httpStatus: 429 });
    const again = await dailyFetch({ enabled: true, today: '2026-10-12', targets: targets('2026-10-12'), db, userAgent: UA, fetch: fn });
    expect(again.halted).toBe(true);
    expect(calls).toHaveLength(3);
    expect(JSON.parse(readFileSync(snapshotPath(db, 'FRA', 'PremierDraft', '2026-10-12'), 'utf8')).set).toBe('FRA');
  });

  it('stops on a network error or a failed filters request', async () => {
    const db = newDb();
    const m = mockFetch(() => new Error('ECONNRESET'));
    const res = await dailyFetch({ enabled: true, today: '2026-10-12', targets: targets('2026-10-12'), db, userAgent: UA, fetch: m.fn });
    expect(m.calls).toHaveLength(1);
    expect(res.halted).toBe(true);
    expect(res.failures[0]).toEqual({ code: '(filters)', message: 'ECONNRESET' });
  });

  it('makes no requests with the kill switch off', async () => {
    const db = newDb();
    const m = mockFetch(() => ({ status: 200, body: fixtures().filters }));
    const res = await dailyFetch({ enabled: false, today: '2026-10-12', targets: targets('2026-10-12'), db, userAgent: UA, fetch: m.fn });
    expect(m.calls).toHaveLength(0);
    expect(res.disabled).toBe(true);
  });
});
