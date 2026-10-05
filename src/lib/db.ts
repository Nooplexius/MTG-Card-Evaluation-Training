import Dexie, { type EntityTable } from 'dexie';
import type { ApiCacheEntry, CardSnapshot, CompareRecord, Drill, Evaluation, Exposure, SavedFilter, SchedItem, Session, Skip } from './types.ts';

export const DB_NAME = 'loupe';
export const SCHEMA_VERSION = 2;

export interface Setting {
  key: string;
  value: unknown;
}

export type LoupeDB = Dexie & {
  evaluations: EntityTable<Evaluation, 'id'>;
  cards: EntityTable<CardSnapshot, 'id'>;
  exposures: EntityTable<Exposure, 'oracleId'>;
  sched: EntityTable<SchedItem, 'key'>;
  sessions: EntityTable<Session, 'id'>;
  filters: EntityTable<SavedFilter, 'id'>;
  settings: EntityTable<Setting, 'key'>;
  skips: EntityTable<Skip, 'id'>;
  drills: EntityTable<Drill, 'id'>;
  apiCache: EntityTable<ApiCacheEntry, 'k'>;
  compares: EntityTable<CompareRecord, 'id'>;
};

/** Schema history. Add a new version (never edit an old one) and migrate in its upgrade(). */
export function openDb(name = DB_NAME): LoupeDB {
  const db = new Dexie(name) as LoupeDB;
  db.version(1).stores({
    evaluations: '++id, ts, key, oracleId, lset, sessionId, mode, firstLook, drillId',
    cards: 'id, lset',
    exposures: 'oracleId',
    sched: 'key, oracleId',
    sessions: 'id, startedAt',
    filters: '++id, name',
    settings: 'key',
    skips: '++id, ts, key',
    drills: 'id, startedAt, facetId',
    apiCache: 'k, ts',
  });
  db.version(2).stores({ compares: '++id, ts, lset' });
  return db;
}

let shared: LoupeDB | null = null;
export function db(): LoupeDB {
  if (!shared) shared = openDb();
  return shared;
}

export const EXPORT_TABLES = ['evaluations', 'cards', 'exposures', 'sched', 'sessions', 'filters', 'settings', 'skips', 'drills', 'compares'] as const;

export interface Backup {
  app: 'loupe';
  schema: number;
  exportedAt: string;
  tables: Record<(typeof EXPORT_TABLES)[number], unknown[]>;
}

export async function exportBackup(d: LoupeDB = db()): Promise<Backup> {
  const tables = {} as Backup['tables'];
  for (const t of EXPORT_TABLES) tables[t] = await d.table(t).toArray();
  return { app: 'loupe', schema: SCHEMA_VERSION, exportedAt: new Date().toISOString(), tables };
}

/** Replaces all local data with a backup. Older schema versions are accepted and migrated by Dexie on next open. */
export async function importBackup(b: unknown, d: LoupeDB = db()): Promise<{ evaluations: number }> {
  const backup = b as Backup;
  if (!backup || backup.app !== 'loupe' || typeof backup.schema !== 'number' || !backup.tables) throw new Error('This file is not a Loupe backup.');
  if (backup.schema > SCHEMA_VERSION) throw new Error('This backup comes from a newer version of Loupe. Update the app and try again.');
  await d.transaction('rw', EXPORT_TABLES.map((t) => d.table(t)), async () => {
    for (const t of EXPORT_TABLES) {
      await d.table(t).clear();
      const rows = backup.tables[t] ?? [];
      if (rows.length > 0) await d.table(t).bulkPut(rows);
    }
  });
  return { evaluations: (backup.tables.evaluations ?? []).length };
}

export async function getSetting<T>(key: string, fallback: T, d: LoupeDB = db()): Promise<T> {
  const row = await d.settings.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function setSetting(key: string, value: unknown, d: LoupeDB = db()): Promise<void> {
  await d.settings.put({ key, value });
}
