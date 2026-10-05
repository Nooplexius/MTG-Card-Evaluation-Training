/// <reference lib="webworker" />
import { imageUrl } from '../lib/card.ts';
import type { Manifest } from '../lib/data.ts';
import { db, exportBackup, importBackup } from '../lib/db.ts';
import { streaks } from '../lib/analytics.ts';
import { COMPARE, nextLevel } from '../lib/compare.ts';
import type { CardSnapshot, CompareRecord, Evaluation, Exposure, Session, Skip } from '../lib/types.ts';
import { Analytics, type HistoryParams, type StatsParams } from './analyticsService.ts';
import { Engine, type PlanRequest } from './engine.ts';
import { InsightService } from './insightService.ts';
import { serve } from './rpc.ts';

/** Cache names shared with the service worker's runtime caching (vite.config.ts). */
const MANIFEST_CACHE = 'loupe-manifest';
const DATA_CACHE = 'loupe-data';
const isManifestFile = (url: string) => /\/data\/(manifest|status)\.json$/.test(new URL(url).pathname);

/**
 * The worker's own downloads fill the service worker's data caches, so offline use never needs a second download of
 * the set files. The manifest is always replaced; hashed data files are written once.
 */
async function keep(url: string, res: Response): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(isManifestFile(url) ? MANIFEST_CACHE : DATA_CACHE);
    if (isManifestFile(url) || !(await cache.match(url))) await cache.put(url, res);
  } catch {
    /* storage unavailable or full: the service worker caches on its own */
  }
}

const fetchJson = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  void keep(url, r.clone());
  return r.json();
};

/** Drops cached data files the current manifest no longer lists, and caches the status file for offline use. */
async function tidyDataCache(base: string, manifest: Manifest): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const current = new Set([manifest.tagsFile, ...manifest.sets.map((s) => s.file)].map((f) => new URL(`data/${f}`, base).href));
    const cache = await caches.open(DATA_CACHE);
    for (const req of await cache.keys()) if (!current.has(req.url)) await cache.delete(req);
    if (manifest.statusFile) await fetchJson(new URL(`data/${manifest.statusFile}`, base).href).catch(() => undefined);
  } catch {
    /* best effort */
  }
}

const engine = new Engine(db(), fetchJson);
const analytics = new Analytics(engine, db());
const insights = new InsightService(engine, analytics, db());
let ready: Promise<unknown> | null = null;
let markInitialized: () => void = () => {};
/** Resolves once init() has loaded the manifest, tags and scheduler state; every call that needs them waits for it. */
const initialized = new Promise<void>((r) => (markInitialized = r));
/** Planning waits for an offline switch in progress, so offline practice never picks an uncached card. */
let offlinePending: Promise<unknown> = Promise.resolve();

const api = {
  async init(base: string, firstSet?: string) {
    ready ??= engine.init(base);
    const manifest = (await ready) as Manifest;
    markInitialized();
    const rest = () => void engine.loadAll().then(() => tidyDataCache(base, manifest));
    if (firstSet) void engine.loadSet(firstSet).then(() => setTimeout(rest, 1200));
    else rest();
    return manifest;
  },
  async ensureSet(code: string) {
    await initialized;
    await engine.loadSet(code);
    return true;
  },
  async waitAll() {
    await initialized;
    await engine.loadAll();
    return engine.pool.entries.length;
  },
  async plan(req: PlanRequest) {
    await initialized;
    await offlinePending;
    return engine.plan(req);
  },
  async view(key: string) {
    await initialized;
    return engine.view(key);
  },
  async viewWhenReady(key: string) {
    await initialized;
    const set = key.split(':')[0];
    await engine.loadSet(set);
    return engine.view(key);
  },
  async contrasts(key: string, n: number, avoid: string[]) {
    await initialized;
    return engine.contrasts(key, n, avoid);
  },
  async isExposed(oracleId: string) {
    await initialized;
    return engine.isExposed(oracleId);
  },
  async expose(oracleIds: string[], via: Exposure['via']) {
    await initialized;
    await engine.expose(oracleIds, via);
    return true;
  },
  /** Stores an evaluation; a first look is the first graded evaluation of an oracle card whose grade was never shown. */
  async saveEvaluation(ev: Evaluation, snapshot: CardSnapshot) {
    await initialized;
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
    await initialized;
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
    await initialized;
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
    await initialized;
    const r = await importBackup(b);
    await engine.reloadState();
    return r;
  },
  async persist() {
    return typeof navigator.storage?.persist === 'function' ? navigator.storage.persist() : false;
  },
  async practiceQuery(q: string) {
    await initialized;
    return engine.setPracticeQuery(q, (p) => server.emit('query-progress', p));
  },
  async countQuery(q: string) {
    await initialized;
    const r = await engine.queryPool(q, (p) => server.emit('query-progress', p));
    return { ...r, matches: null, keys: null };
  },
  async queryKeys(q: string) {
    await initialized;
    const r = await engine.queryPool(q, (p) => server.emit('query-progress', p));
    return { error: r.error, needsConnection: r.needsConnection, keys: r.keys };
  },
  async stats(p: StatsParams) {
    await initialized;
    await engine.loadAll();
    return analytics.stats(p);
  },
  async history(p: HistoryParams) {
    await initialized;
    await engine.loadAll();
    return analytics.history(p);
  },
  async historyCount(q: string) {
    await initialized;
    const r = await analytics.filtered({ query: q, days: 0, mode: 'all' });
    return { count: r.error || r.needsConnection ? null : r.evals.length, error: r.error, warnings: r.warnings, needsConnection: r.needsConnection };
  },
  async snapshotView(printingId: string, key: string) {
    await initialized;
    await engine.loadAll();
    const live = engine.view(key);
    if (live) return { view: live, snapshot: null };
    return { view: null, snapshot: (await analytics.snapshot(printingId)) ?? null };
  },
  async insights() {
    await initialized;
    await engine.loadAll();
    return insights.compute();
  },
  async startDrill(facetId: string) {
    await initialized;
    return insights.startDrill(facetId);
  },
  async streakInfo() {
    return streaks(await db().evaluations.toArray());
  },
  /** Offline: restrict practice to pool cards whose display image is in the service worker's image cache. */
  async setOffline(offline: boolean) {
    if (!offline || typeof caches === 'undefined') {
      engine.offlineKeys = null;
      return { cards: null };
    }
    const job = (async () => {
      await initialized;
      await engine.loadAll();
      const ids = await cachedImageIds();
      engine.offlineKeys = new Set(engine.pool.entries.filter((e) => ids.has(e.card.p.id)).map((e) => e.key));
      return engine.offlineKeys.size;
    })();
    offlinePending = job;
    return { cards: await job };
  },
  /** Display-image URLs of cards likely to come up soon (unexposed or due) that aren't cached yet. */
  async prefetchUrls(n: number) {
    await initialized;
    await engine.loadAll();
    const ids = await cachedImageIds();
    const cands = engine.candidates().filter((c) => !engine.isExposed(c.oracleId));
    const out: string[] = [];
    for (let tries = 0; out.length < n && tries < n * 6 && cands.length > 0; tries++) {
      const c = cands[Math.floor(engine.rng() * cands.length)];
      const e = engine.pool.get(c.key);
      if (!e || ids.has(e.card.p.id)) continue;
      const url = imageUrl(e.card.p, 'display');
      if (!out.includes(url)) out.push(url);
    }
    return out;
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
  /** A compare-mode pair at the user's current level, avoiding the given pool keys. */
  async comparePair(avoid: string[]) {
    await initialized;
    await engine.loadAll();
    return engine.comparePair(nextLevel((await recentCompares(COMPARE.history)).map((c) => c.correct)), avoid);
  },
  /** Stores a compare pick; both cards' grades were shown, so both count as exposed. */
  async saveCompare(rec: CompareRecord) {
    await initialized;
    await db().compares.add(rec);
    await engine.expose([rec.leftOracle, rec.rightOracle], 'compare');
    return compareSummary();
  },
  async compareSummary() {
    return compareSummary();
  },
};

async function recentCompares(n: number): Promise<CompareRecord[]> {
  return (await db().compares.orderBy('ts').reverse().limit(n).toArray()).reverse();
}

async function compareSummary(): Promise<{ total: number; recentN: number; recentRight: number; level: number }> {
  const recent = await recentCompares(COMPARE.history);
  const last50 = recent.slice(-50);
  return { total: await db().compares.count(), recentN: last50.length, recentRight: last50.filter((c) => c.correct).length, level: nextLevel(recent.map((c) => c.correct)) };
}

export type EngineApi = typeof api;

async function cachedImageIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  if (typeof caches === 'undefined') return ids;
  const cache = await caches.open('loupe-card-images');
  for (const req of await cache.keys()) {
    const m = /\/display\/front\/[0-9a-f]\/[0-9a-f]\/([0-9a-f-]{36})\./.exec(req.url);
    if (m) ids.add(m[1]);
  }
  return ids;
}

const server = serve(api as never, self as unknown as DedicatedWorkerGlobalScope);
engine.on((p) => server.emit('progress', p));
