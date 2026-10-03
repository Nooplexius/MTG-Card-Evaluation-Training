import { parseCsv } from '../exports/csv.ts';
import { SharedInputError } from './http.ts';

export const CARDS_CSV_URL = 'https://17lands-public.s3.amazonaws.com/analysis_data/cards/cards.csv';

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
