import type { DataSource, PoolCard } from './data.ts';
import type { SelectionReason } from './types.ts';

/** Everything the UI needs to show and reveal one pool entry. */
export interface CardView {
  key: string;
  set: string;
  setName: string;
  format: string;
  formatLabel: string;
  windowLabel: string;
  cardDataUrl: string;
  dataDate: string;
  source: DataSource;
  precision: 'rounded' | 'full';
  card: PoolCard;
  mean: number;
  sd: number;
  n: number;
  seSteps: number;
  colorGroup: { label: string; n: number; avg: number } | null;
  /** Percentile of draft priority (earlier picks higher) and of GIH WR among the set's graded cards. */
  draftPct: number | null;
  perfPct: number;
  tags: string[];
}

export interface Selection {
  view: CardView;
  reason: SelectionReason;
  prob: number;
  uniform: boolean;
}
