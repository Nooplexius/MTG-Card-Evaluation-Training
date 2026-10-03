import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { dateFromFilename, formatOverrideFromFilename, parseExportCsv } from './parseExport.ts';
import { isApiCardResponse, normalizeApiRows } from './normalizeApi.ts';
import { ALL_GROUPS, type DataKind, type SeventeenData } from '../types.ts';
import { listSnapshots, type DataBranch, type SavedSnapshot } from '../inputs/seventeen.ts';

export interface DiscoverError {
  path: string;
  message: string;
}

/** Date of the commit that first added the file (needs full history), else null. */
export function gitAddDate(repoRoot: string, relPath: string): string | null {
  try {
    const out = execFileSync('git', ['log', '--diff-filter=A', '--follow', '--format=%cI', '--', relPath], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const lines = out.trim().split('\n').filter(Boolean);
    if (lines.length === 0) return null;
    return new Date(lines[lines.length - 1]).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

export function discoverExports(dir: string, repoRoot: string, eventTypes: readonly string[], kind: DataKind = 'export'): { data: SeventeenData[]; errors: DiscoverError[]; warnings: string[] } {
  const data: SeventeenData[] = [];
  const errors: DiscoverError[] = [];
  const warnings: string[] = [];
  if (!existsSync(dir)) return { data, errors, warnings };
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.csv')).sort();
  for (const f of files) {
    const abs = join(dir, f);
    const rel = relative(repoRoot, abs);
    let parsed;
    try {
      parsed = parseExportCsv(readFileSync(abs, 'utf8'));
    } catch (e) {
      errors.push({ path: rel, message: (e as Error).message });
      continue;
    }
    for (const w of parsed.warnings) warnings.push(`${rel}: ${w}`);
    let date = dateFromFilename(basename(f));
    let dateSource: SeventeenData['dateSource'] = 'filename';
    if (!date) {
      date = gitAddDate(repoRoot, rel);
      dateSource = 'git';
    }
    if (!date) {
      date = statSync(abs).mtime.toISOString().slice(0, 10);
      dateSource = 'mtime';
      warnings.push(`${rel}: no date in the file name and not committed yet; using the file's modification date ${date}`);
    }
    data.push({
      kind,
      path: rel,
      date,
      dateSource,
      precision: 'rounded',
      groups: parsed.groups,
      rows: parsed.rows,
      formatOverride: formatOverrideFromFilename(basename(f), eventTypes) ?? undefined,
    });
  }
  return { data, errors, warnings };
}

export function loadSnapshots(db: DataBranch | null): { data: SeventeenData[]; errors: DiscoverError[] } {
  const data: SeventeenData[] = [];
  const errors: DiscoverError[] = [];
  if (!db) return { data, errors };
  for (const s of listSnapshots(db)) {
    try {
      const snap = JSON.parse(readFileSync(s.path, 'utf8')) as SavedSnapshot;
      if (!isApiCardResponse(snap.response)) throw new Error('snapshot has no data array');
      const { rows, missingFields } = normalizeApiRows(snap.response);
      data.push({
        kind: 'snapshot',
        path: `data-branch:${s.rel}`,
        set: s.set,
        format: s.format,
        date: s.date,
        dateSource: 'fetch',
        precision: 'full',
        groups: missingFields.length > 0 ? ALL_GROUPS.filter((g) => g !== 'everInHand') : ALL_GROUPS,
        rows,
      });
    } catch (e) {
      errors.push({ path: `data-branch:${s.rel}`, message: (e as Error).message });
    }
  }
  return { data, errors };
}
