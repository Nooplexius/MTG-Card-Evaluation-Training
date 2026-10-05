import type { ApiCacheEntry } from '../types.ts';
import { allIgnored, apiSearchQuery, type ApiResult } from './engine.ts';
import type { TermNode } from './parse.ts';

export const SEARCH_URL = 'https://api.scryfall.com/cards/search';
/** /cards/search allows 2 requests per second; leave headroom for network jitter. */
export const MIN_INTERVAL_MS = 600;
export const CACHE_MS = 7 * 86_400_000;
const LOCKOUT_MS = 30_000;

export interface SearchOutcome {
  ids: string[];
  warnings: string[];
  status: number;
  details?: string;
}

export interface ApiCache {
  get(k: string): Promise<ApiCacheEntry | undefined>;
  put(e: ApiCacheEntry): Promise<void>;
}

export interface Progress {
  query: string;
  page: number;
  pages: number | null;
}

export class RateLimitedError extends Error {}
export class OfflineError extends Error {}

/** Sequential, rate-limited Scryfall search with paging and a cache. Never retries in a loop. */
export class ScryfallClient {
  private chain: Promise<unknown> = Promise.resolve();
  private last = -Infinity;
  private lockedUntil = 0;
  private mem = new Map<string, { at: number; out: SearchOutcome }>();

  constructor(private opts: { fetch: typeof fetch; headers?: Record<string, string>; cache?: ApiCache; now?: () => number; sleep?: (ms: number) => Promise<void>; minIntervalMs?: number }) {}

  private now() {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  private sleep(ms: number) {
    return this.opts.sleep ? this.opts.sleep(ms) : new Promise<void>((r) => setTimeout(r, ms));
  }

  async cached(q: string): Promise<SearchOutcome | null> {
    const m = this.mem.get(q);
    if (m && this.now() - m.at < CACHE_MS) return m.out;
    const c = await this.opts.cache?.get(q);
    if (c && this.now() - c.ts < CACHE_MS) {
      const out = { ids: c.ids, warnings: c.warnings, status: 200 };
      this.mem.set(q, { at: c.ts, out });
      return out;
    }
    return null;
  }

  search(q: string, onProgress?: (p: Progress) => void): Promise<SearchOutcome> {
    const run = async (): Promise<SearchOutcome> => {
      const hit = await this.cached(q);
      if (hit) return hit;
      const out: SearchOutcome = { ids: [], warnings: [], status: 200 };
      let url: string | null = `${SEARCH_URL}?${new URLSearchParams({ q, unique: 'prints' }).toString()}`;
      let page = 0;
      let pages: number | null = null;
      while (url) {
        if (this.now() < this.lockedUntil) throw new RateLimitedError('Scryfall asked us to slow down. Try this search again in about 30 seconds.');
        const wait = (this.opts.minIntervalMs ?? MIN_INTERVAL_MS) - (this.now() - this.last);
        if (wait > 0) await this.sleep(wait);
        this.last = this.now();
        page++;
        onProgress?.({ query: q, page, pages });
        let res: Response;
        try {
          res = await this.opts.fetch(url, { headers: { Accept: 'application/json', ...(this.opts.headers ?? {}) } });
        } catch (e) {
          throw new OfflineError(`Needs a connection to Scryfall (${(e as Error).message})`);
        }
        if (res.status === 429) {
          this.lockedUntil = this.now() + LOCKOUT_MS;
          throw new RateLimitedError('Scryfall asked us to slow down. Try this search again in about 30 seconds.');
        }
        const body = (await res.json().catch(() => ({}))) as { data?: Array<{ id: string }>; has_more?: boolean; next_page?: string; total_cards?: number; warnings?: string[]; details?: string };
        for (const w of body.warnings ?? []) if (!out.warnings.includes(w)) out.warnings.push(w);
        if (res.status === 404) break;
        if (!res.ok) {
          out.status = res.status;
          out.details = body.details ?? `HTTP ${res.status}`;
          return out;
        }
        for (const c of body.data ?? []) out.ids.push(c.id);
        if (typeof body.total_cards === 'number') pages = Math.ceil(body.total_cards / 175);
        url = body.has_more && body.next_page ? body.next_page : null;
      }
      this.mem.set(q, { at: this.now(), out });
      await this.opts.cache?.put({ k: q, ts: this.now(), ids: out.ids, warnings: out.warnings });
      return out;
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => {});
    return p;
  }

  /** Resolves one API-only subtree restricted to the given Scryfall set codes. */
  async resolve(subtree: string, subtreeTerms: TermNode[], setCodes: string[], onProgress?: (p: Progress) => void): Promise<ApiResult> {
    const out = await this.search(apiSearchQuery(subtree, setCodes), onProgress);
    if (out.status >= 400) return { ids: new Set(), warnings: out.warnings, ignored: false, error: out.details };
    return { ids: new Set(out.ids), warnings: out.warnings, ignored: allIgnored(subtreeTerms, out.warnings) };
  }
}
