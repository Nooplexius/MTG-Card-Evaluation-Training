import type { TagsFile } from '../lib/data.ts';
import type { LoupeDB } from '../lib/db.ts';
import { apiTermsOf, compile, evaluate, type ApiResult, type Compiled } from '../lib/query/engine.ts';
import type { LocalContext, Subject } from '../lib/query/local.ts';
import { OfflineError, RateLimitedError, ScryfallClient, type Progress } from '../lib/query/scryfall.ts';

export interface QueryOutcome {
  query: string;
  /** Indexes of matching subjects; null when the query could not be evaluated. */
  matches: number[] | null;
  count: number | null;
  error: string | null;
  warnings: string[];
  /** Scryfall-only terms that could not be resolved offline. */
  needsConnection: boolean;
  rateLimited: boolean;
  usedApi: boolean;
}

export type QueryProgress = Progress & { step: number; steps: number };

export function contextFromTags(t: TagsFile | null): LocalContext {
  return { keywords: new Set(t?.keywords ?? []), tagAliases: t?.aliases ?? {} };
}

export class QueryService {
  client: ScryfallClient;

  constructor(db: LoupeDB | null, fetchImpl: typeof fetch) {
    this.client = new ScryfallClient({
      fetch: fetchImpl,
      cache: db
        ? {
            get: (k) => db.apiCache.get(k),
            put: async (e) => {
              await db.apiCache.put(e);
            },
          }
        : undefined,
    });
  }

  async run(query: string, subjects: Subject[], ctx: LocalContext, onProgress?: (p: QueryProgress) => void): Promise<QueryOutcome> {
    const c: Compiled = compile(query, ctx);
    const base: QueryOutcome = { query: c.query, matches: null, count: null, error: c.error, warnings: [...c.warnings], needsConnection: false, rateLimited: false, usedApi: c.api.length > 0 };
    if (c.error) return base;
    const codes = [...new Set(subjects.map((s) => s.p.set))];
    const api = new Map<string, ApiResult>();
    for (let i = 0; i < c.api.length; i++) {
      const text = c.api[i];
      try {
        const r = await this.client.resolve(text, apiTermsOf(c, text), codes, (p) => onProgress?.({ ...p, step: i + 1, steps: c.api.length }));
        if (r.error) return { ...base, error: r.error };
        for (const w of r.warnings) if (!base.warnings.includes(w)) base.warnings.push(w);
        api.set(text, r);
      } catch (e) {
        if (e instanceof OfflineError) return { ...base, needsConnection: true };
        if (e instanceof RateLimitedError) return { ...base, rateLimited: true, error: e.message };
        return { ...base, error: (e as Error).message };
      }
    }
    const flags = evaluate(c, subjects, api);
    const matches: number[] = [];
    for (let i = 0; i < flags.length; i++) if (flags[i]) matches.push(i);
    return { ...base, matches, count: matches.length };
  }
}
