import { MIN_GRADED_CARDS } from '../../src/lib/grades.ts';
import { normalizeColor } from '../../src/lib/setstats.ts';
import type { DataMetrics, SeventeenData } from '../types.ts';

export interface ValidationConfig {
  minRowRatio: number;
  meanMin: number;
  meanMax: number;
  maxMeanShift: number;
}

export const DEFAULT_VALIDATION: ValidationConfig = { minRowRatio: 0.95, meanMin: 0.52, meanMax: 0.61, maxMeanShift: 0.015 };

export function metricsOf(data: SeventeenData): DataMetrics {
  const graded = data.rows.filter((r) => typeof r.gihWr === 'number');
  const mean = graded.length > 0 ? graded.reduce((s, r) => s + (r.gihWr as number), 0) / graded.length : null;
  const totalGih = data.rows.reduce((s, r) => s + (r.gih ?? 0), 0);
  return { rows: data.rows.length, graded: graded.length, mean, totalGih };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export interface ValidationResult {
  ok: boolean;
  reasons: string[];
  metrics: DataMetrics;
}

/** Coverage problems: a color- or rarity-filtered export lacks some colors or rarities. */
export function coverageProblems(data: SeventeenData): string[] {
  const colors = new Set<string>();
  let multi = false;
  let colorless = false;
  const rarities = new Set<string>();
  for (const r of data.rows) {
    const c = normalizeColor(r.color);
    if (c.length === 0) colorless = true;
    else if (c.length === 1) colors.add(c);
    else multi = true;
    rarities.add(r.rarity.toUpperCase());
  }
  const out: string[] = [];
  const missingColors = ['W', 'U', 'B', 'R', 'G'].filter((c) => !colors.has(c));
  if (missingColors.length > 0) out.push(`no mono-colored ${missingColors.join('/')} cards`);
  if (!multi) out.push('no multicolor cards');
  if (!colorless) out.push('no colorless cards');
  const missingRarities = ['C', 'U', 'R', 'M'].filter((r) => !rarities.has(r));
  if (missingRarities.length > 0) out.push(`no ${missingRarities.join('/')} rarity cards`);
  return out;
}

export function validateData(data: SeventeenData, previous: SeventeenData | null, cfg: ValidationConfig = DEFAULT_VALIDATION): ValidationResult {
  const reasons: string[] = [];
  const m = metricsOf(data);
  if (!data.groups.includes('everInHand')) reasons.push('missing the required # GIH and GIH WR columns');
  if (m.rows === 0) reasons.push('contains no card rows');
  const cov = coverageProblems(data);
  if (cov.length > 0) reasons.push(`looks filtered (${cov.join('; ')}); export with no color or rarity filter`);
  if (m.graded >= MIN_GRADED_CARDS && m.mean !== null) {
    if (m.mean < cfg.meanMin || m.mean > cfg.meanMax) {
      reasons.push(`set-average GIH WR ${pct(m.mean)} is outside ${pct(cfg.meanMin)}–${pct(cfg.meanMax)}; a user-group or deck-color filter was probably on`);
    }
  }
  if (previous) {
    const p = metricsOf(previous);
    if (m.rows < cfg.minRowRatio * p.rows) {
      reasons.push(`has ${m.rows} rows, fewer than ${Math.round(cfg.minRowRatio * 100)}% of the previous data's ${p.rows} (${previous.path})`);
    }
    if (m.mean !== null && p.mean !== null && m.graded >= MIN_GRADED_CARDS && p.graded >= MIN_GRADED_CARDS) {
      const shift = Math.abs(m.mean - p.mean);
      if (shift > cfg.maxMeanShift + 1e-12) {
        reasons.push(`set-average GIH WR moved ${(shift * 100).toFixed(2)} points from the previous data (${pct(p.mean)} → ${pct(m.mean)}); a user-group or deck-color filter was probably on`);
      }
    }
    if (m.totalGih < p.totalGih) {
      reasons.push(`total # GIH ${m.totalGih.toLocaleString('en-US')} is smaller than the previous data's ${p.totalGih.toLocaleString('en-US')}; a time period other than "All time" was probably selected`);
    }
  }
  return { ok: reasons.length === 0, reasons, metrics: m };
}

export interface ChainEntry {
  data: SeventeenData;
  result: ValidationResult;
  previous: SeventeenData | null;
}

export interface ChainResult {
  chosen: SeventeenData | null;
  entries: ChainEntry[];
  /** The newest candidate, if it was refused. */
  newestRefused: ChainEntry | null;
}

/** Orders candidates oldest first; on the same date the smaller # GIH total comes first so the larger one wins. */
export function orderCandidates(cands: SeventeenData[]): SeventeenData[] {
  return [...cands].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const ga = metricsOf(a).totalGih;
    const gb = metricsOf(b).totalGih;
    if (ga !== gb) return ga - gb;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });
}

/** Validates each candidate against the newest older valid one and returns the newest valid data. */
export function chooseNewestValid(cands: SeventeenData[], cfg: ValidationConfig = DEFAULT_VALIDATION): ChainResult {
  const ordered = orderCandidates(cands);
  const entries: ChainEntry[] = [];
  let prevValid: SeventeenData | null = null;
  for (const d of ordered) {
    const result = validateData(d, prevValid, cfg);
    entries.push({ data: d, result, previous: prevValid });
    if (result.ok) prevValid = d;
  }
  const last = entries[entries.length - 1];
  return { chosen: prevValid, entries, newestRefused: last && !last.result.ok ? last : null };
}
