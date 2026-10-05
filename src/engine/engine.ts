import type { Manifest, ManifestSet, SetFile, TagsFile } from '../lib/data.ts';
import type { LoupeDB } from '../lib/db.ts';
import { Pool, type PoolEntry } from '../lib/pool.ts';
import { seededRng, type Rng } from '../lib/random.ts';
import { pickAdaptive, ShuffleBag, updateAfter, SCHED, type Candidate, type Pick, type WeakFacet } from '../lib/scheduler.ts';
import { colorGroupFor, midRankPercentiles } from '../lib/setstats.ts';
import type { CardSnapshot, Evaluation, Exposure, Mode, SchedItem } from '../lib/types.ts';
import type { CardView, Selection } from '../lib/view.ts';
import type { Subject } from '../lib/query/local.ts';
import { contextFromTags, QueryService, type QueryOutcome, type QueryProgress } from './queryService.ts';

export type FetchJson = (url: string) => Promise<unknown>;

export interface EngineEvents {
  progress: (p: { loaded: number; total: number; cards: number }) => void;
}

export interface PlanRequest {
  mode: Mode;
  n: number;
  exclude: string[];
  /** Keys a drill is restricted to. */
  drillKeys?: string[];
}

/** Pool, scheduler and exposure state. Runs in a worker; also runs in Node for tests and simulations. */
export class Engine {
  pool = new Pool();
  manifest: Manifest | null = null;
  tags: TagsFile | null = null;
  sched = new Map<string, SchedItem>();
  exposed = new Set<string>();
  trial = 0;
  recent: Candidate[] = [];
  bag = new ShuffleBag();
  rng: Rng;
  filterKeys: string[] | null = null;
  /** When offline: pool keys whose display image is cached; practice draws only from these. */
  offlineKeys: Set<string> | null = null;
  weak: WeakFacet[] = [];
  rtRef = SCHED.rtRefMs;
  query: QueryService;
  practiceQuery = '';
  private base = '';
  private loading = new Map<string, Promise<PoolEntry[]>>();
  private percentiles = new Map<string, Map<string, { draft: number | null; perf: number }>>();
  private onProgress: EngineEvents['progress'] | null = null;
  private subjectCache: { n: number; subjects: Subject[] } | null = null;

  constructor(
    private db: LoupeDB | null,
    private fetchJson: FetchJson,
    seed: number = Date.now(),
    fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {
    this.rng = seededRng(seed);
    this.query = new QueryService(db, fetchImpl);
  }

  /** Query subjects for the pool: each entry's display printing plus its limited set, crowd class and tags. */
  poolSubjects(): Subject[] {
    if (this.subjectCache && this.subjectCache.n === this.pool.entries.length) return this.subjectCache.subjects;
    const subjects = this.pool.entries.map((e) => ({ p: e.card.p, lset: e.set, crowd: e.card.c, tags: new Set(e.tags) }));
    this.subjectCache = { n: this.pool.entries.length, subjects };
    return subjects;
  }

  /** Evaluates a query over the pool without changing the practice filter. */
  async queryPool(q: string, onProgress?: (p: QueryProgress) => void): Promise<QueryOutcome & { keys: string[] | null }> {
    await this.loadAll();
    const out = await this.query.run(q, this.poolSubjects(), contextFromTags(this.tags), onProgress);
    return { ...out, keys: out.matches ? out.matches.map((i) => this.pool.entries[i].key) : null };
  }

  /** Sets the practice filter; on an error or a missing connection the last valid pool stays active. */
  async setPracticeQuery(q: string, onProgress?: (p: QueryProgress) => void): Promise<QueryOutcome> {
    if (q.trim() === '') {
      this.practiceQuery = '';
      this.filterKeys = null;
      const count = (this.manifest?.sets ?? []).reduce((n, s) => n + s.cards, 0);
      return { query: '', matches: null, count, error: null, warnings: [], needsConnection: false, rateLimited: false, usedApi: false };
    }
    const { keys, ...rest } = await this.queryPool(q, onProgress);
    if (keys && !rest.error) {
      this.practiceQuery = rest.query;
      this.filterKeys = rest.query === '' ? null : keys;
    }
    return { ...rest, matches: null };
  }

  /** Query over stored card snapshots (history and stats); returns matching snapshot ids. */
  async querySnapshots(q: string, snaps: CardSnapshot[], onProgress?: (p: QueryProgress) => void): Promise<QueryOutcome & { ids: string[] | null }> {
    const subjects: Subject[] = snaps.map((s) => ({ p: s.printing, lset: s.lset, crowd: s.crowd, tags: new Set(s.tags) }));
    const out = await this.query.run(q, subjects, contextFromTags(this.tags), onProgress);
    return { ...out, matches: null, ids: out.matches ? out.matches.map((i) => snaps[i].id) : null };
  }

  on(cb: EngineEvents['progress']) {
    this.onProgress = cb;
  }

  async init(base: string): Promise<Manifest> {
    this.base = base.endsWith('/') ? base : `${base}/`;
    const manifest = (await this.fetchJson(`${this.base}data/manifest.json`)) as Manifest;
    this.manifest = manifest;
    const tagsP = this.fetchJson(`${this.base}data/${manifest.tagsFile}`).then((t) => {
      this.tags = t as TagsFile;
      this.pool.setTags(this.tags);
    });
    if (this.db) await this.loadState();
    await tagsP;
    return manifest;
  }

  async reloadState() {
    this.sched.clear();
    this.exposed.clear();
    this.recent = [];
    if (this.db) await this.loadState();
  }

  private async loadState() {
    const d = this.db as LoupeDB;
    const [items, exposures, count, last] = await Promise.all([d.sched.toArray(), d.exposures.toArray(), d.evaluations.count(), d.evaluations.orderBy('ts').reverse().limit(60).toArray()]);
    for (const it of items) this.sched.set(it.key, it);
    for (const e of exposures) this.exposed.add(e.oracleId);
    this.trial = count;
    const rts = last.map((e) => e.rtMs).filter((x) => x > 0).sort((a, b) => a - b);
    if (rts.length >= 10) this.rtRef = rts[Math.floor(rts.length / 2)];
  }

  /** Loads every set file, at most three at a time; the given set first. */
  async loadAll(first?: string): Promise<void> {
    const sets = [...(this.manifest?.sets ?? [])];
    if (first) sets.sort((a, b) => (a.code === first ? -1 : b.code === first ? 1 : 0));
    let i = 0;
    const worker = async () => {
      while (i < sets.length) {
        const s = sets[i++];
        await this.loadSet(s.code);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  }

  loadSet(code: string): Promise<PoolEntry[]> {
    const existing = this.loading.get(code);
    if (existing) return existing;
    const meta = this.manifest?.sets.find((s) => s.code === code);
    if (!meta) return Promise.resolve([]);
    const p = this.fetchJson(`${this.base}data/${meta.file}`).then((f) => {
      const entries = this.pool.addSet(f as SetFile, meta);
      this.onProgress?.({ loaded: this.pool.files.size, total: this.manifest?.sets.length ?? 0, cards: this.pool.entries.length });
      return entries;
    });
    this.loading.set(code, p);
    return p;
  }

  get allLoaded(): boolean {
    return (this.manifest?.sets.length ?? 0) === this.pool.files.size;
  }

  setFilterKeys(keys: string[] | null) {
    this.filterKeys = keys;
  }

  candidates(restrict?: string[]): Candidate[] {
    const keys = restrict ?? this.filterKeys;
    let entries = keys ? keys.map((k) => this.pool.get(k)).filter((e): e is PoolEntry => !!e) : this.pool.entries;
    if (this.offlineKeys) {
      const off = this.offlineKeys;
      entries = entries.filter((e) => off.has(e.key));
    }
    return entries.map((e) => ({ key: e.key, oracleId: e.card.o, set: e.set, band: e.band, colorKey: e.colorKey }));
  }

  private pct(set: string, key: string): { draft: number | null; perf: number } {
    let m = this.percentiles.get(set);
    if (!m) {
      const entries = this.pool.bySet.get(set) ?? [];
      const perf = midRankPercentiles(entries.map((e) => e.card.s.gihWr));
      const withAlsa = entries.filter((e) => typeof e.card.s.alsa === 'number');
      const draft = midRankPercentiles(withAlsa.map((e) => -(e.card.s.alsa as number)));
      const perfSub = midRankPercentiles(withAlsa.map((e) => e.card.s.gihWr));
      m = new Map();
      entries.forEach((e, i) => m?.set(e.key, { draft: null, perf: perf[i] }));
      withAlsa.forEach((e, i) => m?.set(e.key, { draft: draft[i], perf: perfSub[i] }));
      this.percentiles.set(set, m);
    }
    return m.get(key) ?? { draft: null, perf: 50 };
  }

  view(key: string): CardView | null {
    const e = this.pool.get(key);
    if (!e) return null;
    const meta: ManifestSet = e.meta;
    const group = colorGroupFor(e.card.col, e.file.colorContext);
    const p = this.pct(e.set, key);
    return {
      key,
      set: e.set,
      setName: meta.name,
      format: meta.format,
      formatLabel: meta.formatLabel,
      windowLabel: meta.windowLabel,
      cardDataUrl: meta.cardDataUrl,
      dataDate: meta.dataDate,
      source: meta.source,
      precision: meta.precision,
      card: e.card,
      mean: e.file.mean,
      sd: e.file.sd,
      n: e.file.n,
      seSteps: e.seSteps,
      colorGroup: group ? { label: group.label, n: group.stat.n, avg: group.stat.avg } : null,
      draftPct: p.draft,
      perfPct: p.perf,
      tags: e.tags,
    };
  }

  plan(req: PlanRequest): Selection[] {
    const out: Selection[] = [];
    const exclude = new Set(req.exclude);
    const recent = [...this.recent];
    for (let i = 0; i < req.n; i++) {
      const cands = this.candidates(req.drillKeys);
      let pick: Pick | null;
      if (req.mode === 'random') pick = this.bag.draw(cands.map((c) => c.key), exclude, this.rng);
      else {
        pick = pickAdaptive({ trial: this.trial + i, now: Date.now(), candidates: cands, sched: this.sched, exposed: this.exposed, recent, weak: req.mode === 'drill' ? [] : this.weak, exclude, rng: this.rng });
        if (pick && req.mode === 'drill') pick = { ...pick, reason: pick.reason === 'review' ? 'drill-review' : 'drill-new', uniform: false };
      }
      if (!pick) break;
      const view = this.view(pick.key);
      if (!view) break;
      exclude.add(pick.key);
      const c = cands.find((x) => x.key === pick?.key);
      if (c) recent.push(c);
      out.push({ view, reason: pick.reason, prob: pick.prob, uniform: pick.uniform });
    }
    return out;
  }

  isExposed(oracleId: string): boolean {
    return this.exposed.has(oracleId);
  }

  async expose(oracleIds: string[], via: Exposure['via']): Promise<void> {
    const now = Date.now();
    for (const o of oracleIds) this.exposed.add(o);
    if (!this.db || oracleIds.length === 0) return;
    const d = this.db;
    await d.transaction('rw', d.exposures, async () => {
      for (const o of oracleIds) {
        const cur = await d.exposures.get(o);
        await d.exposures.put(cur ? { ...cur, count: cur.count + 1 } : { oracleId: o, firstAt: now, via, count: 1 });
      }
    });
  }

  /** Updates scheduler state after a graded evaluation; the evaluation itself is stored by the caller. */
  async record(ev: Evaluation): Promise<void> {
    const prev = this.sched.get(ev.key);
    const next = updateAfter(prev, { key: ev.key, oracleId: ev.oracleId, err: ev.user - ev.actual, rtMs: ev.rtMs, trial: this.trial, now: ev.ts, rtRefMs: this.rtRef }, this.rng);
    this.sched.set(ev.key, next);
    this.trial += 1;
    const e = this.pool.get(ev.key);
    if (e) this.recent = [...this.recent.slice(-5), { key: e.key, oracleId: e.card.o, set: e.set, band: e.band, colorKey: e.colorKey }];
    await this.expose([ev.oracleId], 'reveal');
    if (this.db) await this.db.sched.put(next);
  }

  requeue(key: string) {
    this.bag.requeue(key, this.rng);
  }

  /** Same set, similar role, clearly different grade; already-exposed cards first. */
  contrasts(key: string, n = 3, avoid: string[] = []): CardView[] {
    const e = this.pool.get(key);
    if (!e) return [];
    const avoidSet = new Set(avoid);
    const type = primaryType(e.card.p.type_line);
    const colors = new Set(e.card.col.split(''));
    const scored = (this.pool.bySet.get(e.set) ?? [])
      .filter((o) => o.key !== key && !avoidSet.has(o.key) && o.card.o !== e.card.o && Math.abs(o.card.g - e.card.g) >= 3)
      .map((o) => {
        let s = 0;
        if (primaryType(o.card.p.type_line) === type) s += 3;
        const dmv = Math.abs(o.card.p.cmc - e.card.p.cmc);
        if (dmv === 0) s += 3;
        else if (dmv === 1) s += 2;
        const oc = o.card.col.split('');
        if (o.card.col === e.card.col) s += 3;
        else if (oc.some((c) => colors.has(c))) s += 1.5;
        if (this.exposed.has(o.card.o)) s += 4;
        s += this.rng() * 0.5;
        return { o, s };
      })
      .sort((a, b) => b.s - a.s);
    const higher = scored.filter((x) => x.o.card.g > e.card.g);
    const lower = scored.filter((x) => x.o.card.g < e.card.g);
    const picks: PoolEntry[] = [];
    if (higher[0]) picks.push(higher[0].o);
    if (lower[0]) picks.push(lower[0].o);
    for (const x of scored) {
      if (picks.length >= n) break;
      if (!picks.includes(x.o)) picks.push(x.o);
    }
    return picks
      .slice(0, n)
      .sort((a, b) => b.card.g - a.card.g)
      .map((p) => this.view(p.key) as CardView);
  }
}

export function primaryType(typeLine: string): string {
  const front = typeLine.split(' // ')[0];
  for (const t of ['Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Land']) if (front.includes(t)) return t;
  return 'Other';
}
