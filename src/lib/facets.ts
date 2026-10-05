/** Card facets for stats, smart feedback and drills. Each is a Scryfall query, so a drill is just that query. */
export interface Facet {
  id: string;
  label: string;
  /** Plain-language noun phrase for insight text ("green cards", "removal"). */
  noun: string;
  group: string;
  query: string;
  /** Interactions are held to a stricter evidence threshold. */
  interaction?: boolean;
}

const COLORS: Array<[string, string]> = [
  ['w', 'white'],
  ['u', 'blue'],
  ['b', 'black'],
  ['r', 'red'],
  ['g', 'green'],
];

const BIG_BODY = 't:creature (mv<=1 pow>=2 or mv=2 pow>=3 or mv=3 pow>=4 or mv=4 pow>=5 or mv=5 pow>=6 or mv>=6 pow>=7)';
const SMALL_BODY = 't:creature (mv=2 pow<=1 or mv=3 pow<=1 or mv=4 pow<=2 or mv=5 pow<=3 or mv>=6 pow<=4)';

/** Curated functional tags. Scryfall has no general token-maker or fixing tag, so those use oracle text and tag unions. */
export const TAG_FACETS: Array<[string, string, string]> = [
  ['removal', 'Removal', 'otag:removal'],
  ['card-advantage', 'Card advantage', 'otag:card-advantage'],
  ['combat-trick', 'Combat tricks', 'otag:combat-trick'],
  ['counterspell', 'Counterspells', 'otag:counterspell'],
  ['ramp', 'Ramp and fixing', '(otag:ramp or otag:mana-producer or otag:tutor-land)'],
  ['lifegain', 'Lifegain', 'otag:lifegain'],
  ['evasion', 'Evasion', 'otag:evasion'],
  ['sweeper', 'Sweepers', 'otag:sweeper'],
  ['tokens', 'Token makers', 'o:/\\bcreates?\\b[^.]*\\btokens?\\b/'],
  ['discard', 'Discard', 'otag:discard'],
  ['burn', 'Burn', 'otag:burn'],
  ['draw', 'Card draw', 'otag:draw'],
  ['mana-sink', 'Mana sinks', 'otag:mana-sink'],
];

const KEYWORDS = ['flying', 'trample', 'deathtouch', 'lifelink', 'flash', 'haste', 'vigilance', 'first strike', 'menace', 'reach', 'ward', 'defender', 'prowess'];

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function baseFacets(sets: Array<{ code: string; name: string; bonusSheets: string[] }>): Facet[] {
  const f: Facet[] = [];
  for (const [r, label] of [
    ['common', 'Commons'],
    ['uncommon', 'Uncommons'],
    ['rare', 'Rares'],
    ['mythic', 'Mythics'],
  ] as const)
    f.push({ id: `rarity:${r}`, label, noun: label.toLowerCase(), group: 'Rarity', query: `r:${r}` });
  for (const [c, name] of COLORS) f.push({ id: `color:${c}`, label: cap(name), noun: `${name} cards`, group: 'Color', query: `c:${c}` });
  f.push({ id: 'color:m', label: 'Multicolor', noun: 'multicolor cards', group: 'Color', query: 'c:m' });
  f.push({ id: 'color:c', label: 'Colorless', noun: 'colorless cards', group: 'Color', query: 'c:c' });
  f.push({ id: 'colors:1', label: 'One color', noun: 'mono-colored cards', group: 'Color count', query: 'c=1' });
  f.push({ id: 'colors:2', label: 'Two colors', noun: 'two-color cards', group: 'Color count', query: 'c=2' });
  f.push({ id: 'colors:3', label: 'Three or more', noun: 'cards of three or more colors', group: 'Color count', query: 'c>=3' });
  for (const t of ['creature', 'instant', 'sorcery', 'enchantment', 'artifact', 'land', 'planeswalker']) f.push({ id: `type:${t}`, label: `${cap(t)}s`, noun: `${t}s`, group: 'Type', query: `t:${t}` });
  for (const [id, label, q] of [
    ['01', 'MV 0–1', 'mv<=1'],
    ['2', 'MV 2', 'mv=2'],
    ['3', 'MV 3', 'mv=3'],
    ['4', 'MV 4', 'mv=4'],
    ['5', 'MV 5', 'mv=5'],
    ['6', 'MV 6+', 'mv>=6'],
  ])
    f.push({ id: `mv:${id}`, label, noun: `cards at ${label.replace('MV', 'mana value')}`, group: 'Mana value', query: q });
  f.push({ id: 'body:big', label: 'Big body for its cost', noun: 'creatures with high power for their cost', group: 'Creature stats', query: BIG_BODY });
  f.push({ id: 'body:small', label: 'Small body for its cost', noun: 'creatures with low power for their cost', group: 'Creature stats', query: SMALL_BODY });
  for (const k of KEYWORDS) f.push({ id: `kw:${k}`, label: cap(k), noun: `cards with ${k}`, group: 'Keyword', query: k.includes(' ') ? `kw:"${k}"` : `kw:${k}` });
  for (const [id, label, q] of TAG_FACETS) f.push({ id: `tag:${id}`, label, noun: label.toLowerCase(), group: 'Function', query: q });
  for (const s of sets) f.push({ id: `set:${s.code}`, label: s.code, noun: `${s.name} cards`, group: 'Set', query: `lset:${s.code.toLowerCase()}` });
  for (const b of [...new Set(sets.flatMap((s) => s.bonusSheets))]) f.push({ id: `sheet:${b}`, label: `Bonus sheet ${b.toUpperCase()}`, noun: `${b.toUpperCase()} bonus-sheet cards`, group: 'Bonus sheet', query: `set:${b}` });
  for (const [id, label, q] of [
    ['dfc', 'Double-faced', 'is:dfc'],
    ['split', 'Split and rooms', 'is:split'],
    ['adventure', 'Adventures', 't:adventure'],
    ['saga', 'Sagas', 't:saga'],
  ])
    f.push({ id: `layout:${id}`, label, noun: label.toLowerCase(), group: 'Layout', query: q });
  f.push({ id: 'crowd:over', label: 'Drafters overrate', noun: 'cards drafters take too early', group: 'Crowd gap', query: 'crowd:over' });
  f.push({ id: 'crowd:under', label: 'Drafters underrate', noun: 'cards drafters take too late', group: 'Crowd gap', query: 'crowd:under' });
  for (const [c, name] of COLORS) {
    f.push({ id: `ix:${c}-creature`, label: `${cap(name)} creatures`, noun: `${name} creatures`, group: 'Color × type', query: `c:${c} t:creature`, interaction: true });
    f.push({ id: `ix:${c}-spell`, label: `${cap(name)} instants and sorceries`, noun: `${name} instants and sorceries`, group: 'Color × type', query: `c:${c} (t:instant or t:sorcery)`, interaction: true });
    f.push({ id: `ix:${c}-cheap`, label: `${cap(name)} at MV ≤ 2`, noun: `cheap ${name} cards`, group: 'Color × mana value', query: `c:${c} mv<=2`, interaction: true });
    f.push({ id: `ix:${c}-top`, label: `${cap(name)} at MV ≥ 5`, noun: `expensive ${name} cards`, group: 'Color × mana value', query: `c:${c} mv>=5`, interaction: true });
  }
  return f;
}

export function customFacets(saved: Array<{ id?: number; name: string; query: string }>): Facet[] {
  return saved.map((s) => ({ id: `saved:${s.id ?? s.name}`, label: s.name, noun: `“${s.name}” cards`, group: 'Saved filters', query: s.query }));
}
