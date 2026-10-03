import type { ScryCard } from './scryfall.ts';

/** whatsinstandard.com/api/v6/standard.json */
export interface WisResponse {
  deprecated?: boolean;
  sets: Array<{
    name: string;
    code: string | null;
    enterDate: { exact: string | null; rough?: string } | string | null;
    exitDate: { exact: string | null; rough?: string } | string | null;
  }>;
}

const exact = (d: WisResponse['sets'][number]['enterDate']): string | null => {
  if (d === null || d === undefined) return null;
  const s = typeof d === 'string' ? d : d.exact;
  return s ? s.slice(0, 10) : null;
};

/** A set is in Standard when enterDate <= today and it has no exitDate on or before today. */
export function standardSetCodes(wis: WisResponse, today: string): string[] {
  if (!Array.isArray(wis.sets) || wis.sets.length === 0) throw new Error('whatsinstandard response has no sets');
  const out: string[] = [];
  for (const s of wis.sets) {
    if (!s.code) continue;
    const enter = exact(s.enterDate);
    const exit = exact(s.exitDate);
    if (!enter || enter > today) continue;
    if (exit && exit <= today) continue;
    out.push(s.code.toUpperCase());
  }
  return out;
}

export interface LegalityCheck {
  code: string;
  printings: number;
  legalShare: number;
  agrees: boolean;
}

const isBasicOrToken = (c: ScryCard) => /\bBasic\b.*\bLand\b/.test(c.type_line ?? '') || c.layout === 'token' || c.set_type === 'token';

/** Share of a set's own booster printings (all printings if none are flagged booster) that Scryfall marks legal in Standard. */
export function scryfallStandardShare(code: string, cards: ScryCard[]): { printings: number; legalShare: number } {
  const own = cards.filter((c) => c.set === code.toLowerCase() && !isBasicOrToken(c) && c.lang === 'en');
  const booster = own.filter((c) => c.booster);
  const pool = booster.length > 0 ? booster : own;
  if (pool.length === 0) return { printings: 0, legalShare: 0 };
  const legal = pool.filter((c) => c.legalities?.standard === 'legal').length;
  return { printings: pool.length, legalShare: legal / pool.length };
}

/** Cross-checks the whatsinstandard list against Scryfall legality for each listed set. */
export function crossCheckStandard(codes: string[], cards: ScryCard[]): LegalityCheck[] {
  return codes.map((code) => {
    const { printings, legalShare } = scryfallStandardShare(code, cards);
    return { code, printings, legalShare, agrees: printings > 0 && legalShare >= 0.5 };
  });
}
