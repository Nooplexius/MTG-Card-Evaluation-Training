import { frontName, frontPrintedName, oracleIdOf, type ScryCard } from './inputs/scryfall.ts';
import { normName } from './inputs/cardsCsv.ts';
import type { LimitedSet } from './limitedSets.ts';
import type { SeventeenRow } from './types.ts';

export interface JoinIndex {
  byArenaId: Map<number, ScryCard>;
  bySet: Map<string, ScryCard[]>;
  byOracle: Map<string, ScryCard[]>;
  /** Normalized exact or front-face name → printings that are on Arena (have an arena_id). */
  arenaByName: Map<string, ScryCard[]>;
  cardsCsv: Map<string, Map<string, number[]>>;
  /** Set code → name key (name, front-face name, printed_name) → printings. */
  namesBySet: Map<string, Map<string, ScryCard[]>>;
}

export function buildJoinIndex(cards: ScryCard[], cardsCsv: Map<string, Map<string, number[]>>): JoinIndex {
  const byArenaId = new Map<number, ScryCard>();
  const bySet = new Map<string, ScryCard[]>();
  const byOracle = new Map<string, ScryCard[]>();
  const arenaByName = new Map<string, ScryCard[]>();
  const namesBySet = new Map<string, Map<string, ScryCard[]>>();
  const push = <K>(m: Map<K, ScryCard[]>, k: K, c: ScryCard) => {
    const cur = m.get(k);
    if (cur) cur.push(c);
    else m.set(k, [c]);
  };
  for (const c of cards) {
    if (c.lang !== 'en') continue;
    if (typeof c.arena_id === 'number' && !byArenaId.has(c.arena_id)) byArenaId.set(c.arena_id, c);
    push(bySet, c.set, c);
    const o = oracleIdOf(c);
    if (o) push(byOracle, o, c);
    if (typeof c.arena_id === 'number') {
      const names = new Set([normName(c.name), normName(frontName(c))]);
      for (const n of names) push(arenaByName, n, c);
    }
    let m = namesBySet.get(c.set);
    if (!m) namesBySet.set(c.set, (m = new Map()));
    for (const k of new Set(nameKeys(c))) push(m, k, c);
  }
  return { byArenaId, bySet, byOracle, arenaByName, cardsCsv, namesBySet };
}

export type JoinStep = 1 | 2 | 3;

export interface JoinMatch {
  matched: ScryCard;
  display: ScryCard;
  oracleId: string;
  step: JoinStep;
  /** Bonus-sheet code when the display printing is outside the main set. */
  bonus: string | null;
}

const VARIANT_EFFECTS = new Set(['showcase', 'extendedart', 'inverted', 'etched', 'fullart', 'borderless', 'textless']);

function printingScore(c: ScryCard): number {
  let s = 0;
  if (c.booster) s += 8;
  if (c.promo) s -= 6;
  if (c.border_color === 'borderless') s -= 4;
  if ((c.frame_effects ?? []).some((f) => VARIANT_EFFECTS.has(f))) s -= 3;
  if (c.full_art && !/\bLand\b/.test(c.type_line ?? '')) s -= 2;
  if (c.variation) s -= 1;
  if (!/^\d+$/.test(c.collector_number)) s -= 1;
  return s;
}

function cnValue(c: ScryCard): number {
  const m = /^(\d+)/.exec(c.collector_number);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

/** The regular version of an oracle card within one Scryfall set. */
export function regularPrinting(cands: ScryCard[]): ScryCard {
  return [...cands].sort((a, b) => printingScore(b) - printingScore(a) || cnValue(a) - cnValue(b) || (a.id < b.id ? -1 : 1))[0];
}

function inCode(c: ScryCard, code: string, ls: LimitedSet): boolean {
  if (c.set !== code) return false;
  if (code === 'spg') return ls.spgDate !== null && c.released_at === ls.spgDate;
  return true;
}

/**
 * The printing drafted in this limited set: the regular version in the matched printing's set when that set
 * belongs to the limited set, else the first display code holding the oracle card (OM1 prefers om1 over spm).
 */
export function displayPrinting(matched: ScryCard, ls: LimitedSet, idx: JoinIndex): { display: ScryCard; bonus: string | null } {
  const oracle = oracleIdOf(matched);
  const printings = oracle ? (idx.byOracle.get(oracle) ?? [matched]) : [matched];
  let code = ls.displayCodes.find((cd) => inCode(matched, cd, ls));
  if (!code) code = ls.displayCodes.find((cd) => printings.some((p) => inCode(p, cd, ls)));
  if (!code) return { display: matched, bonus: matched.set === ls.main ? null : matched.set };
  const inSet = printings.filter((p) => inCode(p, code as string, ls));
  return { display: regularPrinting(inSet), bonus: code === ls.main ? null : code };
}

function nameKeys(c: ScryCard): string[] {
  const keys = [normName(c.name), normName(frontName(c))];
  const pn = frontPrintedName(c);
  if (pn) keys.push(normName(pn));
  if (c.printed_name) keys.push(normName(c.printed_name));
  return keys;
}

/** Step 1: MTGA id (fetched rows) or cards.csv name lookup within the set's expansions → Scryfall arena_id. */
function step1(row: SeventeenRow, ls: LimitedSet, idx: JoinIndex): ScryCard | null {
  const ids: number[] = [];
  if (typeof row.mtgaId === 'number') ids.push(row.mtgaId);
  else {
    const key = normName(row.name);
    for (const exp of ls.cardsCsvCodes) {
      const hit = idx.cardsCsv.get(exp.toUpperCase())?.get(key);
      if (hit) ids.push(...hit);
    }
  }
  const found = ids.map((id) => idx.byArenaId.get(id)).filter((c): c is ScryCard => c !== undefined);
  if (found.length === 0) return null;
  return found.find((c) => ls.displayCodes.some((cd) => inCode(c, cd, ls))) ?? found[0];
}

/** Step 2: name, front-face name or printed_name within the set's Scryfall codes. */
function step2(row: SeventeenRow, ls: LimitedSet, idx: JoinIndex): ScryCard | null {
  const key = normName(row.name);
  for (const code of ls.displayCodes) {
    const hits = (idx.namesBySet.get(code)?.get(key) ?? []).filter((c) => inCode(c, code, ls));
    if (hits.length > 0) return regularPrinting(hits);
  }
  return null;
}

/** Step 3: exact name or front-face name among Arena printings anywhere (cross-set bonus sheets such as SPG and OMB). */
function step3(row: SeventeenRow, ls: LimitedSet, idx: JoinIndex): ScryCard | null | 'ambiguous' {
  const hits = idx.arenaByName.get(normName(row.name)) ?? [];
  if (hits.length === 0) return null;
  const oracles = new Set(hits.map((h) => oracleIdOf(h)));
  if (oracles.size > 1) return 'ambiguous';
  const sameDayBonus = hits.filter((h) => h.set_type === 'masterpiece' && ls.spgDate !== null && h.released_at === ls.spgDate);
  if (sameDayBonus.length > 0) return regularPrinting(sameDayBonus);
  return [...hits].sort((a, b) => (a.released_at < b.released_at ? 1 : -1))[0];
}

export type JoinOutcome = { ok: true; match: JoinMatch } | { ok: false; reason: string };

export function joinRow(row: SeventeenRow, ls: LimitedSet, idx: JoinIndex, maxStep: JoinStep = 3): JoinOutcome {
  let matched: ScryCard | null = step1(row, ls, idx);
  let step: JoinStep = 1;
  if (!matched && maxStep >= 2) {
    matched = step2(row, ls, idx);
    step = 2;
  }
  if (!matched && maxStep >= 3) {
    const s3 = step3(row, ls, idx);
    if (s3 === 'ambiguous') return { ok: false, reason: `"${row.name}" matches several different Arena cards` };
    matched = s3;
    step = 3;
  }
  if (!matched) return { ok: false, reason: `"${row.name}" has no Scryfall match in ${ls.displayCodes.join(', ')} or on Arena` };
  const oracleId = oracleIdOf(matched);
  if (!oracleId) return { ok: false, reason: `"${row.name}" matched a Scryfall printing without an oracle_id` };
  const { display, bonus } = displayPrinting(matched, ls, idx);
  return { ok: true, match: { matched, display, oracleId, step, bonus } };
}

/** Share of rows matched by the set-specific steps (1 and 2); used to infer which set an export belongs to. */
export function setMatchRate(rows: SeventeenRow[], ls: LimitedSet, idx: JoinIndex): number {
  if (rows.length === 0) return 0;
  let hit = 0;
  for (const r of rows) if (joinRow(r, ls, idx, 2).ok) hit++;
  return hit / rows.length;
}
