import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { isApiCardResponse, type ApiCardResponse } from '../exports/normalizeApi.ts';
import type { FetchLike } from './http.ts';

export const FILTERS_URL = 'https://www.17lands.com/data/filters';

export function cardDataUrl(expansion: string, format: string): string {
  return `https://www.17lands.com/api/card_data?expansion=${encodeURIComponent(expansion)}&event_type=${encodeURIComponent(format)}&time_period=ALL_TIME`;
}

export function cardDataPageUrl(expansion: string, format: string): string {
  return `https://www.17lands.com/card_data?expansion=${encodeURIComponent(expansion)}&format=${encodeURIComponent(format)}`;
}

export function exportLink(expansion: string, format: string): string {
  return `${cardDataPageUrl(expansion, format)}&view=table&columns=seen,picked,played,opening,drawn,everInHand,notSeen,improvement`;
}

export interface FiltersResponse {
  live_formats_by_expansion?: Record<string, string[]>;
  start_dates?: Record<string, string | null>;
  formats?: string[];
  [k: string]: unknown;
}

export interface FetchLogEntry {
  date: string;
  status: 'ok' | 'rate-limited' | 'error';
  httpStatus?: number;
  message?: string;
}

/** Persisted on the data branch so the pipeline makes at most one request per endpoint and set per UTC day. */
export interface FetchState {
  filters?: FetchLogEntry;
  /** Set when any request failed: no more 17Lands requests that UTC day. */
  haltedOn?: string;
  sets: Record<string, FetchLogEntry>;
}

export interface DataBranch {
  root: string;
}

export function readFetchState(db: DataBranch): FetchState {
  const p = join(db.root, 'fetch-state.json');
  if (!existsSync(p)) return { sets: {} };
  const s = JSON.parse(readFileSync(p, 'utf8')) as FetchState;
  return { ...s, sets: s.sets ?? {} };
}

export function writeFetchState(db: DataBranch, state: FetchState): void {
  mkdirSync(db.root, { recursive: true });
  writeFileSync(join(db.root, 'fetch-state.json'), `${JSON.stringify(state, null, 2)}\n`);
}

export interface SavedFilters {
  fetchedAt: string;
  date: string;
  response: FiltersResponse;
}

export function readLatestFilters(db: DataBranch): SavedFilters | null {
  const p = join(db.root, 'filters', 'latest.json');
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as SavedFilters) : null;
}

function writeFilters(db: DataBranch, saved: SavedFilters): void {
  const p = join(db.root, 'filters', 'latest.json');
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(saved)}\n`);
}

export interface SavedSnapshot {
  set: string;
  format: string;
  date: string;
  fetchedAt: string;
  url: string;
  response: ApiCardResponse;
}

export function snapshotPath(db: DataBranch, set: string, format: string, date: string): string {
  return join(db.root, 'snapshots', set, format, `${date}.json`);
}

export function listSnapshots(db: DataBranch): Array<{ path: string; rel: string; set: string; format: string; date: string }> {
  const base = join(db.root, 'snapshots');
  if (!existsSync(base)) return [];
  const out: Array<{ path: string; rel: string; set: string; format: string; date: string }> = [];
  for (const set of readdirSync(base)) {
    for (const format of existsSync(join(base, set)) ? readdirSync(join(base, set)) : []) {
      for (const f of readdirSync(join(base, set, format))) {
        const m = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(f);
        if (!m) continue;
        const path = join(base, set, format, f);
        out.push({ path, rel: relative(db.root, path), set, format, date: m[1] });
      }
    }
  }
  return out;
}

export interface FetchTarget {
  code: string;
  format: string;
  /** Embargo and live-time rules passed today. */
  eligible: boolean;
}

export interface DailyFetchOptions {
  enabled: boolean;
  today: string;
  targets: FetchTarget[];
  db: DataBranch;
  userAgent: string;
  fetch: FetchLike;
  now?: () => Date;
  log?: (msg: string) => void;
}

export interface DailyFetchResult {
  disabled: boolean;
  filters: FiltersResponse | null;
  filtersDate: string | null;
  /** Sets 17Lands currently lists as live in their configured format. */
  activeSets: string[];
  requested: Array<{ code: string; format: string; url: string; status: FetchLogEntry['status']; httpStatus?: number }>;
  failures: Array<{ code: string; message: string }>;
  halted: boolean;
  state: FetchState;
}

async function getOnce(url: string, opts: DailyFetchOptions): Promise<{ ok: true; json: unknown; status: number } | { ok: false; status?: number; message: string }> {
  try {
    const res = await opts.fetch(url, { headers: { 'User-Agent': opts.userAgent, Accept: 'application/json' } });
    if (res.status === 429) return { ok: false, status: 429, message: 'HTTP 429 Too Many Requests' };
    if (!res.ok) return { ok: false, status: res.status, message: `HTTP ${res.status}` };
    return { ok: true, json: await res.json(), status: res.status };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/**
 * Once per UTC day: read /data/filters, then fetch card_data for every pool set whose configured format is listed as
 * live and whose embargo has passed. Requests run one at a time; a 429 or any error stops all requests for the day.
 */
export async function dailyFetch(opts: DailyFetchOptions): Promise<DailyFetchResult> {
  const log = opts.log ?? (() => {});
  const now = opts.now ?? (() => new Date());
  const state = readFetchState(opts.db);
  const result: DailyFetchResult = { disabled: false, filters: null, filtersDate: null, activeSets: [], requested: [], failures: [], halted: false, state };
  const saved = readLatestFilters(opts.db);
  if (saved) {
    result.filters = saved.response;
    result.filtersDate = saved.date;
  }
  if (!opts.enabled) {
    result.disabled = true;
    result.activeSets = activeFrom(result.filters, opts.targets);
    return result;
  }
  if (state.haltedOn === opts.today) {
    result.halted = true;
    result.activeSets = activeFrom(result.filters, opts.targets);
    log(`17Lands requests halted for ${opts.today} after an earlier failure; keeping last good data.`);
    return result;
  }

  if (!(saved && saved.date === opts.today)) {
    const r = await getOnce(FILTERS_URL, opts);
    result.requested.push({ code: '(filters)', format: '', url: FILTERS_URL, status: r.ok ? 'ok' : r.status === 429 ? 'rate-limited' : 'error', httpStatus: r.ok ? r.status : r.status });
    if (!r.ok || typeof r.json !== 'object' || r.json === null) {
      const message = r.ok ? 'unexpected response' : r.message;
      state.filters = { date: opts.today, status: !r.ok && r.status === 429 ? 'rate-limited' : 'error', httpStatus: r.ok ? undefined : r.status, message };
      state.haltedOn = opts.today;
      result.halted = true;
      result.failures.push({ code: '(filters)', message });
      writeFetchState(opts.db, state);
      result.activeSets = activeFrom(result.filters, opts.targets);
      return result;
    }
    const response = r.json as FiltersResponse;
    writeFilters(opts.db, { fetchedAt: now().toISOString(), date: opts.today, response });
    state.filters = { date: opts.today, status: 'ok', httpStatus: r.status };
    result.filters = response;
    result.filtersDate = opts.today;
  }

  result.activeSets = activeFrom(result.filters, opts.targets);
  for (const t of opts.targets) {
    if (!result.activeSets.includes(t.code) || !t.eligible) continue;
    if (state.sets[t.code]?.date === opts.today) continue;
    if (existsSync(snapshotPath(opts.db, t.code, t.format, opts.today))) continue;
    const url = cardDataUrl(t.code, t.format);
    log(`GET ${url}`);
    const r = await getOnce(url, opts);
    if (r.ok && isApiCardResponse(r.json)) {
      const snap: SavedSnapshot = { set: t.code, format: t.format, date: opts.today, fetchedAt: now().toISOString(), url, response: r.json };
      const p = snapshotPath(opts.db, t.code, t.format, opts.today);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, `${JSON.stringify(snap)}\n`);
      state.sets[t.code] = { date: opts.today, status: 'ok', httpStatus: r.status };
      result.requested.push({ code: t.code, format: t.format, url, status: 'ok', httpStatus: r.status });
      continue;
    }
    const status: FetchLogEntry['status'] = !r.ok && r.status === 429 ? 'rate-limited' : 'error';
    const message = r.ok ? 'response has no data array' : r.message;
    state.sets[t.code] = { date: opts.today, status, httpStatus: r.ok ? undefined : r.status, message };
    state.haltedOn = opts.today;
    result.requested.push({ code: t.code, format: t.format, url, status, httpStatus: r.ok ? undefined : r.status });
    result.failures.push({ code: t.code, message });
    result.halted = true;
    break;
  }
  writeFetchState(opts.db, state);
  return result;
}

function activeFrom(filters: FiltersResponse | null, targets: FetchTarget[]): string[] {
  const live = filters?.live_formats_by_expansion ?? {};
  return targets.filter((t) => (live[t.code] ?? []).includes(t.format)).map((t) => t.code);
}

/** Arena release dates (UTC date part) from 17Lands start_dates. */
export function releaseDatesFrom(filters: FiltersResponse | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(filters?.start_dates ?? {})) if (typeof v === 'string' && v.length >= 10) out[k.toUpperCase()] = v.slice(0, 10);
  return out;
}
