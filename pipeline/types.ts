export type ColumnGroup = 'seen' | 'picked' | 'played' | 'opening' | 'drawn' | 'everInHand' | 'notSeen' | 'improvement';

export const ALL_GROUPS: ColumnGroup[] = ['seen', 'picked', 'played', 'opening', 'drawn', 'everInHand', 'notSeen', 'improvement'];

/** One card's 17Lands Card Data row, normalized from either a CSV export or an API response. Win rates are fractions. */
export interface SeventeenRow {
  name: string;
  mtgaId?: number;
  color: string;
  rarity: string;
  seen?: number | null;
  alsa?: number | null;
  picked?: number | null;
  ata?: number | null;
  gp?: number | null;
  gpPct?: number | null;
  gpWr?: number | null;
  oh?: number | null;
  ohWr?: number | null;
  gd?: number | null;
  gdWr?: number | null;
  gih: number | null;
  gihWr: number | null;
  gns?: number | null;
  gnsWr?: number | null;
  iih?: number | null;
}

export type DataKind = 'export' | 'snapshot' | 'synthetic';

export interface SeventeenData {
  kind: DataKind;
  /** Repository-relative path of the source file. */
  path: string;
  /** Limited set code (uppercase), known for snapshots, inferred for exports. */
  set?: string;
  format?: string;
  /** Data date (YYYY-MM-DD): the export date or the fetch date. */
  date: string;
  dateSource: 'filename' | 'git' | 'mtime' | 'fetch';
  precision: 'rounded' | 'full';
  groups: ColumnGroup[];
  rows: SeventeenRow[];
  /** Format override token found in the file name, if any. */
  formatOverride?: string;
}

export interface DataMetrics {
  rows: number;
  graded: number;
  mean: number | null;
  totalGih: number;
}
