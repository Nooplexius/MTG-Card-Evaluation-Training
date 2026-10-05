/**
 * Builds tests/fixtures/query/pool.json: display printings (as shipped) for TLA, OM1, TMT, DSK, OTJ and MKM,
 * joined with the pipeline's own code from the pinned fixtures. Run: npx tsx scripts/make-query-fixture.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeApiRows } from '../pipeline/exports/normalizeApi.ts';
import { buildJoinIndex, joinRow, type JoinMatch } from '../pipeline/join.ts';
import { buildLimitedSet } from '../pipeline/limitedSets.ts';
import { buildTagIndex, toPrinting } from '../pipeline/output.ts';
import type { SeventeenRow } from '../pipeline/types.ts';
import { crowdGaps } from '../src/lib/setstats.ts';
import { fixtures, FIX } from '../tests/helpers/fixtures.ts';

function main() {
  const f = fixtures();
  const idx = buildJoinIndex(f.cards, f.cardsCsv);
  const setNames = new Map(f.scrySets.map((s) => [s.code, s.name] as const));
  const rowsFor = (code: string): SeventeenRow[] => {
    if (code === 'TLA') return normalizeApiRows(f.tla).rows;
    if (code === 'OM1') return normalizeApiRows(f.om1).rows;
    const ls = buildLimitedSet(code, f.setsCfg, f.scrySets, f.cards);
    const wave = new Set(f.cards.filter((c) => c.set === 'spg' && c.released_at === ls.spgDate).map((c) => c.name.split(' // ')[0].toLowerCase()));
    const names = new Set<string>();
    for (const exp of ls.cardsCsvCodes) for (const n of f.cardsCsv.get(exp)?.keys() ?? []) if (exp !== 'SPG' || wave.has(n)) names.add(n);
    return [...names].map((name) => ({ name, color: '', rarity: 'C', gih: null, gihWr: null }));
  };
  const oracles = new Set<string>();
  const joined: Array<{ lset: string; row: SeventeenRow; match: JoinMatch; crowd: 'over' | 'under' | null }> = [];
  for (const code of ['TLA', 'OM1', 'TMT', 'DSK', 'OTJ', 'MKM']) {
    const ls = buildLimitedSet(code, f.setsCfg, f.scrySets, f.cards);
    const seen = new Set<string>();
    for (const row of rowsFor(code)) {
      const m = joinRow(row, ls, idx);
      if (!m.ok || seen.has(m.match.oracleId)) continue;
      if (/\bBasic\b/.test(m.match.display.type_line ?? '')) continue;
      seen.add(m.match.oracleId);
      oracles.add(m.match.oracleId);
      joined.push({ lset: code, row, match: m.match, crowd: null });
    }
  }
  for (const code of ['TLA', 'OM1']) {
    const graded = joined.filter((j) => j.lset === code && typeof j.row.gihWr === 'number');
    const cg = crowdGaps(graded.map((j) => ({ gihWr: j.row.gihWr as number, alsa: j.row.alsa })));
    graded.forEach((j, i) => (j.crowd = cg[i].crowd));
  }
  const tags = buildTagIndex(f.tags, oracles);
  const out = joined.map((j) => ({
    lset: j.lset,
    crowd: j.crowd,
    tags: [...(tags.byOracle.get(j.match.oracleId) ?? [])].map((id) => tags.byId.get(id)?.slug as string).sort(),
    p: toPrinting(j.match.display, setNames.get(j.match.display.set) ?? ''),
  }));
  mkdirSync(join(FIX, 'query'), { recursive: true });
  writeFileSync(join(FIX, 'query/pool.json'), JSON.stringify(out));
  console.log(`pool: ${out.length} entries; set codes: ${[...new Set(out.map((e) => e.p.set))].sort().join(' ')}`);
}

main();
