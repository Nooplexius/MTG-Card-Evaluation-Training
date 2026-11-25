import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runBuild } from '../../pipeline/build.ts';
import { CARDS_CSV_URL, loadCardsCsv } from '../../pipeline/inputs/cardsCsv.ts';
import * as scryfall from '../../pipeline/inputs/scryfall.ts';
import { cardDataUrl, FILTERS_URL, snapshotPath } from '../../pipeline/inputs/seventeen.ts';
import { FIX, fixtures, ROOT } from '../helpers/fixtures.ts';

const fallbackPath = join(FIX, '17lands/cards.csv');
const bundledCsv = readFileSync(fallbackPath, 'utf8');
const cachedCsv = bundledCsv + '\n999999,TEST,Cache-only card,rare,R,1,Creature,True\n';
let dir: string;
let cachePath: string;
const log = vi.fn();
const options = { offline: false, fallbackPath, log };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'loupe-cards-'));
  cachePath = join(dir, 'cards.csv');
  log.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
});

it('uses the expired cache on HTTP 403 and refreshes it on the next successful request', async () => {
  writeFileSync(cachePath, cachedCsv);
  utimesSync(cachePath, new Date(0), new Date(0));
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 403 }))
    .mockResolvedValueOnce(new Response(bundledCsv));
  vi.stubGlobal('fetch', fetch);

  const cached = await loadCardsCsv(cachePath, options);
  expect(cached.at(-1)?.name).toBe('Cache-only card');
  expect(log).toHaveBeenCalledWith(expect.stringMatching(/403.*input cache/));
  expect(statSync(cachePath).mtimeMs).toBe(0);

  const fresh = await loadCardsCsv(cachePath, options);
  expect(fresh).toHaveLength(cached.length - 1);
  expect(readFileSync(cachePath, 'utf8')).toBe(bundledCsv);
  expect(await loadCardsCsv(cachePath, options)).toEqual(fresh);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('uses the committed lookup on HTTP 403 with a cold cache, without caching it as a full download', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
  vi.stubGlobal('fetch', fetch);
  const rows = await loadCardsCsv(cachePath, options);
  expect(rows).toContainEqual(expect.objectContaining({ id: 97274, expansion: 'TLA' }));
  expect(fetch).toHaveBeenCalledWith(CARDS_CSV_URL, expect.anything());
  expect(log).toHaveBeenCalledWith(expect.stringMatching(/403.*committed lookup subset/));
  expect(existsSync(cachePath)).toBe(false);
});

it('keeps --no-17lands network-free', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  expect((await loadCardsCsv(cachePath, { ...options, no17Lands: true })).length).toBeGreaterThan(1000);
  expect(fetch).not.toHaveBeenCalled();
});

it('builds real card grades and saves the daily ratings snapshot on a cold-cache 403', async () => {
  const f = fixtures();
  vi.spyOn(scryfall, 'loadSets').mockResolvedValue(f.scrySets);
  vi.spyOn(scryfall, 'bulkFile').mockImplementation(async (type) =>
    join(FIX, 'scryfall', type === 'default_cards' ? 'cards.jsonl.gz' : 'oracle-tags.jsonl.gz'));
  vi.spyOn(scryfall, 'loadCards').mockResolvedValue(f.cards);
  vi.spyOn(scryfall, 'loadKeywordCatalog').mockResolvedValue(f.keywords);
  const lastGoodUrl = 'https://example.test/';
  const fetch = vi.fn(async (url: string) => {
    if (url === CARDS_CSV_URL) return new Response(null, { status: 403 });
    if (url === 'https://whatsinstandard.com/api/v6/standard.json') return Response.json(f.wis);
    if (url === FILTERS_URL) return Response.json({ ...f.filters, live_formats_by_expansion: { TLA: ['PremierDraft'] } });
    if (url === cardDataUrl('TLA', 'PremierDraft')) return Response.json(f.tla);
    if (url === lastGoodUrl + 'data/manifest.json') return new Response(null, { status: 404 });
    throw new Error(`Unexpected URL: ${url}`);
  });
  vi.stubGlobal('fetch', fetch);

  const today = '2026-10-06';
  const dataBranch = join(dir, 'data-branch');
  const outDir = join(dir, 'public/data');
  const result = await runBuild({
    root: ROOT, cacheDir: join(dir, 'cache'), outDir, dataBranch, today, lastGoodUrl,
    offline: false, fetch17: true, dryRun: false, quiet: true,
  });
  expect(fetch.mock.calls.map(([url]) => url)).toContain(CARDS_CSV_URL);
  expect(result.exitCode).toBe(0);
  expect(result.manifest?.synthetic).toBe(false);
  expect(result.manifest?.sets).toContainEqual(expect.objectContaining({ code: 'TLA', cards: 295 }));
  expect(existsSync(join(outDir, 'manifest.json'))).toBe(true);
  expect(existsSync(snapshotPath({ root: dataBranch }, 'TLA', 'PremierDraft', today))).toBe(true);
});

it('reports other upstream failures and preserves the cache if a download fails validation', async () => {
  writeFileSync(cachePath, cachedCsv);
  utimesSync(cachePath, new Date(0), new Date(0));
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 500 }))
    .mockResolvedValueOnce(new Response('id,expansion,name\n1,TLA,Incomplete\n')));
  await expect(loadCardsCsv(cachePath, options)).rejects.toThrow('HTTP 500');
  await expect(loadCardsCsv(cachePath, options)).rejects.toThrow('truncated');
  expect(readFileSync(cachePath, 'utf8')).toBe(cachedCsv);
});
