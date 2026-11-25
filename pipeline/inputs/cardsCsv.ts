import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseCsv } from '../exports/csv.ts';
import { SharedInputError } from './http.ts';

export const CARDS_CSV_URL = 'https://17lands-public.s3.amazonaws.com/analysis_data/cards/cards.csv';

interface CardsCsvOptions {
  offline: boolean;
  no17Lands?: boolean;
  fallbackPath?: string;
  log?: (message: string) => void;
}

/** The CSV maps card names to Arena IDs. Ratings still come from exports and API snapshots. */
export async function loadCardsCsv(cachePath: string, opts: CardsCsvOptions): Promise<CardsCsvRow[]> {
  const cached = existsSync(cachePath);
  const localPath = cached ? cachePath : opts.fallbackPath;
  const source = cached ? 'the input cache' : 'the committed lookup subset';
  if (opts.no17Lands) {
    opts.log?.(`Reading cards.csv from ${source} (--no-17lands).`);
  } else if (opts.offline) {
    if (!cached) throw new SharedInputError(`Offline and no cached copy of ${CARDS_CSV_URL}`);
  } else if (!cached || Date.now() - statSync(cachePath).mtimeMs >= 24 * 3_600_000) {
    const res = await fetch(CARDS_CSV_URL, { headers: { 'User-Agent': 'Loupe/1.0' } });
    if (res.ok) {
      const text = await res.text();
      const rows = parseCardsCsv(text);
      mkdirSync(dirname(cachePath), { recursive: true });
      const tmp = `${cachePath}.${randomUUID()}.tmp`;
      try {
        writeFileSync(tmp, text);
        renameSync(tmp, cachePath);
      } finally {
        rmSync(tmp, { force: true });
      }
      return rows;
    }
    if (res.status !== 403 || !localPath) throw new SharedInputError(`GET ${CARDS_CSV_URL} returned HTTP ${res.status}`);
    opts.log?.(`17Lands cards.csv returned HTTP 403. Using ${source} for card IDs.`);
  }
  if (!localPath) throw new SharedInputError('No local cards.csv available');
  return parseCardsCsv(readFileSync(localPath, 'utf8'));
}

export interface CardsCsvRow {
  id: number;
  expansion: string;
  name: string;
  rarity: string;
  isBooster: boolean;
}

export function parseCardsCsv(text: string): CardsCsvRow[] {
  const table = parseCsv(text);
  const header = table[0] ?? [];
  const col = (h: string) => header.indexOf(h);
  const [iId, iExp, iName, iRar, iBoost] = ['id', 'expansion', 'name', 'rarity', 'is_booster'].map(col);
  if ([iId, iExp, iName].some((i) => i < 0)) throw new SharedInputError('cards.csv is missing id, expansion or name columns');
  const out: CardsCsvRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    const id = Number(row[iId]);
    if (!Number.isFinite(id)) continue;
    out.push({ id, expansion: row[iExp], name: row[iName], rarity: iRar >= 0 ? row[iRar] : '', isBooster: iBoost >= 0 ? row[iBoost] === 'True' : true });
  }
  if (out.length < 1000) throw new SharedInputError(`cards.csv looks truncated (${out.length} rows)`);
  return out;
}

export function normName(s: string): string {
  return s.normalize('NFC').trim().toLowerCase().replace(/[\u2019\u2018]/g, "'");
}

/** expansion → normalized name → MTGA ids (a name can have several ids for alternate printings). */
export function indexCardsCsv(rows: CardsCsvRow[]): Map<string, Map<string, number[]>> {
  const out = new Map<string, Map<string, number[]>>();
  for (const r of rows) {
    const exp = r.expansion.toUpperCase();
    let m = out.get(exp);
    if (!m) out.set(exp, (m = new Map()));
    const k = normName(r.name.split(' // ')[0]);
    const ids = m.get(k) ?? [];
    ids.push(r.id);
    m.set(k, ids);
  }
  return out;
}
