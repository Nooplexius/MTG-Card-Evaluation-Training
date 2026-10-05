/// <reference lib="webworker" />
import { db, exportBackup, importBackup } from '../lib/db.ts';
import type { CardSnapshot, Evaluation, Exposure, Session, Skip } from '../lib/types.ts';
import { Analytics, type HistoryParams, type StatsParams } from './analyticsService.ts';
import { Engine, type PlanRequest } from './engine.ts';
import { InsightService } from './insightService.ts';
import { serve } from './rpc.ts';

const fetchJson = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
};

const engine = new Engine(db(), fetchJson);
const analytics = new Analytics(engine, db());
const insights = new InsightService(engine, analytics, db());
let ready: Promise<unknown> | null = null;

const api = {
  async init(base: string, firstSet?: string) {
    ready ??= engine.init(base);
    const manifest = await ready;
    void engine.loadAll(firstSet);
    return manifest;
  },
  async ensureSet(code: string) {
    await engine.loadSet(code);
    return true;
  },
  async waitAll() {
    await engine.loadAll();
    return engine.pool.entries.length;
  },
  plan(req: PlanRequest) {
    return engine.plan(req);
  },
  view(key: string) {
    return engine.view(key);
  },
  async viewWhenReady(key: string) {
    const set = key.split(':')[0];
    await engine.loadSet(set);
    return engine.view(key);
  },
  contrasts(key: string, n: number, avoid: string[]) {
    return engine.contrasts(key, n, avoid);
  },
  isExposed(oracleId: string) {
    return engine.isExposed(oracleId);
  },
  async expose(oracleIds: string[], via: Exposure['via']) {
    await engine.expose(oracleIds, via);
    return true;
  },
  /** Stores an evaluation; a first look is the first graded evaluation of an oracle card whose grade was never shown. */
  async saveEvaluation(ev: Evaluation, snapshot: CardSnapshot) {
    const firstLook = !engine.isExposed(ev.oracleId);
    const record: Evaluation = { ...ev, firstLook };
    const d = db();
    const id = await d.transaction('rw', d.evaluations, d.cards, async () => {
      await d.cards.put(snapshot);
      return d.evaluations.add(record);
    });
    await engine.record(record);
    insights.noteEvaluation();
    const drill = ev.drillId ? await insights.drillStep(ev.drillId) : null;
    return { id, firstLook, drill };
  },
  async skip(s: Skip) {
    await db().skips.add(s);
    engine.requeue(s.key);
    return true;
  },
  async getOpenSession(): Promise<Session | null> {
    const last = await db().sessions.orderBy('startedAt').last();
    return last && last.endedAt === null ? last : null;
  },
  async saveSession(s: Session) {
    await db().sessions.put(s);
    return true;
  },
  async recentEvaluations(limit: number) {
    return db().evaluations.orderBy('ts').reverse().limit(limit).toArray();
  },
  async sessionEvaluations(sessionId: string) {
    return db().evaluations.where('sessionId').equals(sessionId).sortBy('ts');
  },
  async evaluationCount() {
    return db().evaluations.count();
  },
  /** Mean error over the five previous sessions, for the session summary's "change vs recent". */
  async summaryExtras(sessionId: string) {
    const sessions = (await db().sessions.orderBy('startedAt').reverse().limit(12).toArray()).filter((s) => s.id !== sessionId && s.done > 0).slice(0, 5);
    let sum = 0;
    let n = 0;
    for (const s of sessions) {
      const es = await db().evaluations.where('sessionId').equals(s.id).toArray();
      for (const e of es) {
        sum += Math.abs(e.user - e.actual);
        n++;
      }
    }
    return { recentMae: n >= 10 ? sum / n : null, drill: await insights.recommendation() };
  },
  async exportBackup() {
    return exportBackup();
  },
  async importBackup(b: unknown) {
    const r = await importBackup(b);
    await engine.reloadState();
    return r;
  },
  async persist() {
    return typeof navigator.storage?.persist === 'function' ? navigator.storage.persist() : false;
  },
  async practiceQuery(q: string) {
    return engine.setPracticeQuery(q, (p) => server.emit('query-progress', p));
  },
  async countQuery(q: string) {
    const r = await engine.queryPool(q, (p) => server.emit('query-progress', p));
    return { ...r, matches: null, keys: null };
  },
  async queryKeys(q: string) {
    const r = await engine.queryPool(q, (p) => server.emit('query-progress', p));
    return { error: r.error, needsConnection: r.needsConnection, keys: r.keys };
  },
  async stats(p: StatsParams) {
    await engine.loadAll();
    return analytics.stats(p);
  },
  async history(p: HistoryParams) {
    await engine.loadAll();
    return analytics.history(p);
  },
  async historyCount(q: string) {
    const r = await analytics.filtered({ query: q, days: 0, mode: 'all' });
    return { count: r.error || r.needsConnection ? null : r.evals.length, error: r.error, warnings: r.warnings, needsConnection: r.needsConnection };
  },
  async snapshotView(printingId: string, key: string) {
    await engine.loadAll();
    const live = engine.view(key);
    if (live) return { view: live, snapshot: null };
    return { view: null, snapshot: (await analytics.snapshot(printingId)) ?? null };
  },
  async insights() {
    await engine.loadAll();
    return insights.compute();
  },
  async startDrill(facetId: string) {
    return insights.startDrill(facetId);
  },
  async streakInfo() {
    const { streaks } = await import('../lib/analytics.ts');
    return streaks(await db().evaluations.toArray());
  },
  async todayCount() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return db().evaluations.where('ts').aboveOrEqual(d.getTime()).count();
  },
  async savedFilters() {
    return db().filters.orderBy('name').toArray();
  },
  async saveFilter(name: string, query: string) {
    const existing = await db().filters.where('name').equals(name).first();
    await db().filters.put({ ...(existing ?? {}), name, query, createdAt: existing?.createdAt ?? Date.now() });
    return true;
  },
  async deleteFilter(id: number) {
    await db().filters.delete(id);
    return true;
  },
};

export type EngineApi = typeof api;

const server = serve(api as never, self as unknown as DedicatedWorkerGlobalScope);
engine.on((p) => server.emit('progress', p));
