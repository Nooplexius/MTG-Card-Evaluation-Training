import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { ApiCardResponse } from '../../pipeline/exports/normalizeApi.ts';
import { indexCardsCsv, parseCardsCsv } from '../../pipeline/inputs/cardsCsv.ts';
import type { OracleTag, ScryCard, ScrySet } from '../../pipeline/inputs/scryfall.ts';
import type { FiltersResponse } from '../../pipeline/inputs/seventeen.ts';
import type { WisResponse } from '../../pipeline/inputs/standard.ts';
import type { SetsConfig } from '../../pipeline/limitedSets.ts';
import type { PipelineConfig } from '../../pipeline/compute.ts';

export const ROOT = resolve(import.meta.dirname, '../..');
export const FIX = join(ROOT, 'tests/fixtures');

const gzJsonl = <T>(p: string): T[] =>
  gunzipSync(readFileSync(p))
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T);

export interface Fixtures {
  cards: ScryCard[];
  tags: OracleTag[];
  scrySets: ScrySet[];
  cardsCsv: Map<string, Map<string, number[]>>;
  wis: WisResponse;
  filters: FiltersResponse;
  tla: ApiCardResponse;
  om1: ApiCardResponse;
  setsCfg: SetsConfig;
  pipeline: PipelineConfig;
  keywords: string[];
}

let cached: Fixtures | null = null;

export function fixtures(): Fixtures {
  if (cached) return cached;
  const json = <T>(p: string): T => JSON.parse(readFileSync(join(FIX, p), 'utf8')) as T;
  cached = {
    cards: gzJsonl<ScryCard>(join(FIX, 'scryfall/cards.jsonl.gz')),
    tags: gzJsonl<OracleTag>(join(FIX, 'scryfall/oracle-tags.jsonl.gz')),
    scrySets: (JSON.parse(gunzipSync(readFileSync(join(FIX, 'scryfall/sets.json.gz'))).toString('utf8')) as { data: ScrySet[] }).data,
    cardsCsv: indexCardsCsv(parseCardsCsv(readFileSync(join(FIX, '17lands/cards.csv'), 'utf8'))),
    wis: json<WisResponse>('wis-standard.json'),
    filters: json<FiltersResponse>('17lands/filters.json'),
    tla: json<ApiCardResponse>('17lands/card_data_TLA_PremierDraft.json'),
    om1: json<ApiCardResponse>('17lands/card_data_OM1_PickTwoDraft.json'),
    setsCfg: JSON.parse(readFileSync(join(ROOT, 'data/config/sets.json'), 'utf8')) as SetsConfig,
    pipeline: JSON.parse(readFileSync(join(ROOT, 'data/config/pipeline.json'), 'utf8')) as PipelineConfig,
    keywords: json<string[]>('scryfall/keywords.json'),
  };
  return cached;
}
