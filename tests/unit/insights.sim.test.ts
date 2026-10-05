import { describe, expect, it } from 'vitest';
import { loadQueryFixtures } from '../../pipeline/corpus.ts';
import { baseFacets, type Facet } from '../../src/lib/facets.ts';
import { gradeIndexFromZ, seInSteps } from '../../src/lib/grades.ts';
import { computeInsights, type FirstLook } from '../../src/lib/insights.ts';
import { bandOf, colorKeyOf } from '../../src/lib/pool.ts';
import { compile, evaluate } from '../../src/lib/query/engine.ts';
import { gaussian, seededRng, type Rng } from '../../src/lib/random.ts';
import { DAY_MS, pickAdaptive, updateAfter, type Candidate, type WeakFacet } from '../../src/lib/scheduler.ts';
import type { SchedItem } from '../../src/lib/types.ts';
import { ROOT } from '../helpers/fixtures.ts';

const USERS = 50;
const EVALS = 400;
const SESSION = 20;

interface SimEntry {
  key: string;
  oracle: string;
  /** Observed 17Lands grade: true quality plus sampling noise. */
  g: number;
  /** True quality on the step scale (C = 5), which the simulated user perceives. */
  trueSteps: number;
  se: number;
  facets: string[];
  cand: Candidate;
}

function buildPool(): { entries: SimEntry[]; facets: Facet[]; share: Map<string, number> } {
  const fx = loadQueryFixtures(ROOT);
  const rng = seededRng('sim-pool');
  const lsets = [...new Set(fx.pool.map((e) => e.lset))];
  const sheets = [...new Set(fx.pool.map((e) => e.p.set).filter((s) => !lsets.map((x) => x.toLowerCase()).includes(s)))];
  const facets = baseFacets(lsets.map((code) => ({ code, name: code, bonusSheets: sheets })));
  const members = new Map<string, Uint8Array>();
  for (const f of facets) members.set(f.id, evaluate(compile(f.query, fx.ctx), fx.subjects));
  const shift: Record<string, number> = { common: -0.35, uncommon: 0, rare: 0.45, mythic: 0.6 };
  const gih: Record<string, number> = { common: 45000, uncommon: 20000, rare: 5000, mythic: 2000 };
  const entries = fx.pool.map((e, i) => {
    const z = 0.9 * gaussian(rng) + (shift[e.p.rarity] ?? 0);
    const games = Math.round((gih[e.p.rarity] ?? 3000) * (0.4 + rng()));
    const se = seInSteps(0.55 + 0.04 * z, games, 0.04);
    const g = gradeIndexFromZ(z + (se / 3) * gaussian(rng));
    const key = `${e.lset}:${e.p.oracle_id}`;
    return {
      key,
      oracle: e.p.oracle_id,
      g,
      trueSteps: 3 * z + 5,
      se,
      facets: facets.filter((f) => members.get(f.id)?.[i]).map((f) => f.id),
      cand: { key, oracleId: e.p.oracle_id, set: e.lset, band: bandOf(g), colorKey: colorKeyOf('', e.p.colors ?? e.p.card_faces?.[0]?.colors ?? []) },
    };
  });
  const share = new Map(facets.map((f) => [f.id, entries.filter((e) => e.facets.includes(f.id)).length / entries.length] as const));
  return { entries, facets, share };
}

interface Scenario {
  name: string;
  slope: number;
  sigma: number;
  offset: number;
  planted: Record<string, number>;
  expect: string[];
}

function simulateUser(s: Scenario, u: number, pool: ReturnType<typeof buildPool>): Set<string> {
  const rng: Rng = seededRng(`sim:${s.name}:${u}`);
  const byKey = new Map(pool.entries.map((e) => [e.key, e] as const));
  const candidates = pool.entries.map((e) => e.cand);
  const sched = new Map<string, SchedItem>();
  const exposed = new Set<string>();
  const recent: Candidate[] = [];
  const looks: FirstLook[] = [];
  let weak: WeakFacet[] = [];
  const judge = (e: SimEntry) => {
    const effect = s.offset + Object.entries(s.planted).reduce((acc, [f, v]) => acc + (e.facets.includes(f) ? v : 0), 0);
    return Math.max(0, Math.min(12, Math.round(5 + s.slope * (e.trueSteps - 5) + effect + s.sigma * gaussian(rng))));
  };
  for (let t = 0; t < EVALS; t++) {
    const now = Math.floor(t / SESSION) * DAY_MS * 0.5 + (t % SESSION) * 15_000;
    const pick = pickAdaptive({ trial: t, now, candidates, sched, exposed, recent, weak, exclude: new Set(), rng });
    if (!pick) break;
    const e = byKey.get(pick.key) as SimEntry;
    const first = !exposed.has(e.oracle);
    const user = first || rng() > 0.6 ? judge(e) : Math.max(0, Math.min(12, e.g + Math.round(0.5 * gaussian(rng))));
    const rtMs = Math.round(2500 + 4000 * rng());
    sched.set(e.key, updateAfter(sched.get(e.key), { key: e.key, oracleId: e.oracle, err: user - e.g, rtMs, trial: t, now }, rng));
    exposed.add(e.oracle);
    recent.push(e.cand);
    if (first) looks.push({ key: e.key, printingId: e.key, user, actual: e.g, se: e.se, facets: e.facets, rtMs, seq: (t % SESSION) + 1, ts: now });
    if ((t + 1) % 50 === 0 && t + 1 < EVALS) {
      const r = computeInsights(looks, pool.facets, pool.share);
      weak = r.weak.slice(0, 4).map((w) => ({ id: w.facetId, weight: Math.abs(w.effect), keys: new Set(pool.entries.filter((x) => x.facets.includes(w.facetId)).map((x) => x.key)) }));
    }
  }
  return new Set(computeInsights(looks, pool.facets, pool.share).insights.map((i) => i.id));
}

const SCENARIOS: Scenario[] = [
  { name: 'red-compressed', slope: 0.6, sigma: 1.2, offset: 0, planted: { 'color:r': 2 }, expect: ['facet:color:r', 'behavior:compression'] },
  { name: 'removal-optimist', slope: 1, sigma: 1.2, offset: 0.8, planted: { 'tag:removal': -1.5 }, expect: ['facet:tag:removal', 'behavior:optimism'] },
  { name: 'null', slope: 1, sigma: 1.2, offset: 0, planted: {}, expect: [] },
];

describe('smart feedback: 50 simulated users × 400 evaluations through the real scheduler', () => {
  const pool = buildPool();
  for (const s of SCENARIOS) {
    it(`${s.name}: planted effects found in ≥ 90% of runs, any other insight in ≤ 5%`, () => {
      const counts = new Map<string, number>();
      for (let u = 0; u < USERS; u++) for (const id of simulateUser(s, u, pool)) counts.set(id, (counts.get(id) ?? 0) + 1);
      const report = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id}=${n}`);
      console.log(`${s.name} (of ${USERS} runs): ${report.join(', ') || 'no insights'}`);
      for (const id of s.expect) expect(counts.get(id) ?? 0, `${id} in ${report.join(', ')}`).toBeGreaterThanOrEqual(Math.ceil(0.9 * USERS));
      for (const [id, n] of counts) if (!s.expect.includes(id)) expect(n, `unplanted ${id} in ${report.join(', ')}`).toBeLessThanOrEqual(Math.floor(0.05 * USERS));
    });
  }
});
