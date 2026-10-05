import { parseQuery, serialize, type Node } from './parse.ts';

export interface ChipOption {
  id: string;
  label: string;
  term: string;
  title?: string;
}

export interface ChipGroup {
  id: string;
  label: string;
  options: ChipOption[];
}

export function chipGroups(sets: Array<{ code: string; name: string }>): ChipGroup[] {
  return [
    {
      id: 'color',
      label: 'Color',
      options: [
        { id: 'w', label: 'W', term: 'c:w', title: 'White' },
        { id: 'u', label: 'U', term: 'c:u', title: 'Blue' },
        { id: 'b', label: 'B', term: 'c:b', title: 'Black' },
        { id: 'r', label: 'R', term: 'c:r', title: 'Red' },
        { id: 'g', label: 'G', term: 'c:g', title: 'Green' },
        { id: 'm', label: 'Multi', term: 'c:m', title: 'Multicolor' },
        { id: 'c', label: 'Colorless', term: 'c:c', title: 'Colorless' },
      ],
    },
    {
      id: 'rarity',
      label: 'Rarity',
      options: [
        { id: 'c', label: 'Common', term: 'r:common' },
        { id: 'u', label: 'Uncommon', term: 'r:uncommon' },
        { id: 'r', label: 'Rare', term: 'r:rare' },
        { id: 'm', label: 'Mythic', term: 'r:mythic' },
      ],
    },
    {
      id: 'type',
      label: 'Type',
      options: ['creature', 'instant', 'sorcery', 'enchantment', 'artifact', 'land', 'planeswalker'].map((t) => ({ id: t, label: t[0].toUpperCase() + t.slice(1), term: `t:${t}` })),
    },
    {
      id: 'mv',
      label: 'Mana value',
      options: [
        { id: '01', label: '0–1', term: 'mv<=1' },
        { id: '2', label: '2', term: 'mv=2' },
        { id: '3', label: '3', term: 'mv=3' },
        { id: '4', label: '4', term: 'mv=4' },
        { id: '5', label: '5', term: 'mv=5' },
        { id: '6', label: '6+', term: 'mv>=6' },
      ],
    },
    { id: 'set', label: 'Limited set', options: sets.map((s) => ({ id: s.code, label: s.code, term: `lset:${s.code.toLowerCase()}`, title: s.name })) },
  ];
}

const norm = (s: string) => s.trim().toLowerCase();

function topLevel(q: string): Node[] | null {
  const { ast, error } = parseQuery(q);
  if (error) return null;
  if (!ast) return [];
  return ast.kind === 'and' ? ast.children : [ast];
}

/** The group's options found as a top-level term or as a top-level OR of the group's own terms. */
function owned(node: Node, group: ChipGroup): string[] | null {
  const ids = (n: Node): string | null => (n.kind === 'term' ? (group.options.find((o) => norm(o.term) === norm(n.raw))?.id ?? null) : null);
  if (node.kind === 'term') {
    const id = ids(node);
    return id ? [id] : null;
  }
  if (node.kind === 'or') {
    const all = node.children.map(ids);
    return all.every((x) => x !== null) ? (all as string[]) : null;
  }
  return null;
}

/** Active chip ids per group, read from the query text. */
export function activeChips(q: string, groups: ChipGroup[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const top = topLevel(q) ?? [];
  for (const g of groups) {
    out[g.id] = [];
    for (const n of top) {
      const o = owned(n, g);
      if (o) {
        out[g.id] = o;
        break;
      }
    }
  }
  return out;
}

/** Toggles one chip and returns the rewritten query; options within a group combine with OR. */
export function toggleChip(q: string, group: ChipGroup, optionId: string): string {
  const top = topLevel(q);
  if (top === null) return q;
  const idx = top.findIndex((n) => owned(n, group) !== null);
  const current = idx >= 0 ? (owned(top[idx], group) as string[]) : [];
  const next = current.includes(optionId) ? current.filter((x) => x !== optionId) : [...current, optionId];
  const ordered = group.options.filter((o) => next.includes(o.id));
  const text = ordered.length === 0 ? null : ordered.length === 1 ? ordered[0].term : `(${ordered.map((o) => o.term).join(' or ')})`;
  const parts = top.map((n) => (n.kind === 'or' ? `(${serialize(n)})` : serialize(n)));
  if (idx >= 0) {
    if (text === null) parts.splice(idx, 1);
    else parts[idx] = text;
  } else if (text !== null) parts.push(text);
  return parts.join(' ');
}
