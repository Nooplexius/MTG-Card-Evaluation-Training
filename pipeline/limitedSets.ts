import type { ScryCard, ScrySet } from './inputs/scryfall.ts';

export interface SetConfigEntry {
  arenaRelease?: string;
  format?: string;
  covers?: string[];
  extraBonus?: string[];
  scryfall?: string;
  cardsCsv?: string[];
}

export interface SetsConfig {
  defaultFormat: string;
  sets: Record<string, SetConfigEntry>;
  eventTypes: string[];
}

export interface LimitedSet {
  code: string;
  name: string;
  format: string;
  configRelease: string | null;
  /** Main Scryfall set code. */
  main: string;
  /** Bonus-sheet Scryfall codes drafted inside this set (children by parent_set_code plus configured extras). */
  bonus: string[];
  /** Release date of the main Scryfall set. */
  released: string | null;
  /** Set when a Special Guests wave was released the same day as the main set; those printings belong to it. */
  spgDate: string | null;
  /** Codes whose printings may be display printings, in preference order. */
  displayCodes: string[];
  /** 17Lands cards.csv expansions used for the name → MTGA id lookup. */
  cardsCsvCodes: string[];
  /** Standard set codes this limited set represents. */
  covers: string[];
}

/** Child set types that are drafted inside the parent's boosters. Tokens, promos, Alchemy, Commander and art cards are not. */
const BONUS_SET_TYPES = new Set(['masterpiece', 'expansion', 'eternal']);

export function buildLimitedSet(code: string, cfg: SetsConfig, sets: ScrySet[], cards: ScryCard[]): LimitedSet {
  const entry = cfg.sets[code] ?? {};
  const main = (entry.scryfall ?? code).toLowerCase();
  const mainSet = sets.find((s) => s.code === main);
  const children = sets.filter((s) => s.parent_set_code === main && BONUS_SET_TYPES.has(s.set_type)).map((s) => s.code);
  const bonus = [...children, ...(entry.extraBonus ?? []).map((c) => c.toLowerCase())];
  const spgDate = mainSet?.released_at ?? null;
  const hasSpgWave = spgDate !== null && cards.some((c) => c.set === 'spg' && c.released_at === spgDate);
  const displayCodes = [main, ...bonus, ...(hasSpgWave ? ['spg'] : [])];
  const cardsCsvCodes = entry.cardsCsv ?? [main, ...bonus, ...(hasSpgWave ? ['spg'] : [])].map((c) => c.toUpperCase());
  const covers = [code, ...(entry.covers ?? []), ...children.filter((c) => sets.find((s) => s.code === c)?.set_type === 'expansion').map((c) => c.toUpperCase())];
  return {
    code,
    name: mainSet?.name ?? code,
    format: entry.format ?? cfg.defaultFormat,
    configRelease: entry.arenaRelease ?? null,
    main,
    bonus,
    released: mainSet?.released_at ?? null,
    spgDate: hasSpgWave ? spgDate : null,
    displayCodes,
    cardsCsvCodes,
    covers: [...new Set(covers)],
  };
}

/**
 * Maps Standard set codes to Arena limited sets: configured sets map to themselves, configured covers
 * (SPM → OM1) and bonus sheets (parent_set_code, e.g. BIG → OTJ) fold into their limited set.
 */
export function standardToLimited(standardCodes: string[], cfg: SetsConfig, sets: ScrySet[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (limited: string, std: string) => {
    const cur = out.get(limited) ?? [];
    if (!cur.includes(std)) cur.push(std);
    out.set(limited, cur);
  };
  const configured = Object.keys(cfg.sets);
  for (const std of standardCodes) {
    if (configured.includes(std)) {
      add(std, std);
      continue;
    }
    const cover = configured.find((c) => (cfg.sets[c].covers ?? []).includes(std));
    if (cover) {
      add(cover, std);
      continue;
    }
    const parent = sets.find((s) => s.code === std.toLowerCase())?.parent_set_code?.toUpperCase();
    if (parent && (configured.includes(parent) || standardCodes.includes(parent))) {
      add(parent, std);
      continue;
    }
    add(std, std);
  }
  return out;
}
