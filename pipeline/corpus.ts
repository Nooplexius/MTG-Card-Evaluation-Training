import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { Printing } from '../src/lib/card.ts';
import { allIgnored, apiSearchQuery, apiTermsOf, compile, evaluate, type ApiResult } from '../src/lib/query/engine.ts';
import { DISPLAY_KEYS, type LocalContext, type Subject } from '../src/lib/query/local.ts';
import { parseQuery, serialize, type Node, type TermNode } from '../src/lib/query/parse.ts';
import { RateLimitedError, ScryfallClient, type SearchOutcome } from '../src/lib/query/scryfall.ts';

export interface PoolFixtureEntry {
  lset: string;
  crowd: 'over' | 'under' | null;
  tags: string[];
  p: Printing;
}

export interface CorpusEntry {
  q: string;
  /** Pool printing ids Scryfall returns for the query (app-only terms applied locally). */
  expected: string[] | null;
  /** Our parser's error, when the query is malformed. */
  error: string | null;
  scryfallStatus: number;
  scryfallDetails: string | null;
  scryfallWarnings: string[];
}

export interface Corpus {
  recordedAt: string;
  setCodes: string[];
  entries: CorpusEntry[];
  /** Exact Scryfall search string → outcome, for every subtree the engine sends. */
  api: Record<string, SearchOutcome>;
}

const APP_KEYS = new Set(['lset', 'crowd']);

export function readGzJson<T>(path: string): T {
  return JSON.parse(gunzipSync(readFileSync(path)).toString('utf8')) as T;
}

interface StoredCorpus extends Omit<Corpus, 'entries' | 'api'> {
  poolIds: string[];
  entries: Array<Omit<CorpusEntry, 'expected'> & { expected: number[] | null }>;
  api: Record<string, Omit<SearchOutcome, 'ids'> & { ids: number[] }>;
}

/** Stores printing ids as indices into the pool's ids; printings outside the pool can't affect results and are dropped. */
export function writeCorpus(path: string, c: Corpus, poolIds: string[]): void {
  const ids = [...new Set(poolIds)].sort();
  const at = new Map(ids.map((id, i) => [id, i] as const));
  const pack = (xs: string[]) => xs.map((x) => at.get(x)).filter((x): x is number => x !== undefined).sort((a, b) => a - b);
  const stored: StoredCorpus = {
    recordedAt: c.recordedAt,
    setCodes: c.setCodes,
    poolIds: ids,
    entries: c.entries.map((e) => ({ ...e, expected: e.expected ? pack(e.expected) : null })),
    api: Object.fromEntries(Object.entries(c.api).map(([k, o]) => [k, { ...o, ids: pack(o.ids) }])),
  };
  writeFileSync(path, gzipSync(JSON.stringify(stored)));
}

export function readCorpus(path: string): Corpus {
  const s = readGzJson<StoredCorpus>(path);
  const un = (xs: number[]) => xs.map((i) => s.poolIds[i]);
  return {
    recordedAt: s.recordedAt,
    setCodes: s.setCodes,
    entries: s.entries.map((e) => ({ ...e, expected: e.expected ? un(e.expected).sort() : null })),
    api: Object.fromEntries(Object.entries(s.api).map(([k, o]) => [k, { ...o, ids: un(o.ids) }])),
  };
}

export function loadQueryFixtures(root: string) {
  const fix = join(root, 'tests/fixtures');
  const pool = readGzJson<PoolFixtureEntry[]>(join(fix, 'query/pool.json.gz'));
  const keywords = JSON.parse(readFileSync(join(fix, 'scryfall/keywords.json'), 'utf8')) as string[];
  const tags = gunzipSync(readFileSync(join(fix, 'scryfall/oracle-tags.jsonl.gz')))
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { slug: string; aliases: string[] });
  const tagAliases: Record<string, string> = {};
  for (const t of tags) for (const a of t.aliases) tagAliases[a] = t.slug;
  const ctx: LocalContext = { keywords: new Set(keywords), tagAliases };
  const subjects: Subject[] = pool.map((e) => ({ p: e.p, lset: e.lset, crowd: e.crowd, tags: new Set(e.tags) }));
  const setCodes = [...new Set(pool.map((e) => e.p.set))].sort();
  return { pool, subjects, ctx, setCodes };
}

/**
 * Splits a query into the part Scryfall understands and top-level app-only terms (lset:, crowd:).
 * Top-level display keywords (unique:, order:, …) are dropped: they never filter, and Scryfall rejects them inside parentheses.
 */
export function splitAppTerms(q: string): { scry: string; app: TermNode[] } {
  const { ast } = parseQuery(q);
  if (!ast) return { scry: q, app: [] };
  const top: Node[] = ast.kind === 'and' ? ast.children : [ast];
  const isKey = (n: Node, keys: Set<string>) => n.kind === 'term' && keys.has(n.key);
  const app = top.filter((n): n is TermNode => isKey(n, APP_KEYS));
  const rest = top.filter((n) => !isKey(n, APP_KEYS) && !isKey(n, DISPLAY_KEYS));
  const scry = rest.length === 0 ? '' : rest.length === 1 ? serialize(rest[0]) : serialize({ kind: 'and', children: rest });
  return { scry, app };
}

function appMatch(e: PoolFixtureEntry, app: TermNode[]): boolean {
  return app.every((t) => (t.key === 'lset' ? e.lset === t.value.toUpperCase() : e.crowd === t.value.toLowerCase()));
}

export function toApiResult(o: SearchOutcome | undefined, terms: TermNode[]): ApiResult | undefined {
  if (!o) return undefined;
  if (o.status >= 400) return { ids: new Set(), warnings: o.warnings, ignored: false, error: o.details ?? `HTTP ${o.status}` };
  return { ids: new Set(o.ids), warnings: o.warnings, ignored: allIgnored(terms, o.warnings) };
}

/** Evaluates a query on the fixture pool with the given Scryfall outcomes. */
export function localResult(q: string, fx: ReturnType<typeof loadQueryFixtures>, api: Record<string, SearchOutcome>): { ids: string[] | null; error: string | null; missing: string[] } {
  const c = compile(q, fx.ctx);
  if (c.error) return { ids: null, error: c.error, missing: [] };
  const map = new Map<string, ApiResult>();
  const missing: string[] = [];
  for (const text of c.api) {
    const key = apiSearchQuery(text, fx.setCodes);
    const r = toApiResult(api[key], apiTermsOf(c, text));
    if (!r) missing.push(key);
    else if (r.error) return { ids: null, error: r.error, missing: [] };
    else map.set(text, r);
  }
  if (missing.length > 0) return { ids: null, error: null, missing };
  const flags = evaluate(c, fx.subjects, map);
  const ids = new Set<string>();
  fx.subjects.forEach((s, i) => {
    if (flags[i]) ids.add(s.p.id);
  });
  return { ids: [...ids].sort(), error: null, missing: [] };
}

/** Disk cache so an interrupted recording resumes without repeating requests. */
function diskCache(path: string) {
  const store: Record<string, { k: string; ts: number; ids: string[]; warnings: string[] }> = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  return {
    get: async (k: string) => store[k],
    put: async (e: { k: string; ts: number; ids: string[]; warnings: string[] }) => {
      store[e.k] = e;
      writeFileSync(path, JSON.stringify(store));
    },
  };
}

/** Searches; after a 429 waits out Scryfall's 30-second lockout once, then continues. */
async function politeSearch(client: ScryfallClient, q: string): Promise<SearchOutcome> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.search(q);
    } catch (e) {
      if (!(e instanceof RateLimitedError) || attempt >= 2) throw e;
      console.log('\nScryfall rate limit hit; waiting 35 s before continuing.');
      await new Promise((r) => setTimeout(r, 35_000));
    }
  }
}

async function scryfallTruth(q: string, fx: ReturnType<typeof loadQueryFixtures>, client: ScryfallClient): Promise<{ entry: CorpusEntry; outcome: SearchOutcome | null; key: string | null }> {
  const { scry, app } = splitAppTerms(q);
  const c = compile(q, fx.ctx);
  const entry: CorpusEntry = { q, expected: null, error: c.error, scryfallStatus: 200, scryfallDetails: null, scryfallWarnings: [] };
  if (scry.trim() === '') {
    entry.expected = [...new Set(fx.pool.filter((e) => appMatch(e, app)).map((e) => e.p.id))].sort();
    return { entry, outcome: null, key: null };
  }
  const key = apiSearchQuery(scry, fx.setCodes);
  const outcome = await politeSearch(client, key);
  entry.scryfallStatus = outcome.status;
  entry.scryfallDetails = outcome.details ?? null;
  entry.scryfallWarnings = outcome.warnings;
  if (outcome.status < 400) {
    const hit = new Set(outcome.ids);
    entry.expected = [...new Set(fx.pool.filter((e) => hit.has(e.p.id) && appMatch(e, app)).map((e) => e.p.id))].sort();
  }
  return { entry, outcome, key };
}

function compare(entries: CorpusEntry[], fx: ReturnType<typeof loadQueryFixtures>, api: Record<string, SearchOutcome>): { ok: number; bad: string[] } {
  let ok = 0;
  const bad: string[] = [];
  const name = (id: string) => fx.pool.find((p) => p.p.id === id)?.p.name ?? id;
  for (const e of entries) {
    const r = localResult(e.q, fx, api);
    const scryErr = e.scryfallStatus >= 400 || e.error;
    if (scryErr || r.error) {
      if (scryErr && r.error) ok++;
      else bad.push(`${e.q}: local ${r.error ?? 'ok'} vs Scryfall ${e.scryfallStatus} ${e.scryfallDetails ?? ''}`);
      continue;
    }
    if (JSON.stringify(r.ids) === JSON.stringify(e.expected)) {
      ok++;
      continue;
    }
    const got = new Set(r.ids);
    const want = new Set(e.expected);
    const extra = [...got].filter((x) => !want.has(x));
    const miss = [...want].filter((x) => !got.has(x));
    bad.push(`${e.q}: +${extra.length} −${miss.length}  extra: ${extra.slice(0, 3).map(name).join(' | ')}  missing: ${miss.slice(0, 3).map(name).join(' | ')}`);
  }
  return { ok, bad };
}

export async function recordCorpus(opts: { root: string; cacheDir: string }): Promise<void> {
  const fx = loadQueryFixtures(opts.root);
  const queries = JSON.parse(readFileSync(join(opts.root, 'tests/fixtures/query/queries.json'), 'utf8')) as string[];
  mkdirSync(opts.cacheDir, { recursive: true });
  const client = new ScryfallClient({ fetch, headers: { 'User-Agent': 'Loupe/1.0 (differential test recorder)' }, minIntervalMs: 750, cache: diskCache(join(opts.cacheDir, 'corpus-api-cache.json')) });
  const api: Record<string, SearchOutcome> = {};
  const entries: CorpusEntry[] = [];
  let i = 0;
  for (const q of queries) {
    i++;
    const { entry, outcome, key } = await scryfallTruth(q, fx, client);
    if (outcome && key) api[key] = outcome;
    const c = compile(q, fx.ctx);
    for (const text of c.error ? [] : c.api) {
      const k = apiSearchQuery(text, fx.setCodes);
      if (!api[k]) api[k] = await politeSearch(client, k);
    }
    entries.push(entry);
    process.stdout.write(`\r${i}/${queries.length} ${q.slice(0, 50).padEnd(50)}`);
  }
  const corpus: Corpus = { recordedAt: new Date().toISOString(), setCodes: fx.setCodes, entries, api };
  writeCorpus(join(opts.root, 'tests/fixtures/query/corpus.json.gz'), corpus, fx.pool.map((e) => e.p.id));
  const { ok, bad } = compare(entries, fx, api);
  console.log(`\nRecorded ${entries.length} queries. Local engine agrees on ${ok}.`);
  for (const b of bad) console.log(`  ✗ ${b}`);
}

/** Re-runs the corpus against the live API and reports drift. Never fails unless strict. */
export async function corpusDrift(opts: { root: string; strict: boolean }): Promise<number> {
  const fx = loadQueryFixtures(opts.root);
  const corpus = readCorpus(join(opts.root, 'tests/fixtures/query/corpus.json.gz'));
  const client = new ScryfallClient({ fetch, headers: { 'User-Agent': 'Loupe/1.0 (differential drift check)' }, minIntervalMs: 750 });
  const live: Record<string, SearchOutcome> = {};
  const fresh: CorpusEntry[] = [];
  const drift: string[] = [];
  for (const e of corpus.entries) {
    const { entry, outcome, key } = await scryfallTruth(e.q, fx, client);
    if (outcome && key) live[key] = outcome;
    const c = compile(e.q, fx.ctx);
    for (const text of c.error ? [] : c.api) {
      const k = apiSearchQuery(text, fx.setCodes);
      if (!live[k]) live[k] = await politeSearch(client, k);
    }
    fresh.push(entry);
    if (JSON.stringify(entry.expected) !== JSON.stringify(e.expected)) drift.push(`${e.q}: Scryfall's results changed since ${corpus.recordedAt.slice(0, 10)}`);
  }
  const { bad } = compare(fresh, fx, live);
  drift.push(...bad.map((b) => `local engine differs from live Scryfall: ${b}`));
  console.log(drift.length === 0 ? `No drift across ${corpus.entries.length} queries.` : `Drift in ${drift.length} checks:\n${drift.map((d) => `  ${d}`).join('\n')}`);
  return opts.strict && drift.length > 0 ? 1 : 0;
}
