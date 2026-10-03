/**
 * Extracts pinned test fixtures from the local cache of live inputs (.cache/), so tests and CI never hit the network.
 * Run after `npm run data` has populated .cache/: `npx tsx scripts/make-fixtures.ts`.
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { readJsonl, type OracleTag, type ScryCard } from '../pipeline/inputs/scryfall.ts';
import { parseCsv, toCsv } from '../pipeline/exports/csv.ts';

const ROOT = resolve(import.meta.dirname, '..');
const CACHE = join(ROOT, '.cache');
const OUT = join(ROOT, 'tests/fixtures');

export const FIXTURE_SETS = ['tla', 'tle', 'om1', 'omb', 'spm', 'tmt', 'pza', 'otj', 'big', 'otp', 'mkm', 'dsk', 'spg', 'fra'];
const CSV_EXPANSIONS = new Set(['TLA', 'TLE', 'SPM', 'OMB', 'TMT', 'PZA', 'OTJ', 'BIG', 'OTP', 'MKM', 'DSK', 'SPG', 'FRA']);

const DROP = new Set([
  'object', 'uri', 'scryfall_uri', 'rulings_uri', 'prints_search_uri', 'related_uris', 'purchase_uris', 'prices', 'multiverse_ids',
  'mtgo_id', 'mtgo_foil_id', 'tcgplayer_id', 'tcgplayer_etched_id', 'cardmarket_id', 'set_uri', 'set_search_uri', 'scryfall_set_uri',
  'set_id', 'card_back_id', 'artist_ids', 'illustration_id', 'highres_image', 'preview', 'all_parts',
]);

function trimImages(u: Record<string, string> | undefined): Record<string, string> | undefined {
  return u?.display ? { display: u.display } : u;
}

function trim(c: ScryCard): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) if (!DROP.has(k)) out[k] = v;
  if (c.image_uris) out.image_uris = trimImages(c.image_uris);
  if (c.card_faces) {
    out.card_faces = c.card_faces.map((f) => {
      const g: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(f)) if (!['object', 'artist_id', 'illustration_id'].includes(k)) g[k] = v;
      if (f.image_uris) g.image_uris = trimImages(f.image_uris as Record<string, string>);
      return g;
    });
  }
  return out;
}

async function main() {
  mkdirSync(join(OUT, 'scryfall'), { recursive: true });
  mkdirSync(join(OUT, '17lands'), { recursive: true });
  const scryDir = join(CACHE, 'scryfall');
  const cardsFile = readdirSync(scryDir).filter((f) => f.startsWith('default-cards') && f.endsWith('.jsonl.gz')).sort().pop() as string;
  const tagsFile = readdirSync(scryDir).filter((f) => f.startsWith('oracle-tags') && f.endsWith('.jsonl.gz')).sort().pop() as string;
  const keep: string[] = [];
  const oracles = new Set<string>();
  for await (const c of readJsonl<ScryCard>(join(scryDir, cardsFile))) {
    if (c.lang !== 'en' || !FIXTURE_SETS.includes(c.set)) continue;
    keep.push(JSON.stringify(trim(c)));
    const o = c.oracle_id ?? (c.card_faces?.[0]?.oracle_id as string | undefined);
    if (o) oracles.add(o);
  }
  writeFileSync(join(OUT, 'scryfall/cards.jsonl.gz'), gzipSync(keep.join('\n')));
  const tags: string[] = [];
  for await (const t of readJsonl<OracleTag>(join(scryDir, tagsFile))) {
    tags.push(JSON.stringify({ id: t.id, slug: t.slug, label: t.label, type: 'oracle', parent_ids: t.parent_ids, child_ids: t.child_ids, aliases: t.aliases, taggings: t.taggings.filter((x) => oracles.has(x.oracle_id)).map((x) => ({ oracle_id: x.oracle_id })) }));
  }
  writeFileSync(join(OUT, 'scryfall/oracle-tags.jsonl.gz'), gzipSync(tags.join('\n')));
  const sets = JSON.parse(readFileSync(join(scryDir, 'sets.json'), 'utf8')) as { data: Array<Record<string, unknown>> };
  const slim = sets.data.map((s) => ({ code: s.code, name: s.name, set_type: s.set_type, parent_set_code: s.parent_set_code, released_at: s.released_at, card_count: s.card_count, digital: s.digital }));
  writeFileSync(join(OUT, 'scryfall/sets.json.gz'), gzipSync(JSON.stringify({ data: slim })));
  const csv = parseCsv(readFileSync(join(CACHE, '17lands/cards.csv'), 'utf8'));
  const expCol = csv[0].indexOf('expansion');
  const sub = [csv[0], ...csv.slice(1).filter((r) => CSV_EXPANSIONS.has(r[expCol]))];
  writeFileSync(join(OUT, '17lands/cards.csv'), toCsv(sub, false));
  copyFileSync(join(CACHE, 'wis-standard.json'), join(OUT, 'wis-standard.json'));
  for (const f of ['filters.json', 'card_data_TLA_PremierDraft.json', 'card_data_OM1_PickTwoDraft.json']) copyFileSync(join(CACHE, '17lands/dev', f), join(OUT, '17lands', f));
  console.log(`cards: ${keep.length}, tags: ${tags.length}, csv rows: ${sub.length - 1}`);
}

main();
