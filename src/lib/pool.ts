import { cardColors } from './card.ts';
import type { ManifestSet, PoolCard, SetFile, TagsFile } from './data.ts';
import { cardKey } from './data.ts';
import { seInSteps } from './grades.ts';

export interface PoolEntry {
  key: string;
  set: string;
  card: PoolCard;
  meta: ManifestSet;
  file: SetFile;
  /** Sampling noise of the grade in steps. */
  seSteps: number;
  /** Grade family: 0 F, 1 D, 2 C, 3 B, 4 A. */
  band: number;
  /** Interleaving color key: W/U/B/R/G, M (multicolor) or C (colorless). */
  colorKey: string;
  tags: string[];
}

export function bandOf(g: number): number {
  if (g <= 0) return 0;
  if (g <= 3) return 1;
  if (g <= 6) return 2;
  if (g <= 9) return 3;
  return 4;
}

export function colorKeyOf(col: string, fallback: string[]): string {
  const c = col || fallback.join('');
  if (c.length === 0) return 'C';
  if (c.length > 1) return 'M';
  return c;
}

export class Pool {
  entries: PoolEntry[] = [];
  byKey = new Map<string, PoolEntry>();
  bySet = new Map<string, PoolEntry[]>();
  files = new Map<string, SetFile>();
  tags: TagsFile | null = null;

  setTags(t: TagsFile) {
    this.tags = t;
    for (const e of this.entries) e.tags = e.card.t.map((i) => t.slugs[i]);
  }

  addSet(file: SetFile, meta: ManifestSet): PoolEntry[] {
    if (this.files.has(file.code)) return this.bySet.get(file.code) ?? [];
    this.files.set(file.code, file);
    const list: PoolEntry[] = file.cards.map((card) => ({
      key: cardKey(file.code, card.o),
      set: file.code,
      card,
      meta,
      file,
      seSteps: seInSteps(card.s.gihWr, card.s.gih, file.sd),
      band: bandOf(card.g),
      colorKey: colorKeyOf(card.col, cardColors(card.p)),
      tags: this.tags ? card.t.map((i) => (this.tags as TagsFile).slugs[i]) : [],
    }));
    for (const e of list) this.byKey.set(e.key, e);
    this.bySet.set(file.code, list);
    this.entries = [...this.entries, ...list];
    return list;
  }

  get(key: string): PoolEntry | undefined {
    return this.byKey.get(key);
  }
}
