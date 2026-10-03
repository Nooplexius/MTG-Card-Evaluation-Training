import { createReadStream, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { cachedJson, downloadOnce, SharedInputError } from './http.ts';

export const SCRYFALL_HEADERS = { 'User-Agent': 'Loupe/1.0', Accept: 'application/json' };

/** The subset of a Scryfall card object the pipeline reads. Other fields pass through untouched. */
export interface ScryCard {
  id: string;
  oracle_id?: string;
  name: string;
  printed_name?: string;
  lang: string;
  layout: string;
  set: string;
  set_type: string;
  collector_number: string;
  released_at: string;
  rarity: string;
  arena_id?: number;
  booster?: boolean;
  promo?: boolean;
  variation?: boolean;
  digital?: boolean;
  border_color?: string;
  frame_effects?: string[];
  full_art?: boolean;
  type_line?: string;
  legalities?: Record<string, string>;
  card_faces?: Array<Record<string, unknown> & { name: string; printed_name?: string; oracle_id?: string; image_uris?: Record<string, string> }>;
  image_uris?: Record<string, string>;
  [k: string]: unknown;
}

export interface ScrySet {
  code: string;
  name: string;
  set_type: string;
  parent_set_code?: string;
  released_at?: string;
  card_count: number;
  digital: boolean;
}

export interface OracleTag {
  id: string;
  slug: string;
  label: string;
  parent_ids: string[];
  child_ids: string[];
  aliases: string[];
  taggings: Array<{ oracle_id: string; weight?: string }>;
}

interface BulkEntry {
  type: string;
  updated_at: string;
  jsonl_download_uri?: string;
  download_uri?: string;
  compressed_size?: number;
}

export async function bulkIndex(cacheDir: string, offline: boolean): Promise<BulkEntry[]> {
  const idx = await cachedJson<{ data: BulkEntry[] }>('https://api.scryfall.com/bulk-data', join(cacheDir, 'bulk-data.json'), SCRYFALL_HEADERS, 6, offline);
  if (!Array.isArray(idx.data)) throw new SharedInputError('Scryfall bulk-data index has no data array');
  return idx.data;
}

/** Downloads (or reuses) a bulk file and returns its local path. */
export async function bulkFile(type: 'default_cards' | 'oracle_tags', cacheDir: string, offline: boolean): Promise<string> {
  if (offline) {
    const prefix = type === 'default_cards' ? 'default-cards' : 'oracle-tags';
    const files = existsSync(cacheDir) ? readdirSync(cacheDir).filter((f) => f.startsWith(prefix) && f.endsWith('.jsonl.gz')).sort() : [];
    if (files.length === 0) throw new SharedInputError(`Offline and no cached Scryfall ${type} file in ${cacheDir}`);
    return join(cacheDir, files[files.length - 1]);
  }
  const idx = await bulkIndex(cacheDir, offline);
  const entry = idx.find((e) => e.type === type);
  const uri = entry?.jsonl_download_uri;
  if (!entry || !uri) throw new SharedInputError(`Scryfall bulk-data index has no jsonl_download_uri for ${type}`);
  const fileName = uri.split('/').pop() as string;
  return downloadOnce(uri, join(cacheDir, fileName), { 'User-Agent': SCRYFALL_HEADERS['User-Agent'] });
}

export async function* readJsonl<T>(path: string): AsyncGenerator<T> {
  const stream = path.endsWith('.gz') ? createReadStream(path).pipe(createGunzip()) : createReadStream(path);
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim();
    if (t === '' || t === '[' || t === ']') continue;
    yield JSON.parse(t.endsWith(',') ? t.slice(0, -1) : t) as T;
  }
}

export async function loadCards(path: string, keep: (c: ScryCard) => boolean): Promise<ScryCard[]> {
  const out: ScryCard[] = [];
  let total = 0;
  for await (const c of readJsonl<ScryCard>(path)) {
    total++;
    if (keep(c)) out.push(c);
  }
  if (total < 10000) throw new SharedInputError(`Scryfall default_cards looks truncated (${total} cards)`);
  return out;
}

export async function loadOracleTags(path: string): Promise<OracleTag[]> {
  const out: OracleTag[] = [];
  for await (const t of readJsonl<OracleTag & { type?: string }>(path)) {
    if (t.type && t.type !== 'oracle') continue;
    out.push({ id: t.id, slug: t.slug, label: t.label, parent_ids: t.parent_ids ?? [], child_ids: t.child_ids ?? [], aliases: t.aliases ?? [], taggings: t.taggings ?? [] });
  }
  if (out.length < 500) throw new SharedInputError(`Scryfall oracle_tags looks truncated (${out.length} tags)`);
  return out;
}

export async function loadSets(cacheDir: string, offline: boolean): Promise<ScrySet[]> {
  const resp = await cachedJson<{ data: ScrySet[] }>('https://api.scryfall.com/sets', join(cacheDir, 'sets.json'), SCRYFALL_HEADERS, 12, offline);
  if (!Array.isArray(resp.data) || resp.data.length < 100) throw new SharedInputError('Scryfall /sets returned too few sets');
  return resp.data;
}

export function frontName(c: { name: string; card_faces?: Array<{ name: string }> }): string {
  return c.card_faces?.[0]?.name ?? c.name.split(' // ')[0];
}

export function frontPrintedName(c: ScryCard): string | undefined {
  return (c.card_faces?.[0]?.printed_name as string | undefined) ?? c.printed_name;
}

export function oracleIdOf(c: ScryCard): string | undefined {
  return c.oracle_id ?? (c.card_faces?.[0]?.oracle_id as string | undefined);
}
