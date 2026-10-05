import type { Printing } from './card.ts';
import type { DataSource } from './data.ts';
import type { CrowdClass } from './setstats.ts';

export type Mode = 'adaptive' | 'random' | 'drill';

export type SelectionReason = 'probe' | 'review' | 'weak-facet' | 'explore' | 'random' | 'drill-review' | 'drill-new' | 'resume' | 'starter';

/** One graded evaluation, with the 17Lands truth as it was at that moment. */
export interface Evaluation {
  id?: number;
  ts: number;
  key: string;
  oracleId: string;
  lset: string;
  printingId: string;
  user: number;
  actual: number;
  gihWr: number;
  gih: number;
  mean: number;
  sd: number;
  n: number;
  rank: number;
  z: number;
  alsa: number | null;
  ata: number | null;
  crowd: CrowdClass | null;
  dataDate: string;
  source: DataSource;
  format: string;
  mode: Mode;
  reason: SelectionReason;
  prob: number;
  filter: string;
  rtMs: number;
  firstLook: boolean;
  /** Uniformly sampled (Random mode or an Adaptive probe): counts toward headline first-look metrics. */
  uniform: boolean;
  sessionId: string;
  seq: number;
  drillId?: string;
}

/** Scryfall-searchable snapshot of an evaluated card, so history stays filterable after rotation. */
export interface CardSnapshot {
  id: string;
  lset: string;
  printing: Printing;
  tags: string[];
  bonus: string | null;
  col: string;
  crowd: CrowdClass | null;
  updatedAt: number;
}

export interface Exposure {
  oracleId: string;
  firstAt: number;
  via: 'reveal' | 'contrast' | 'list' | 'compare';
  count: number;
}

export interface SchedItem {
  key: string;
  oracleId: string;
  lastTrial: number;
  lastTs: number;
  dueTrial: number | null;
  dueTs: number | null;
  step: number;
  streak: number;
  lapses: number;
  retired: boolean;
  lastRt: number;
  lastErr: number;
  seen: number;
}

export interface Session {
  id: string;
  startedAt: number;
  endedAt: number | null;
  length: number;
  mode: Mode;
  filter: string;
  done: number;
  drillId?: string;
  /** Planned keys still to show, for resuming after the app is closed. */
  queue: string[];
  current: string | null;
  summarySeen: boolean;
}

export interface SavedFilter {
  id?: number;
  name: string;
  query: string;
  createdAt: number;
}

export interface Skip {
  id?: number;
  ts: number;
  key: string;
  reason: 'image' | 'unreadable' | 'other';
  sessionId: string;
}

export interface Drill {
  id: string;
  facetId: string;
  label: string;
  query: string;
  startedAt: number;
  endedAt: number | null;
  target: number;
  done: number;
  /** Shrunken pre-drill facet effect (steps) and its standard error. */
  preEffect: number;
  preSe: number;
  sessionId: string;
  mastered: boolean;
}

/** One compare-mode pick: which of two same-set cards has the higher GIH WR. */
export interface CompareRecord {
  id?: number;
  ts: number;
  lset: string;
  format: string;
  dataDate: string;
  left: string;
  right: string;
  leftOracle: string;
  rightOracle: string;
  leftWr: number;
  rightWr: number;
  leftN: number;
  rightN: number;
  leftG: number;
  rightG: number;
  pick: 'left' | 'right';
  correct: boolean;
  level: number;
  z: number;
  rtMs: number;
  filter: string;
}

export interface ApiCacheEntry {
  k: string;
  ts: number;
  ids: string[];
  warnings: string[];
}
