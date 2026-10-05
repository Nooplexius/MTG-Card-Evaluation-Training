import type { Printing } from '../card.ts';
import type { CrowdClass } from '../setstats.ts';
import type { Op, TermNode } from './parse.ts';

/** What a query is evaluated against: an entry's display printing plus app-only facts. */
export interface Subject {
  p: Printing;
  lset: string;
  crowd: CrowdClass | null;
  tags: ReadonlySet<string>;
}

export type Pred = (s: Subject) => boolean;

export type Classified = { kind: 'local'; pred: Pred } | { kind: 'api' } | { kind: 'ignore'; warning: string } | { kind: 'noop' };

export interface LocalContext {
  /** Lowercased Scryfall keyword abilities, keyword actions and ability words (kw: accepts only these). */
  keywords: ReadonlySet<string>;
  /** Oracle tag alias → slug. */
  tagAliases: Readonly<Record<string, string>>;
}

/** Scryfall-style color nicknames. */
const NAMED: Record<string, string> = {
  white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G',
  azorius: 'WU', dimir: 'UB', rakdos: 'BR', gruul: 'RG', selesnya: 'GW', orzhov: 'WB', izzet: 'UR', golgari: 'BG', boros: 'RW', simic: 'GU',
  bant: 'GWU', esper: 'WUB', grixis: 'UBR', jund: 'BRG', naya: 'RGW',
  abzan: 'WBG', jeskai: 'URW', sultai: 'BGU', mardu: 'RWB', temur: 'GUR',
  quandrix: 'GU', silverquill: 'WB', witherbloom: 'BG', prismari: 'UR', lorehold: 'RW',
  chaos: 'UBRG', aggression: 'BRGW', altruism: 'RGWU', growth: 'GWUB', artifice: 'WUBR',
};

type ColorValue = { type: 'set'; colors: string[] } | { type: 'count'; n: number } | { type: 'colorless' } | { type: 'multi' };

export function parseColorValue(v: string): ColorValue | null {
  const s = v.toLowerCase();
  if (/^[0-5]$/.test(s)) return { type: 'count', n: Number(s) };
  if (s === 'c' || s === 'colorless') return { type: 'colorless' };
  if (s === 'm' || s === 'multicolor') return { type: 'multi' };
  if (NAMED[s]) return { type: 'set', colors: NAMED[s].split('') };
  if (/^[wubrg]+$/.test(s)) return { type: 'set', colors: [...new Set(s.toUpperCase().split(''))] };
  return null;
}

function cmpSet(have: Set<string>, want: string[], op: Op): boolean {
  const sub = want.every((c) => have.has(c));
  const sup = [...have].every((c) => want.includes(c));
  switch (op) {
    case ':':
    case '>=':
      return sub;
    case '=':
      return sub && sup;
    case '!=':
      return !(sub && sup);
    case '>':
      return sub && have.size > want.length;
    case '<=':
      return sup;
    case '<':
      return sup && have.size < want.length;
  }
}

function cmpNum(a: number, b: number, op: Op): boolean {
  switch (op) {
    case ':':
    case '=':
      return a === b;
    case '!=':
      return a !== b;
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    case '>':
      return a > b;
    case '>=':
      return a >= b;
  }
}

export function foldDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Unquoted name words match with diacritics folded and punctuation and spaces removed (Scryfall: `aangs` finds "Aang's"). */
export function normName(s: string): string {
  return foldDiacritics(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Scryfall counts * (and X) as 0: "*" → 0, "1+*" → 1. */
export function numericStat(v: string | undefined): number | null {
  if (v === undefined || v === '') return null;
  const s = v.replace(/[*xX]/g, '0').replace(/\s/g, '');
  if (!/^[-+]?\d+(\.\d+)?([-+]\d+(\.\d+)?)*$/.test(s)) return null;
  return (s.match(/[-+]?\d+(\.\d+)?/g) ?? []).reduce((a, b) => a + Number(b), 0);
}

interface Derived {
  /** Name and flavor names, lowercased (quoted name phrases). */
  namesLower: string[];
  /** Name and flavor names, normalized (unquoted name words). */
  namesNorm: string[];
  /** Full, face and flavor names, normalized (exact !names). */
  faceNamesNorm: string[];
  /** Card-level colors when present (split cards), else one set per face (transform and modal DFCs). */
  colorSets: Array<Set<string>>;
  identity: Set<string>;
  typeLower: string;
  faceTypes: string[];
  /** Oracle text per face, reminder text removed, lowercased. */
  texts: string[];
  /** Power, toughness and loyalty are multi-valued across faces, as in Scryfall's index. */
  stats: { power: number[]; toughness: number[]; loyalty: number[] };
  keywords: Set<string>;
  costs: string[];
}

const cache = new WeakMap<Printing, Derived>();

const stripReminder = (t: string) =>
  t
    .split('\n')
    .map((line) => line.replace(/\s*\([^()]*\)/g, '').trim())
    .join('\n');

export function derive(p: Printing): Derived {
  let d = cache.get(p);
  if (d) return d;
  const faces = p.card_faces ?? [];
  const multi = faces.length > 0;
  const colorSets = p.colors ? [new Set(p.colors)] : multi ? faces.map((f) => new Set(f.colors ?? [])) : [new Set<string>()];
  const texts = p.oracle_text !== undefined ? [p.oracle_text] : faces.map((f) => f.oracle_text ?? '');
  const statSrc = [p, ...faces];
  const nums = (k: 'power' | 'toughness' | 'loyalty') => statSrc.map((f) => numericStat(f[k])).filter((x): x is number => x !== null);
  const flavor = [p.flavor_name, ...faces.map((f) => f.flavor_name)].filter((x): x is string => typeof x === 'string' && x !== '');
  d = {
    namesLower: [p.name.toLowerCase(), ...flavor.map((x) => x.toLowerCase())],
    namesNorm: [normName(p.name), ...flavor.map(normName)],
    faceNamesNorm: [normName(p.name), ...faces.map((f) => normName(f.name)), ...flavor.map(normName)],
    colorSets,
    identity: new Set(p.color_identity),
    typeLower: (p.type_line ?? '').toLowerCase(),
    faceTypes: multi ? faces.map((f) => f.type_line ?? '') : [p.type_line ?? ''],
    texts: texts.map((t) => stripReminder(t).toLowerCase()),
    stats: { power: nums('power'), toughness: nums('toughness'), loyalty: nums('loyalty') },
    keywords: new Set(p.keywords.map((k) => k.toLowerCase())),
    costs: p.mana_cost !== undefined && p.mana_cost !== '' ? [p.mana_cost] : faces.map((f) => f.mana_cost ?? ''),
  };
  cache.set(p, d);
  return d;
}

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'mythic'];
const RARITY_ALIAS: Record<string, string> = { c: 'common', u: 'uncommon', r: 'rare', m: 'mythic', common: 'common', uncommon: 'uncommon', rare: 'rare', mythic: 'mythic' };

/** Scryfall regex flavor: case-insensitive, line anchors, '.' excludes newline. Extensions, ~ and backreferences go to the API. */
export function compileRegex(src: string): RegExp | null {
  if (/\\s(m|c|s|p)/.test(src) || src.includes('~') || /\\[1-9]/.test(src)) return null;
  try {
    return new RegExp(src, 'im');
  } catch {
    return null;
  }
}

const PERMANENT = ['artifact', 'creature', 'enchantment', 'land', 'planeswalker', 'battle'];

const IS_FLAGS: Record<string, (p: Printing, d: Derived) => boolean> = {
  dfc: (p) => p.layout === 'transform' || p.layout === 'modal_dfc',
  mdfc: (p) => p.layout === 'modal_dfc',
  transform: (p) => p.layout === 'transform',
  tdfc: (p) => p.layout === 'transform',
  split: (p) => p.layout === 'split',
  flip: (p) => p.layout === 'flip',
  meld: (p) => p.layout === 'meld',
  leveler: (p) => p.layout === 'leveler',
  permanent: (_p, d) => d.faceTypes.some((t) => PERMANENT.some((x) => t.toLowerCase().includes(x))),
  spell: (_p, d) => d.faceTypes.some((t) => !/\bland\b/i.test(t)),
  historic: (_p, d) => d.faceTypes.some((t) => /\b(legendary|artifact|saga)\b/i.test(t)),
  vanilla: (_p, d) => /\bcreature\b/.test(d.typeLower) && d.texts.every((t) => t.trim() === ''),
  bear: (p, d) => p.cmc === 2 && d.stats.power.includes(2) && d.stats.toughness.includes(2) && /\bcreature\b/.test(d.typeLower),
  party: (_p, d) => d.faceTypes.some((t) => /creature/i.test(t) && /\b(cleric|rogue|warrior|wizard)\b/i.test(t.split('—')[1] ?? '')),
  outlaw: (_p, d) => d.faceTypes.some((t) => /creature|kindred/i.test(t) && /\b(assassin|mercenary|pirate|rogue|warlock)\b/i.test(t.split('—')[1] ?? '')),
  hybrid: (_p, d) => d.costs.some((c) => /\{(?:[WUBRG2C]\/[WUBRG](?:\/P)?)\}/i.test(c)),
  phyrexian: (_p, d) => d.costs.some((c) => /\{(?:[WUBRGC]\/P|[WUBRG]\/[WUBRG]\/P|P)\}/i.test(c)),
  reserved: (p) => p.reserved,
  promo: (p) => p.promo,
  digital: (p) => p.digital,
  reprint: (p) => p.reprint,
  full: (p) => p.full_art,
  textless: (p) => p.textless,
  booster: (p) => p.booster,
  spotlight: (p) => p.story_spotlight,
  foil: (p) => p.finishes.includes('foil'),
  nonfoil: (p) => p.finishes.includes('nonfoil'),
  etched: (p) => p.finishes.includes('etched'),
  gamechanger: (p) => p.game_changer === true,
};

const HAS_FLAGS: Record<string, (p: Printing) => boolean> = {
  watermark: (p) => Boolean(p.watermark) || (p.card_faces ?? []).some((f) => Boolean(f.watermark)),
  indicator: (p) => Boolean(p.color_indicator?.length) || (p.card_faces ?? []).some((f) => Boolean(f.color_indicator?.length)),
};

/** Keywords evaluated locally; every other keyword is resolved by Scryfall's API. */
export const LOCAL_KEYS = new Set(['', 'c', 'color', 'id', 'identity', 't', 'type', 'o', 'oracle', 'name', 'mv', 'manavalue', 'cmc', 'pow', 'power', 'tou', 'toughness', 'loy', 'loyalty', 'r', 'rarity', 's', 'set', 'e', 'edition', 'cn', 'number', 'kw', 'keyword', 'otag', 'oracletag', 'function', 'is', 'not', 'has', 'lset', 'crowd']);

/** Display keywords change presentation, not which cards match. */
export const DISPLAY_KEYS = new Set(['unique', 'order', 'display', 'prefer', 'direction', 'sort', 'include']);

const STAT_KEY: Record<string, 'power' | 'toughness' | 'loyalty'> = { pow: 'power', power: 'power', tou: 'toughness', toughness: 'toughness', loy: 'loyalty', loyalty: 'loyalty' };

export function classifyTerm(t: TermNode, ctx: LocalContext): Classified {
  const key = t.key;
  const v = t.value;
  const vl = v.toLowerCase();
  if (DISPLAY_KEYS.has(key)) return { kind: 'noop' };
  if (!LOCAL_KEYS.has(key)) return { kind: 'api' };
  if (t.exact) {
    const want = normName(v);
    return { kind: 'local', pred: (s) => derive(s.p).faceNamesNorm.includes(want) };
  }
  switch (key) {
    case '':
    case 'name': {
      if (t.regex) {
        const re = compileRegex(v);
        if (!re) return { kind: 'api' };
        return { kind: 'local', pred: (s) => re.test(s.p.name) };
      }
      if (t.op !== ':' && t.op !== '=') return { kind: 'api' };
      if (t.quoted) {
        const want = v.toLowerCase();
        return { kind: 'local', pred: (s) => derive(s.p).namesLower.some((n) => n.includes(want)) };
      }
      const want = normName(v);
      if (want === '') return { kind: 'api' };
      return { kind: 'local', pred: (s) => derive(s.p).namesNorm.some((n) => n.includes(want)) };
    }
    case 'c':
    case 'color':
    case 'id':
    case 'identity': {
      const cv = parseColorValue(v);
      if (!cv || t.quoted || t.regex) return { kind: 'api' };
      const identity = key === 'id' || key === 'identity';
      const op: Op = t.op === ':' ? (identity ? '<=' : '>=') : t.op;
      const sets = (s: Subject) => (identity ? [derive(s.p).identity] : derive(s.p).colorSets);
      if (cv.type === 'count') {
        if (identity && t.op === ':') return { kind: 'api' };
        const countOp: Op = t.op === ':' ? '=' : t.op;
        return { kind: 'local', pred: (s) => sets(s).some((cs) => cmpNum(cs.size, cv.n, countOp)) };
      }
      if (cv.type === 'colorless') {
        if (t.op !== ':' && t.op !== '=') return { kind: 'api' };
        return { kind: 'local', pred: (s) => sets(s).some((cs) => cs.size === 0) };
      }
      if (cv.type === 'multi') {
        if (t.op !== ':' && t.op !== '=') return { kind: 'api' };
        return { kind: 'local', pred: (s) => sets(s).some((cs) => cs.size >= 2) };
      }
      return { kind: 'local', pred: (s) => sets(s).some((cs) => cmpSet(cs, cv.colors, op)) };
    }
    case 't':
    case 'type': {
      if (t.regex) {
        const re = compileRegex(v);
        if (!re) return { kind: 'api' };
        return { kind: 'local', pred: (s) => re.test(s.p.type_line ?? '') };
      }
      if (t.op !== ':' && t.op !== '=') return { kind: 'api' };
      return { kind: 'local', pred: (s) => derive(s.p).typeLower.includes(vl) };
    }
    case 'o':
    case 'oracle': {
      if (v.includes('~')) return { kind: 'api' };
      if (t.regex) {
        const re = compileRegex(v);
        if (!re) return { kind: 'api' };
        return { kind: 'local', pred: (s) => derive(s.p).texts.some((x) => re.test(x)) };
      }
      if (t.op !== ':' && t.op !== '=') return { kind: 'api' };
      return { kind: 'local', pred: (s) => derive(s.p).texts.some((x) => x.includes(vl)) };
    }
    case 'mv':
    case 'manavalue':
    case 'cmc': {
      if (vl === 'even' || vl === 'odd') {
        if (t.op !== ':' && t.op !== '=') return { kind: 'api' };
        const want = vl === 'even' ? 0 : 1;
        return { kind: 'local', pred: (s) => Number.isInteger(s.p.cmc) && Math.abs(s.p.cmc % 2) === want };
      }
      if (!/^\d+(\.\d+)?$/.test(v)) return { kind: 'api' };
      const n = Number(v);
      return { kind: 'local', pred: (s) => cmpNum(s.p.cmc, n, t.op) };
    }
    case 'pow':
    case 'power':
    case 'tou':
    case 'toughness':
    case 'loy':
    case 'loyalty': {
      const field = STAT_KEY[key];
      const other = STAT_KEY[vl];
      if (other) {
        return {
          kind: 'local',
          pred: (s) => {
            const st = derive(s.p).stats;
            return st[field].some((a) => st[other].some((b) => cmpNum(a, b, t.op)));
          },
        };
      }
      if (!/^-?\d+$/.test(v)) return { kind: 'api' };
      const n = Number(v);
      return { kind: 'local', pred: (s) => derive(s.p).stats[field].some((a) => cmpNum(a, n, t.op)) };
    }
    case 'r':
    case 'rarity': {
      const want = RARITY_ALIAS[vl];
      if (!want) return { kind: 'api' };
      const wi = RARITY_ORDER.indexOf(want);
      return {
        kind: 'local',
        pred: (s) => {
          const ri = RARITY_ORDER.indexOf(s.p.rarity);
          if (ri < 0) return t.op === '!=';
          return cmpNum(ri, wi, t.op);
        },
      };
    }
    case 's':
    case 'set':
    case 'e':
    case 'edition': {
      if (t.op !== ':' && t.op !== '=') return { kind: 'api' };
      return { kind: 'local', pred: (s) => s.p.set === vl };
    }
    case 'cn':
    case 'number': {
      if (t.op === ':' || t.op === '=') return { kind: 'local', pred: (s) => s.p.collector_number.toLowerCase() === vl };
      if (!/^\d+$/.test(v)) return { kind: 'api' };
      const n = Number(v);
      return {
        kind: 'local',
        pred: (s) => {
          const m = /^(\d+)/.exec(s.p.collector_number);
          return m !== null && cmpNum(Number(m[1]), n, t.op);
        },
      };
    }
    case 'kw':
    case 'keyword': {
      if (t.op !== ':' && t.op !== '=') return { kind: 'api' };
      if (!ctx.keywords.has(vl)) return { kind: 'api' };
      return { kind: 'local', pred: (s) => derive(s.p).keywords.has(vl) };
    }
    case 'otag':
    case 'oracletag':
    case 'function': {
      if (t.op !== ':' && t.op !== '=') return { kind: 'api' };
      const slug = ctx.tagAliases[vl] ?? vl;
      return { kind: 'local', pred: (s) => s.tags.has(slug) };
    }
    case 'is':
    case 'not': {
      if (t.op !== ':' && t.op !== '=') return { kind: 'api' };
      const f = IS_FLAGS[vl];
      if (!f) return { kind: 'api' };
      const pred: Pred = (s) => f(s.p, derive(s.p));
      return { kind: 'local', pred: key === 'not' ? (s) => !pred(s) : pred };
    }
    case 'has': {
      if (t.op !== ':' && t.op !== '=') return { kind: 'api' };
      const f = HAS_FLAGS[vl];
      if (!f) return { kind: 'api' };
      return { kind: 'local', pred: (s) => f(s.p) };
    }
    case 'lset': {
      if (t.op !== ':' && t.op !== '=') return { kind: 'ignore', warning: `“${t.raw}” was ignored: lset: only supports “:”.` };
      const want = v.toUpperCase();
      return { kind: 'local', pred: (s) => s.lset === want };
    }
    case 'crowd': {
      if (vl !== 'over' && vl !== 'under') return { kind: 'ignore', warning: `“${t.raw}” was ignored: use crowd:over or crowd:under.` };
      return { kind: 'local', pred: (s) => s.crowd === vl };
    }
  }
  return { kind: 'api' };
}
