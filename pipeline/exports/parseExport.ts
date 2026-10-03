import { parseCsv } from './csv.ts';
import { EXPORT_COLUMNS, FIXED_HEADERS, REQUIRED_HEADERS, normalizeRarity, parseValue } from './format.ts';
import { ALL_GROUPS, type ColumnGroup, type SeventeenRow } from '../types.ts';

export interface ParsedExport {
  rows: SeventeenRow[];
  groups: ColumnGroup[];
  warnings: string[];
}

export class ExportParseError extends Error {}

/** Parses a 17Lands Card Data CSV export (Table view → Export data → Download as CSV). */
export function parseExportCsv(text: string): ParsedExport {
  let table: string[][];
  try {
    table = parseCsv(text);
  } catch (e) {
    throw new ExportParseError(`Not a valid CSV file: ${(e as Error).message}`);
  }
  if (table.length === 0) throw new ExportParseError('The file is empty.');
  const header = table[0].map((h) => h.trim());
  const index = new Map<string, number>();
  header.forEach((h, i) => index.set(h, i));
  const missing = REQUIRED_HEADERS.filter((h) => !index.has(h));
  if (missing.length > 0) {
    throw new ExportParseError(
      `Missing required column${missing.length > 1 ? 's' : ''} ${missing.map((m) => `"${m}"`).join(', ')}. ` +
        'Export from the Table view with the "Ever in Hand" column group turned on (use the link with columns=…).',
    );
  }
  const warnings: string[] = [];
  const known = new Set<string>([...FIXED_HEADERS, ...EXPORT_COLUMNS.map((c) => c.header)]);
  const unknown = header.filter((h) => !known.has(h));
  if (unknown.length > 0) warnings.push(`Ignored unknown columns: ${unknown.join(', ')}`);

  const groups = ALL_GROUPS.filter((g) => EXPORT_COLUMNS.filter((c) => c.group === g).every((c) => index.has(c.header)));
  const partial = ALL_GROUPS.filter((g) => !groups.includes(g) && EXPORT_COLUMNS.some((c) => c.group === g && index.has(c.header)));
  if (partial.length > 0) warnings.push(`Partially present column groups ignored: ${partial.join(', ')}`);

  const cols = EXPORT_COLUMNS.filter((c) => groups.includes(c.group));
  const rows: SeventeenRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const line = table[r];
    const get = (h: string) => {
      const i = index.get(h);
      return i === undefined ? '' : (line[i] ?? '');
    };
    const name = get('Name').trim();
    if (name === '') continue;
    const row: SeventeenRow = {
      name,
      color: get('Color').trim(),
      rarity: normalizeRarity(get('Rarity')),
      gih: null,
      gihWr: null,
    };
    for (const c of cols) {
      try {
        (row as unknown as Record<string, number | null>)[c.field] = parseValue(get(c.header), c.kind);
      } catch (e) {
        throw new ExportParseError(`Row ${r + 1} (${name}): ${(e as Error).message}`);
      }
    }
    rows.push(row);
  }
  return { rows, groups, warnings };
}

const FILENAME_DATE = /card-ratings-(\d{4}-\d{2}-\d{2})/;

export function dateFromFilename(fileName: string): string | null {
  const m = FILENAME_DATE.exec(fileName);
  if (!m) return null;
  const d = new Date(`${m[1]}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== m[1]) return null;
  return m[1];
}

/** A file name may override the configured format only with an exact 17Lands event name. */
export function formatOverrideFromFilename(fileName: string, eventTypes: readonly string[]): string | null {
  const base = fileName.replace(/\.csv$/i, '');
  const hits = eventTypes.filter((ev) => new RegExp(`(?<![A-Za-z0-9])${ev}(?![A-Za-z0-9])`).test(base));
  if (hits.length === 0) return null;
  return hits.sort((a, b) => b.length - a.length)[0];
}
