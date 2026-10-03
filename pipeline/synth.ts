import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gaussian, seededRng, type Rng } from '../src/lib/random.ts';
import { readConfig, loadSharedInputs } from './build.ts';
import { toCsv } from './exports/csv.ts';
import { rowsToExportTable } from './exports/format.ts';
import { eligibility } from './eligibility.ts';
import { normName, parseCardsCsv } from './inputs/cardsCsv.ts';
import { frontName, type ScryCard } from './inputs/scryfall.ts';
import { buildLimitedSet } from './limitedSets.ts';
import { ALL_GROUPS, type SeventeenRow } from './types.ts';

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

const RARITY_SHIFT: Record<string, number> = { C: -0.35, U: 0, R: 0.45, M: 0.6 };
const GIH_RANGE: Record<string, [number, number]> = { C: [35000, 110000], U: [12000, 40000], R: [2500, 9000], M: [1000, 5000] };

function colorsOf(c: ScryCard): string {
  const cols = (c.colors as string[] | undefined) ?? (c.card_faces?.[0]?.colors as string[] | undefined) ?? [];
  return 'WUBRG'.split('').filter((x) => cols.includes(x)).join('');
}

/** Invented but plausible 17Lands numbers for one card. */
export function synthRow(name: string, color: string, rarity: string, bonus: boolean, mean: number, sd: number, rng: Rng): SeventeenRow {
  const q = gaussian(rng) * 0.9 + (RARITY_SHIFT[rarity] ?? 0);
  const gihWr = clamp(mean + sd * q, 0.38, 0.74);
  const [lo, hi] = GIH_RANGE[rarity] ?? [2000, 8000];
  let gih = Math.round(lo + (hi - lo) * rng());
  if (bonus) gih = Math.round(gih * (0.05 + 0.25 * rng()));
  const perceived = q + gaussian(rng) * 0.85 + (rarity === 'M' ? 0.5 : rarity === 'R' ? 0.35 : 0);
  const alsa = clamp(7.2 - 1.7 * perceived + gaussian(rng) * 0.6, 1.05, 12.5);
  const ata = clamp(alsa + 1.2 + gaussian(rng) * 0.6, 1.0, 14);
  const gns = Math.round(gih * (1.0 + 0.4 * rng()));
  const gnsWr = clamp(mean - 0.022 + gaussian(rng) * 0.006, 0.4, 0.7);
  const oh = Math.round(gih * (0.38 + 0.06 * rng()));
  const gd = gih - oh;
  const ohWr = clamp(gihWr - 0.012 + gaussian(rng) * 0.01, 0.35, 0.78);
  const gdWr = clamp((gihWr * gih - ohWr * oh) / Math.max(1, gd), 0.35, 0.8);
  const gp = gih + gns;
  const gpWr = clamp((gihWr * gih + gnsWr * gns) / gp, 0.35, 0.75);
  const seen = Math.round(gp * (1.2 + 0.6 * rng()) * (rarity === 'C' ? 1 : 0.6));
  const picked = Math.round(seen * clamp(0.1 + 0.08 * perceived + 0.05 * rng(), 0.03, 0.6));
  const shown = gih >= 500;
  return {
    name,
    color,
    rarity,
    seen,
    alsa,
    picked,
    ata,
    gp,
    gpPct: clamp(0.35 + 0.2 * q + 0.15 * rng(), 0.05, 0.98),
    gpWr: shown ? gpWr : null,
    oh,
    ohWr: oh >= 500 ? ohWr : null,
    gd,
    gdWr: gd >= 500 ? gdWr : null,
    gih,
    gihWr: shown ? gihWr : null,
    gns,
    gnsWr: gns >= 500 ? gnsWr : null,
    iih: shown && gns >= 500 ? gihWr - gnsWr : null,
  };
}

export async function generateSynthetic(opts: { root: string; cacheDir: string; today: string; offline: boolean }): Promise<void> {
  const { pipeline, sets: setsCfg } = readConfig(opts.root);
  const shared = await loadSharedInputs({ cacheDir: opts.cacheDir, offline: opts.offline, today: opts.today, setsCfg });
  const csvRows = parseCardsCsv(readFileSync(join(opts.cacheDir, '17lands', 'cards.csv'), 'utf8'));
  const outDir = join(opts.root, 'data/synthetic');
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(outDir)) if (f.endsWith('.csv')) rmSync(join(outDir, f));
  let n = 0;
  const bySet = new Map<string, ScryCard[]>();
  const byName = new Map<string, ScryCard[]>();
  for (const c of shared.cards) {
    const s = bySet.get(c.set);
    if (s) s.push(c);
    else bySet.set(c.set, [c]);
    const k = normName(frontName(c));
    const t = byName.get(k);
    if (t) t.push(c);
    else byName.set(k, [c]);
  }
  for (const code of Object.keys(setsCfg.sets)) {
    const ls = buildLimitedSet(code, setsCfg, shared.scrySets, shared.cards);
    const rel = setsCfg.sets[code].arenaRelease ?? null;
    if (!eligibility(rel, opts.today, pipeline).eligible) continue;
    const names = new Map<string, { name: string; rarity: string; bonus: boolean; color: string }>();
    ls.cardsCsvCodes.forEach((exp, i) => {
      const code2 = exp.toLowerCase();
      const scry = bySet.get(code2) ?? [];
      const boosterNames = new Set(scry.filter((c) => c.booster).map((c) => normName(frontName(c))));
      const spgWave = new Set(scry.filter((c) => code2 === 'spg' && c.released_at === ls.spgDate).map((c) => normName(frontName(c))));
      for (const r of csvRows) {
        if (r.expansion.toUpperCase() !== exp || !r.isBooster || r.rarity === 'basic') continue;
        const key = normName(r.name.split(' // ')[0]);
        if (i > 0 && code2 !== 'spg' && boosterNames.size > 0 && !boosterNames.has(key)) continue;
        if (code2 === 'spg' && !spgWave.has(key)) continue;
        if (names.has(key)) continue;
        const cands = byName.get(key) ?? [];
        const sc = cands.find((c) => ls.displayCodes.includes(c.set) || c.set === code2) ?? cands[0];
        const rarity = ({ common: 'C', uncommon: 'U', rare: 'R', mythic: 'M' } as Record<string, string>)[r.rarity] ?? 'R';
        names.set(key, { name: r.name.split(' // ')[0], rarity, bonus: i > 0, color: sc ? colorsOf(sc) : '' });
      }
    });
    const rng = seededRng(`synthetic:${code}`);
    const mean = 0.545 + 0.03 * rng();
    const sd = 0.035 + 0.015 * rng();
    const rows = [...names.values()].map((x) => synthRow(x.name, x.color, x.rarity, x.bonus, mean, sd, rng));
    const table = rowsToExportTable(rows, ALL_GROUPS);
    const file = n === 0 ? `card-ratings-${opts.today}.csv` : `card-ratings-${opts.today} (${n}).csv`;
    writeFileSync(join(outDir, file), toCsv(table));
    console.log(`${file}: ${code} ${rows.length} rows (synthetic)`);
    n++;
  }
}
