import { calibrationBins, confusion, groupRow, headline, isHeadlineFirstLook, learningCurve, streaks, toPoints, type GroupRow, type Headline, type Point, type Streaks } from '../lib/analytics.ts';
import type { LoupeDB } from '../lib/db.ts';
import { baseFacets, customFacets, type Facet } from '../lib/facets.ts';
import type { CardSnapshot, Evaluation, Mode } from '../lib/types.ts';
import type { Engine } from './engine.ts';

export interface StatsParams {
  query: string;
  look: 'all' | 'first' | 'review';
  days: number;
  mode: 'all' | Mode;
  basis: 'latest' | 'snapshot';
}

export interface StatsResult {
  error: string | null;
  needsConnection: boolean;
  warnings: string[];
  total: number;
  headFirst: Headline;
  headFirstAll: Headline;
  headReview: Headline;
  curve: Array<{ i: number; ts: number; mae: number }>;
  calibration: Array<{ actual: number; n: number; meanUser: number | null }>;
  confusion: number[][];
  facets: Array<GroupRow & { group: string; query: string }>;
  sets: GroupRow[];
  streaks: Streaks;
  changed: number;
}

export interface HistoryRow {
  id: number;
  ts: number;
  key: string;
  name: string;
  lset: string;
  user: number;
  actual: number;
  snapshotActual: number;
  err: number;
  changed: boolean;
  firstLook: boolean;
  gihWr: number;
  printingId: string;
}

export type HistoryParams = StatsParams & { sort: 'recent' | 'worst' | 'over' | 'under'; limit: number };

export class Analytics {
  private facetCache: { n: number; sig: string; map: Map<string, Set<string>> } | null = null;

  constructor(
    private engine: Engine,
    private db: LoupeDB,
  ) {}

  latest = (key: string): number | undefined => this.engine.pool.get(key)?.card.g;

  async facetList(): Promise<Facet[]> {
    const sets = (this.engine.manifest?.sets ?? []).map((s) => ({ code: s.code, name: s.name, bonusSheets: s.bonusSheets }));
    const saved = await this.db.filters.toArray();
    return [...baseFacets(sets), ...customFacets(saved)];
  }

  /** Facet id → snapshot ids in the facet, evaluated on stored snapshots so rotated cards keep their facets. */
  async facetMembership(snaps: CardSnapshot[], facets: Facet[]): Promise<Map<string, Set<string>>> {
    const sig = facets.map((f) => f.query).join('|');
    if (this.facetCache && this.facetCache.n === snaps.length && this.facetCache.sig === sig) return this.facetCache.map;
    const map = new Map<string, Set<string>>();
    for (const f of facets) {
      const r = await this.engine.querySnapshots(f.query, snaps);
      if (r.ids) map.set(f.id, new Set(r.ids));
    }
    this.facetCache = { n: snaps.length, sig, map };
    return map;
  }

  async filtered(p: Pick<StatsParams, 'query' | 'days' | 'mode'>): Promise<{ evals: Evaluation[]; snaps: CardSnapshot[]; error: string | null; needsConnection: boolean; warnings: string[] }> {
    const [all, snaps] = await Promise.all([this.db.evaluations.toArray(), this.db.cards.toArray()]);
    const since = p.days > 0 ? Date.now() - p.days * 86_400_000 : 0;
    let evals = all.filter((e) => e.ts >= since && (p.mode === 'all' || e.mode === p.mode));
    let warnings: string[] = [];
    if (p.query.trim()) {
      const r = await this.engine.querySnapshots(p.query, snaps);
      warnings = r.warnings;
      if (!r.ids) return { evals: [], snaps, error: r.error, needsConnection: r.needsConnection, warnings };
      const ok = new Set(r.ids);
      evals = evals.filter((e) => ok.has(e.printingId));
    }
    return { evals, snaps, error: null, needsConnection: false, warnings };
  }

  async stats(p: StatsParams): Promise<StatsResult> {
    const { evals, snaps, error, needsConnection, warnings } = await this.filtered(p);
    const all = await this.db.evaluations.toArray();
    const points = toPoints(evals, this.latest, p.basis);
    const first = points.filter((x) => x.e.firstLook);
    const view: Point[] = p.look === 'first' ? first : p.look === 'review' ? points.filter((x) => !x.e.firstLook) : points;
    const facets = await this.facetList();
    const members = await this.facetMembership(snaps, facets);
    const facetRows = facets
      .map((f) => {
        const ids = members.get(f.id);
        return { ...groupRow(f.id, f.label, ids ? view.filter((x) => ids.has(x.e.printingId)) : []), group: f.group, query: f.query };
      })
      .filter((r) => r.n > 0);
    const bySet = new Map<string, Point[]>();
    for (const x of view) bySet.set(x.e.lset, [...(bySet.get(x.e.lset) ?? []), x]);
    const uniformFirst = points.filter((x) => isHeadlineFirstLook(x.e));
    return {
      error,
      needsConnection,
      warnings,
      total: points.length,
      headFirst: headline(uniformFirst),
      headFirstAll: headline(first),
      headReview: headline(points.filter((x) => !x.e.firstLook)),
      curve: learningCurve(uniformFirst),
      calibration: calibrationBins(view),
      confusion: confusion(view),
      facets: facetRows,
      sets: [...bySet.entries()].map(([k, v]) => groupRow(k, k, v)).sort((a, b) => a.id.localeCompare(b.id)),
      streaks: streaks(all),
      changed: points.filter((x) => x.changed).length,
    };
  }

  async history(p: HistoryParams): Promise<{ rows: HistoryRow[]; total: number; error: string | null; needsConnection: boolean; warnings: string[] }> {
    const { evals, snaps, error, needsConnection, warnings } = await this.filtered(p);
    const byId = new Map(snaps.map((s) => [s.id, s] as const));
    let points = toPoints(evals, this.latest, p.basis);
    if (p.look === 'first') points = points.filter((x) => x.e.firstLook);
    if (p.look === 'review') points = points.filter((x) => !x.e.firstLook);
    const sorted = [...points].sort((a, b) => {
      if (p.sort === 'worst') return Math.abs(b.err) - Math.abs(a.err) || b.e.ts - a.e.ts;
      if (p.sort === 'over') return b.err - a.err || b.e.ts - a.e.ts;
      if (p.sort === 'under') return a.err - b.err || b.e.ts - a.e.ts;
      return b.e.ts - a.e.ts;
    });
    const rows: HistoryRow[] = sorted.slice(0, p.limit).map((x) => {
      const pr = byId.get(x.e.printingId)?.printing;
      const name = pr ? (pr.card_faces?.[0]?.printed_name ?? pr.printed_name ?? pr.card_faces?.[0]?.name ?? pr.name) : x.e.key;
      return { id: x.e.id as number, ts: x.e.ts, key: x.e.key, name, lset: x.e.lset, user: x.e.user, actual: x.actual, snapshotActual: x.e.actual, err: x.err, changed: x.changed, firstLook: x.e.firstLook, gihWr: x.e.gihWr, printingId: x.e.printingId };
    });
    return { rows, total: points.length, error, needsConnection, warnings };
  }

  async snapshot(printingId: string): Promise<CardSnapshot | undefined> {
    return this.db.cards.get(printingId);
  }
}
