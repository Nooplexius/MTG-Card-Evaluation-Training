import { normalizeRarity } from './format.ts';
import { ALL_GROUPS, type SeventeenRow } from '../types.ts';

/** A row from GET https://www.17lands.com/api/card_data. */
export interface ApiCardRow {
  name: string;
  mtga_id?: number;
  color?: string | null;
  rarity?: string | null;
  seen_count?: number | null;
  avg_seen?: number | null;
  pick_count?: number | null;
  avg_pick?: number | null;
  game_count?: number | null;
  play_rate?: number | null;
  win_rate?: number | null;
  opening_hand_game_count?: number | null;
  opening_hand_win_rate?: number | null;
  drawn_game_count?: number | null;
  drawn_win_rate?: number | null;
  ever_drawn_game_count?: number | null;
  ever_drawn_win_rate?: number | null;
  never_drawn_game_count?: number | null;
  never_drawn_win_rate?: number | null;
  drawn_improvement_win_rate?: number | null;
  [extra: string]: unknown;
}

export interface ApiCardResponse {
  copyright?: string;
  notes?: string;
  data: ApiCardRow[];
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const REQUIRED_API_FIELDS = ['name', 'ever_drawn_game_count', 'ever_drawn_win_rate'] as const;

export function isApiCardResponse(x: unknown): x is ApiCardResponse {
  return typeof x === 'object' && x !== null && Array.isArray((x as ApiCardResponse).data);
}

/** Normalizes API rows to the same schema as CSV exports (full precision). */
export function normalizeApiRows(resp: ApiCardResponse): { rows: SeventeenRow[]; missingFields: string[] } {
  const missing = new Set<string>();
  const rows: SeventeenRow[] = [];
  for (const r of resp.data) {
    for (const f of REQUIRED_API_FIELDS) if (!(f in r)) missing.add(f);
    if (typeof r.name !== 'string' || r.name.trim() === '') continue;
    rows.push({
      name: r.name.split(' // ')[0].trim(),
      mtgaId: typeof r.mtga_id === 'number' ? r.mtga_id : undefined,
      color: (r.color ?? '').trim(),
      rarity: normalizeRarity(r.rarity ?? ''),
      seen: num(r.seen_count),
      alsa: num(r.avg_seen),
      picked: num(r.pick_count),
      ata: num(r.avg_pick),
      gp: num(r.game_count),
      gpPct: num(r.play_rate),
      gpWr: num(r.win_rate),
      oh: num(r.opening_hand_game_count),
      ohWr: num(r.opening_hand_win_rate),
      gd: num(r.drawn_game_count),
      gdWr: num(r.drawn_win_rate),
      gih: num(r.ever_drawn_game_count),
      gihWr: num(r.ever_drawn_win_rate),
      gns: num(r.never_drawn_game_count),
      gnsWr: num(r.never_drawn_win_rate),
      iih: num(r.drawn_improvement_win_rate),
    });
  }
  return { rows, missingFields: [...missing] };
}

export const API_GROUPS = ALL_GROUPS;
