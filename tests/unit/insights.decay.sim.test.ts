import { describe, expect, it } from 'vitest';
import { buildPool, halfLifeReport, simulateUser, type Scenario } from '../helpers/insightSim.ts';

describe('evidence decay: a user who stops overrating red after 200 first looks', () => {
  const improver: Scenario = { name: 'improver', slope: 1, sigma: 1.2, offset: 0, planted: { 'color:r': 2 }, changeAt: 200, after: {}, expect: [], evals: 700 };
  const RUNS = 30;
  it('drops the stale insight in most runs, which the same engine without decay keeps reporting', () => {
    const pool = buildPool();
    let withDecay = 0;
    let without = 0;
    const halfLives: number[] = [];
    for (let u = 0; u < RUNS; u++) {
      const r = simulateUser(improver, u, pool);
      if (r.ids.has('facet:color:r')) withDecay++;
      if (r.noDecay.has('facet:color:r')) without++;
      halfLives.push(r.halfLife);
    }
    console.log(`improver (of ${RUNS} runs): stale red insight with decay ${withDecay}, without ${without} · half-lives ${halfLifeReport(halfLives)}`);
    expect(without).toBeGreaterThanOrEqual(Math.ceil(0.8 * RUNS));
    expect(withDecay).toBeLessThanOrEqual(Math.floor(0.3 * RUNS));
  });
});
