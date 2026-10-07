import type { LoupeDB } from '../lib/db.ts';
import type { Facet } from '../lib/facets.ts';
import { seInSteps } from '../lib/grades.ts';
import { computeInsights, drillProgress, type FirstLook, type Insight, type InsightResult, type Model } from '../lib/insights.ts';
import type { Drill, Evaluation } from '../lib/types.ts';
import type { Analytics } from './analyticsService.ts';
import type { Engine } from './engine.ts';

export interface DrillView extends Drill {
  /** Shrunken facet effect on first looks made since the drill started. */
  progress: { n: number; effect: number; se: number } | null;
}

export interface InsightsView {
  insights: Insight[];
  firstLooks: number;
  needed: number;
  calibration: { slope: number; intercept: number; tau: number } | null;
  /** How fast older first looks lose weight (see lib/decay.ts). */
  memory: InsightResult['memory'];
  drills: DrillView[];
}

/** A drill ends when the last 8 drill cards are mostly within one step and unbiased, or after its target count. */
export const MASTERY = { window: 8, withinOne: 7, maxBias: 0.5 };
export const DRILL_CARDS = 20;

export class InsightService {
  private poolFacetCache: { n: number; map: Map<string, string[]> } | null = null;
  private last: { result: InsightResult; looks: FirstLook[] } | null = null;
  private sinceUpdate = 0;
  private running: Promise<InsightsView> | null = null;

  constructor(
    private engine: Engine,
    private analytics: Analytics,
    private db: LoupeDB,
  ) {}

  /** Pool keys in each facet (whole pool), for drills and the scheduler's weak-facet share. */
  async poolFacetKeys(facets: Facet[]): Promise<Map<string, string[]>> {
    await this.engine.loadAll();
    if (this.poolFacetCache && this.poolFacetCache.n === this.engine.pool.entries.length) return this.poolFacetCache.map;
    const map = new Map<string, string[]>();
    for (const f of facets) {
      const r = await this.engine.queryPool(f.query);
      if (r.keys) map.set(f.id, r.keys);
    }
    this.poolFacetCache = { n: this.engine.pool.entries.length, map };
    return map;
  }

  async firstLooks(facets: Facet[]): Promise<FirstLook[]> {
    const [evals, snaps] = await Promise.all([this.db.evaluations.filter((e) => e.firstLook).toArray(), this.db.cards.toArray()]);
    const members = await this.analytics.facetMembership(snaps, facets);
    const snapById = new Map(snaps.map((s) => [s.id, s] as const));
    return evals.map((e: Evaluation) => {
      const p = snapById.get(e.printingId)?.printing;
      return {
        key: e.key,
        printingId: e.printingId,
        user: e.user,
        actual: this.analytics.latest(e.key) ?? e.actual,
        se: seInSteps(e.gihWr, e.gih, e.sd),
        facets: facets.filter((f) => members.get(f.id)?.has(e.printingId)).map((f) => f.id),
        rtMs: e.rtMs,
        seq: e.seq,
        ts: e.ts,
        name: p ? (p.card_faces?.[0]?.printed_name ?? p.printed_name ?? p.card_faces?.[0]?.name ?? p.name) : undefined,
      };
    });
  }

  async compute(): Promise<InsightsView> {
    if (this.running) return this.running;
    this.running = (async () => {
      const facets = await this.analytics.facetList();
      const keysByFacet = await this.poolFacetKeys(facets);
      const total = Math.max(1, this.engine.pool.entries.length);
      const share = new Map(facets.map((f) => [f.id, (keysByFacet.get(f.id)?.length ?? 0) / total] as const));
      const looks = await this.firstLooks(facets);
      const result = computeInsights(looks, facets, share);
      this.last = { result, looks };
      this.sinceUpdate = 0;
      this.engine.weak = result.weak.slice(0, 4).map((w) => ({ id: w.facetId, weight: Math.abs(w.effect), keys: new Set(keysByFacet.get(w.facetId) ?? []) }));
      const drills = await this.db.drills.orderBy('startedAt').reverse().limit(6).toArray();
      return {
        insights: result.insights,
        firstLooks: result.firstLooks,
        needed: result.needed,
        calibration: result.model ? { slope: result.model.slope, intercept: result.model.intercept, tau: result.model.tau } : null,
        memory: result.memory,
        drills: drills.map((d) => ({ ...d, progress: result.model ? drillProgress(result.model as Model, looks, d.facetId, d.startedAt) : null })),
      };
    })();
    try {
      return await this.running;
    } finally {
      this.running = null;
    }
  }

  /** Called after each evaluation; refreshes weak-facet targeting every 25 evaluations. */
  noteEvaluation(): void {
    this.sinceUpdate++;
    if (this.sinceUpdate >= 25) void this.compute();
  }

  async startDrill(facetId: string): Promise<{ drill: Drill; keys: string[] } | null> {
    const facets = await this.analytics.facetList();
    const f = facets.find((x) => x.id === facetId);
    if (!f) return null;
    const keys = (await this.poolFacetKeys(facets)).get(f.id) ?? [];
    if (keys.length === 0) return null;
    if (!this.last) await this.compute();
    const eff = this.last?.result.model?.effects.find((e) => e.facetId === f.id);
    const drill: Drill = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      facetId: f.id,
      label: f.label,
      query: f.query,
      startedAt: Date.now(),
      endedAt: null,
      target: DRILL_CARDS,
      done: 0,
      preEffect: eff?.effect ?? 0,
      preSe: eff?.se ?? 0,
      sessionId: '',
      mastered: false,
    };
    await this.db.drills.put(drill);
    return { drill, keys };
  }

  /** Records a drill card; returns whether the drill is finished (mastered or at its target). */
  async drillStep(drillId: string): Promise<{ finished: boolean; mastered: boolean }> {
    const d = await this.db.drills.get(drillId);
    if (!d) return { finished: false, mastered: false };
    const evals = (await this.db.evaluations.where('drillId').equals(drillId).sortBy('ts')).slice(-MASTERY.window);
    const errs = evals.map((e) => e.user - e.actual);
    const mastered = errs.length >= MASTERY.window && errs.filter((x) => Math.abs(x) <= 1).length >= MASTERY.withinOne && Math.abs(errs.reduce((a, b) => a + b, 0) / errs.length) <= MASTERY.maxBias;
    const done = d.done + 1;
    const finished = mastered || done >= d.target;
    await this.db.drills.put({ ...d, done, mastered: d.mastered || mastered, endedAt: finished ? Date.now() : null });
    return { finished, mastered };
  }

  /** The single recommended next drill: the top card-facet insight. */
  async recommendation(): Promise<{ facetId: string; label: string; query: string; headline: string } | null> {
    const view = this.last ? null : await this.compute();
    const insights = view?.insights ?? this.last?.result.insights ?? [];
    const top = insights.find((i) => i.kind === 'facet' && i.facet);
    return top?.facet ? { facetId: top.facet.id, label: top.facet.label, query: top.facet.query, headline: top.headline } : null;
  }
}
