import type { ColumnGroup, SeventeenRow } from '../types.ts';

type NumKind = 'count' | 'percent' | 'pp' | 'decimal';

interface ColumnSpec {
  header: string;
  field: keyof SeventeenRow;
  kind: NumKind;
  group: ColumnGroup;
}

/** The site's Table-view columns, in export order. */
export const EXPORT_COLUMNS: ColumnSpec[] = [
  { header: '# Seen', field: 'seen', kind: 'count', group: 'seen' },
  { header: 'ALSA', field: 'alsa', kind: 'decimal', group: 'seen' },
  { header: '# Picked', field: 'picked', kind: 'count', group: 'picked' },
  { header: 'ATA', field: 'ata', kind: 'decimal', group: 'picked' },
  { header: '# GP', field: 'gp', kind: 'count', group: 'played' },
  { header: '% GP', field: 'gpPct', kind: 'percent', group: 'played' },
  { header: 'GP WR', field: 'gpWr', kind: 'percent', group: 'played' },
  { header: '# OH', field: 'oh', kind: 'count', group: 'opening' },
  { header: 'OH WR', field: 'ohWr', kind: 'percent', group: 'opening' },
  { header: '# GD', field: 'gd', kind: 'count', group: 'drawn' },
  { header: 'GD WR', field: 'gdWr', kind: 'percent', group: 'drawn' },
  { header: '# GIH', field: 'gih', kind: 'count', group: 'everInHand' },
  { header: 'GIH WR', field: 'gihWr', kind: 'percent', group: 'everInHand' },
  { header: '# GNS', field: 'gns', kind: 'count', group: 'notSeen' },
  { header: 'GNS WR', field: 'gnsWr', kind: 'percent', group: 'notSeen' },
  { header: 'IIH', field: 'iih', kind: 'pp', group: 'improvement' },
];

export const FIXED_HEADERS = ['Name', 'Color', 'Rarity'] as const;
export const REQUIRED_HEADERS = ['Name', '# GIH', 'GIH WR'] as const;

export function groupColumns(group: ColumnGroup): ColumnSpec[] {
  return EXPORT_COLUMNS.filter((c) => c.group === group);
}

const RARITY_LETTER: Record<string, string> = {
  common: 'C',
  uncommon: 'U',
  rare: 'R',
  mythic: 'M',
  special: 'S',
  basic: 'B',
  bonus: 'S',
};

export function normalizeRarity(r: string | null | undefined): string {
  const s = (r ?? '').trim();
  if (s.length === 1) return s.toUpperCase();
  return RARITY_LETTER[s.toLowerCase()] ?? s.toUpperCase().slice(0, 1);
}

export function parseValue(raw: string, kind: NumKind): number | null {
  const s = raw.trim();
  if (s === '') return null;
  let body = s.replace(/,/g, '');
  if (kind === 'percent') body = body.replace(/%$/, '');
  if (kind === 'pp') body = body.replace(/pp$/i, '');
  const v = Number(body);
  if (!Number.isFinite(v)) throw new Error(`Cannot parse "${raw}" as ${kind}`);
  if (kind === 'percent' || kind === 'pp') return v / 100;
  return v;
}

/** Formats a value the way the site's CSV export does. */
export function formatValue(v: number | null | undefined, kind: NumKind): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '';
  switch (kind) {
    case 'count':
      return String(Math.round(v));
    case 'decimal':
      return v.toFixed(2);
    case 'percent':
      return `${(v * 100).toFixed(1)}%`;
    case 'pp':
      return `${(v * 100).toFixed(1)}pp`;
  }
}

export function rowsToExportTable(rows: SeventeenRow[], groups: ColumnGroup[]): string[][] {
  const cols = EXPORT_COLUMNS.filter((c) => groups.includes(c.group));
  const header = [...FIXED_HEADERS, ...cols.map((c) => c.header)];
  const body = rows.map((r) => [
    r.name,
    r.color,
    normalizeRarity(r.rarity),
    ...cols.map((c) => formatValue(r[c.field] as number | null | undefined, c.kind)),
  ]);
  return [header, ...body];
}
