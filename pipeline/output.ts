import type { Face, Printing } from '../src/lib/card.ts';
import type { CardStatsOut, PoolCard, SetFile } from '../src/lib/data.ts';
import { DATA_SCHEMA } from '../src/lib/data.ts';
import { gradeIndexFor, gradePopulation, zScore } from '../src/lib/grades.ts';
import { colorContext, competitionRanks, crowdGaps } from '../src/lib/setstats.ts';
import type { OracleTag, ScryCard } from './inputs/scryfall.ts';
import type { JoinMatch } from './join.ts';
import type { SeventeenData, SeventeenRow } from './types.ts';

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const strArr = (v: unknown): string[] | undefined => (Array.isArray(v) ? (v as string[]) : undefined);

function imageVersion(c: ScryCard): string | undefined {
  const uri = c.image_uris?.display ?? c.image_uris?.normal ?? c.card_faces?.[0]?.image_uris?.display ?? c.card_faces?.[0]?.image_uris?.normal;
  if (!uri) return undefined;
  const q = uri.indexOf('?');
  return q >= 0 ? uri.slice(q + 1) : undefined;
}

function toFace(f: Record<string, unknown>): Face {
  const out: Face = { name: f.name as string };
  const keys: Array<keyof Face> = ['printed_name', 'flavor_name', 'mana_cost', 'type_line', 'printed_type_line', 'oracle_text', 'printed_text', 'flavor_text', 'power', 'toughness', 'loyalty', 'defense', 'artist', 'watermark', 'layout'];
  for (const k of keys) {
    const v = str(f[k]);
    if (v !== undefined) (out as unknown as Record<string, unknown>)[k] = v;
  }
  if (typeof f.cmc === 'number') out.cmc = f.cmc;
  const colors = strArr(f.colors);
  if (colors) out.colors = colors;
  const ind = strArr(f.color_indicator);
  if (ind) out.color_indicator = ind;
  if (f.image_uris) out.img = true;
  return out;
}

/** Keeps every Scryfall-searchable field; drops links, prices, purchase URIs and other unsearchable data. */
export function toPrinting(c: ScryCard, setName: string): Printing {
  const legalities: Record<string, string> = {};
  for (const [fmt, v] of Object.entries(c.legalities ?? {})) if (v !== 'not_legal') legalities[fmt] = v;
  const p: Printing = {
    id: c.id,
    oracle_id: (c.oracle_id ?? (c.card_faces?.[0]?.oracle_id as string)) as string,
    name: c.name,
    lang: c.lang,
    released_at: c.released_at,
    layout: c.layout,
    cmc: typeof c.cmc === 'number' ? c.cmc : 0,
    type_line: (c.type_line as string) ?? c.card_faces?.map((f) => f.type_line).join(' // ') ?? '',
    color_identity: (c.color_identity as string[]) ?? [],
    keywords: (c.keywords as string[]) ?? [],
    legalities,
    games: (c.games as string[]) ?? [],
    reserved: Boolean(c.reserved),
    foil: Boolean(c.foil),
    nonfoil: Boolean(c.nonfoil),
    finishes: (c.finishes as string[]) ?? [],
    oversized: Boolean(c.oversized),
    promo: Boolean(c.promo),
    reprint: Boolean(c.reprint),
    variation: Boolean(c.variation),
    set: c.set,
    set_name: (c.set_name as string) ?? setName,
    set_type: c.set_type,
    collector_number: c.collector_number,
    digital: Boolean(c.digital),
    rarity: c.rarity,
    border_color: (c.border_color as string) ?? 'black',
    frame: (c.frame as string) ?? '',
    full_art: Boolean(c.full_art),
    textless: Boolean(c.textless),
    booster: Boolean(c.booster),
    story_spotlight: Boolean(c.story_spotlight),
  };
  const optStr: Array<keyof Printing> = ['printed_name', 'flavor_name', 'mana_cost', 'printed_type_line', 'oracle_text', 'printed_text', 'flavor_text', 'power', 'toughness', 'loyalty', 'defense', 'artist', 'security_stamp', 'watermark', 'image_status'];
  for (const k of optStr) {
    const v = str(c[k]);
    if (v !== undefined) (p as unknown as Record<string, unknown>)[k] = v;
  }
  for (const k of ['colors', 'color_indicator', 'produced_mana', 'promo_types', 'frame_effects'] as const) {
    const v = strArr(c[k]);
    if (v) (p as unknown as Record<string, unknown>)[k] = v;
  }
  if (c.game_changer === true) p.game_changer = true;
  if (typeof c.edhrec_rank === 'number') p.edhrec_rank = c.edhrec_rank;
  if (typeof c.penny_rank === 'number') p.penny_rank = c.penny_rank;
  if (c.card_faces && c.card_faces.length > 0) p.card_faces = c.card_faces.map((f) => toFace(f));
  const v = imageVersion(c);
  if (v) p.image_version = v;
  return p;
}

export interface TagIndex {
  slugs: string[];
  labels: string[];
  indexOf: Map<string, number>;
  /** oracle_id → closed tag ids */
  byOracle: Map<string, Set<string>>;
  byId: Map<string, OracleTag>;
}

/** Each oracle card's tags closed over ancestors, so otag:X matches X and every descendant of X. */
export function buildTagIndex(tags: OracleTag[], oracleIds: Set<string>): TagIndex {
  const byId = new Map(tags.map((t) => [t.id, t] as const));
  const ancestors = new Map<string, Set<string>>();
  const closure = (id: string, stack: Set<string> = new Set()): Set<string> => {
    const memo = ancestors.get(id);
    if (memo) return memo;
    const out = new Set<string>([id]);
    if (!stack.has(id)) {
      stack.add(id);
      for (const p of byId.get(id)?.parent_ids ?? []) for (const a of closure(p, stack)) out.add(a);
      stack.delete(id);
    }
    ancestors.set(id, out);
    return out;
  };
  const byOracle = new Map<string, Set<string>>();
  for (const t of tags) {
    for (const tg of t.taggings) {
      if (!oracleIds.has(tg.oracle_id)) continue;
      let s = byOracle.get(tg.oracle_id);
      if (!s) byOracle.set(tg.oracle_id, (s = new Set()));
      for (const a of closure(t.id)) s.add(a);
    }
  }
  const used = new Set<string>();
  for (const s of byOracle.values()) for (const id of s) used.add(id);
  const sorted = [...used].map((id) => byId.get(id)).filter((t): t is OracleTag => !!t).sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const slugs = sorted.map((t) => t.slug);
  const labels = sorted.map((t) => t.label);
  const indexOf = new Map(sorted.map((t, i) => [t.id, i] as const));
  return { slugs, labels, indexOf, byOracle, byId };
}

function statsOut(r: SeventeenRow): CardStatsOut {
  const o: CardStatsOut = { gihWr: r.gihWr as number, gih: r.gih ?? 0 };
  const keys: Array<keyof CardStatsOut> = ['ohWr', 'oh', 'gdWr', 'gd', 'gnsWr', 'gns', 'iih', 'alsa', 'ata', 'gpWr', 'gp', 'gpPct', 'seen', 'picked'];
  for (const k of keys) {
    const v = r[k as keyof SeventeenRow];
    if (typeof v === 'number' && Number.isFinite(v)) (o as unknown as Record<string, number>)[k] = v;
  }
  return o;
}

export interface JoinedRow {
  row: SeventeenRow;
  match: JoinMatch;
}

/** Grades, ranks, crowd gap and color context over the set's graded cards; ungraded cards are left out of the pool. */
export function buildSetFile(args: {
  code: string;
  name: string;
  format: string;
  data: SeventeenData;
  joined: JoinedRow[];
  setNames: Map<string, string>;
  tags: TagIndex;
  minGraded: number;
}): { file: SetFile; graded: number } | { file: null; graded: number } {
  const graded = args.joined.filter((j) => typeof j.row.gihWr === 'number');
  const pop = gradePopulation(
    args.data.rows.map((r) => r.gihWr),
    args.minGraded,
  );
  if (!pop) return { file: null, graded: graded.length };
  const population = args.data.rows.filter((r) => typeof r.gihWr === 'number');
  const ranks = competitionRanks(population.map((r) => r.gihWr as number));
  const crowd = crowdGaps(population.map((r) => ({ gihWr: r.gihWr as number, alsa: r.alsa })));
  const perRow = new Map(population.map((r, i) => [r, { rank: ranks[i], crowd: crowd[i] }] as const));
  const ctx = colorContext(population.map((r) => ({ color: r.color, gihWr: r.gihWr as number })));
  const cards: PoolCard[] = graded.map((j) => {
    const wr = j.row.gihWr as number;
    const pr = perRow.get(j.row);
    if (!pr) throw new Error(`Row ${j.row.name} is not in the grade population`);
    const tagIds = args.tags.byOracle.get(j.match.oracleId) ?? new Set<string>();
    const t = [...tagIds].map((id) => args.tags.indexOf.get(id)).filter((x): x is number => x !== undefined).sort((a, b) => a - b);
    return {
      o: j.match.oracleId,
      p: toPrinting(j.match.display, args.setNames.get(j.match.display.set) ?? ''),
      s: statsOut(j.row),
      g: gradeIndexFor(wr, pop),
      z: Math.round(zScore(wr, pop) * 10000) / 10000,
      r: pr.rank,
      cg: pr.crowd.gap === null ? null : Math.round(pr.crowd.gap),
      c: pr.crowd.crowd,
      b: j.match.bonus,
      t,
      col: j.row.color,
    };
  });
  cards.sort((a, b) => a.r - b.r || (a.p.name < b.p.name ? -1 : 1));
  return {
    graded: graded.length,
    file: {
      schema: DATA_SCHEMA,
      code: args.code,
      name: args.name,
      format: args.format,
      dataDate: args.data.date,
      source: args.data.kind === 'snapshot' ? 'fetch' : args.data.kind === 'synthetic' ? 'synthetic' : 'export',
      precision: args.data.precision,
      n: pop.n,
      mean: pop.mean,
      sd: pop.sd,
      groups: args.data.groups,
      colorContext: ctx,
      cards,
    },
  };
}
