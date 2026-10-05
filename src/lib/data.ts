import type { Printing } from './card.ts';
import type { ColorContext, CrowdClass } from './setstats.ts';

export const DATA_SCHEMA = 1;

export type DataSource = 'export' | 'fetch' | 'synthetic';

export interface CardStatsOut {
  gihWr: number;
  gih: number;
  ohWr?: number | null;
  oh?: number | null;
  gdWr?: number | null;
  gd?: number | null;
  gnsWr?: number | null;
  gns?: number | null;
  iih?: number | null;
  alsa?: number | null;
  ata?: number | null;
  gpWr?: number | null;
  gp?: number | null;
  gpPct?: number | null;
  seen?: number | null;
  picked?: number | null;
}

/** One pool entry: (limited set, oracle card) with its display printing and 17Lands numbers. */
export interface PoolCard {
  /** Oracle id. */
  o: string;
  /** Display printing. */
  p: Printing;
  s: CardStatsOut;
  /** Grade index 0 (F) … 12 (A+). */
  g: number;
  z: number;
  /** Rank by GIH WR in the set, 1 = best. */
  r: number;
  /** Crowd gap in percentile points (draft priority minus performance), null without ALSA. */
  cg: number | null;
  c: CrowdClass | null;
  /** Bonus-sheet Scryfall code, null for main-set cards. */
  b: string | null;
  /** Oracle tag indices into tags.json, closed over ancestors. */
  t: number[];
  /** 17Lands' color for the card ("", "W", "UB", …). */
  col: string;
}

export interface SetFile {
  schema: number;
  code: string;
  name: string;
  format: string;
  dataDate: string;
  source: DataSource;
  precision: 'rounded' | 'full';
  n: number;
  mean: number;
  sd: number;
  groups: string[];
  colorContext: ColorContext;
  cards: PoolCard[];
}

export interface ManifestSet {
  code: string;
  name: string;
  format: string;
  formatLabel: string;
  source: DataSource;
  dataDate: string;
  precision: 'rounded' | 'full';
  windowLabel: string;
  cardDataUrl: string;
  release: string;
  cards: number;
  mean: number;
  sd: number;
  file: string;
  bytes: number;
  bonusSheets: string[];
  /** Scryfall set codes of this set's display printings (main set first). */
  scryfallCodes: string[];
  /** True while Standard legality is uncertain and the last deployed data is kept. */
  heldOver?: boolean;
}

export interface StarterCard {
  set: string;
  o: string;
  id: string;
  v?: string;
  name: string;
}

export interface Manifest {
  schema: number;
  generatedAt: string;
  today: string;
  synthetic: boolean;
  dataHash: string;
  sets: ManifestSet[];
  tagsFile: string;
  statusFile: string;
  starters: StarterCard[];
  notes: string[];
}

export interface TagsFile {
  schema: number;
  /** Tag slugs; PoolCard.t indexes into this list. */
  slugs: string[];
  labels: string[];
  /** alias → slug, for every oracle tag Scryfall knows (so unknown tags can be told apart from empty ones). */
  aliases: Record<string, string>;
  /** Every oracle tag slug Scryfall knows. */
  known: string[];
  /** Scryfall keyword abilities, keyword actions and ability words (lowercase): the values kw: accepts. */
  keywords: string[];
}

export type SetState = 'live' | 'held-back' | 'missing' | 'refused' | 'fetch-failed' | 'stale';

export interface SetStatus {
  code: string;
  name: string;
  format: string;
  state: SetState;
  inPool: boolean;
  reason: string;
  flags: string[];
  source: DataSource | null;
  dataDate: string | null;
  active: boolean;
  release: string | null;
  eligibleFrom: string | null;
  cards: number | null;
  standardCodes: string[];
  exportLink: string;
  cardDataUrl: string;
  unmatched: string[];
}

export interface StatusFile {
  schema: number;
  generatedAt: string;
  today: string;
  autoFetch17Lands: boolean;
  respect17LandsEmbargo: boolean;
  activeListDate: string | null;
  synthetic: boolean;
  standard: string[];
  sets: SetStatus[];
  problems: string[];
}

export const FORMAT_LABELS: Record<string, string> = {
  PremierDraft: 'Premier Draft',
  TradDraft: 'Traditional Draft',
  QuickDraft: 'Quick Draft',
  PickTwoDraft: 'Pick-Two Draft',
  Sealed: 'Sealed',
  TradSealed: 'Traditional Sealed',
};

export function formatLabel(f: string): string {
  return FORMAT_LABELS[f] ?? f.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function cardKey(set: string, oracleId: string): string {
  return `${set}:${oracleId}`;
}
