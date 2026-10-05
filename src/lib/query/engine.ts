import { classifyTerm, type LocalContext, type Pred, type Subject } from './local.ts';
import { parseQuery, serialize, terms, type Node, type TermNode } from './parse.ts';

export type { Subject, LocalContext } from './local.ts';

type Plan = { k: 'local'; pred: Pred } | { k: 'api'; text: string; terms: TermNode[] } | { k: 'and'; c: Plan[] } | { k: 'or'; c: Plan[] } | { k: 'not'; c: Plan };

export interface ApiResult {
  ids: Set<string>;
  warnings: string[];
  /** Scryfall ignored every term in the subtree (unknown keyword or value). */
  ignored: boolean;
  error?: string;
}

export interface Compiled {
  query: string;
  error: string | null;
  warnings: string[];
  /** Texts of the API-only subtrees that must be resolved. */
  api: string[];
  plan: Plan | null;
  /** True when the query uses no terms at all (matches everything). */
  empty: boolean;
}

function allApi(n: Node, ctx: LocalContext): boolean {
  return terms(n).every((t) => classifyTerm(t, ctx).kind === 'api');
}

function build(n: Node, ctx: LocalContext, warnings: string[]): Plan | null {
  if (n.kind === 'term') {
    const c = classifyTerm(n, ctx);
    if (c.kind === 'local') return { k: 'local', pred: c.pred };
    if (c.kind === 'api') return { k: 'api', text: n.raw, terms: [n] };
    if (c.kind === 'ignore') warnings.push(c.warning);
    return null;
  }
  if (n.kind === 'not') {
    const inner = build(n.child, ctx, warnings);
    return inner ? { k: 'not', c: inner } : null;
  }
  if (allApi(n, ctx)) return { k: 'api', text: serialize(n), terms: terms(n) };
  const kids = n.children.map((c) => build(c, ctx, warnings)).filter((p): p is Plan => p !== null);
  if (kids.length === 0) return null;
  if (kids.length === 1) return kids[0];
  return { k: n.kind, c: kids };
}

export function compile(query: string, ctx: LocalContext): Compiled {
  const trimmed = query.trim();
  if (trimmed === '') return { query: trimmed, error: null, warnings: [], api: [], plan: null, empty: true };
  const { ast, error } = parseQuery(trimmed);
  if (error) return { query: trimmed, error, warnings: [], api: [], plan: null, empty: false };
  const warnings: string[] = [];
  const plan = ast ? build(ast, ctx, warnings) : null;
  const api: string[] = [];
  const collect = (p: Plan | null) => {
    if (!p) return;
    if (p.k === 'api') {
      if (!api.includes(p.text)) api.push(p.text);
    } else if (p.k === 'not') collect(p.c);
    else if (p.k === 'and' || p.k === 'or') p.c.forEach(collect);
  };
  collect(plan);
  return { query: trimmed, error: null, warnings, api, plan, empty: plan === null };
}

/** Returns a match flag per subject, or null for "absent" (every term dropped). */
function run(p: Plan, subjects: Subject[], api: Map<string, ApiResult>): Uint8Array | null {
  const n = subjects.length;
  switch (p.k) {
    case 'local': {
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i++) out[i] = p.pred(subjects[i]) ? 1 : 0;
      return out;
    }
    case 'api': {
      const r = api.get(p.text);
      if (!r) throw new Error(`Unresolved Scryfall term: ${p.text}`);
      if (r.ignored) return null;
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i++) out[i] = r.ids.has(subjects[i].p.id) ? 1 : 0;
      return out;
    }
    case 'not': {
      const c = run(p.c, subjects, api);
      if (!c) return null;
      for (let i = 0; i < n; i++) c[i] = c[i] ? 0 : 1;
      return c;
    }
    case 'and':
    case 'or': {
      let acc: Uint8Array | null = null;
      for (const child of p.c) {
        const r = run(child, subjects, api);
        if (!r) continue;
        if (!acc) acc = r;
        else if (p.k === 'and') for (let i = 0; i < n; i++) acc[i] = acc[i] & r[i];
        else for (let i = 0; i < n; i++) acc[i] = acc[i] | r[i];
      }
      return acc;
    }
  }
}

export function evaluate(c: Compiled, subjects: Subject[], api: Map<string, ApiResult> = new Map()): Uint8Array {
  if (c.error) throw new Error(c.error);
  const all = () => new Uint8Array(subjects.length).fill(1);
  if (!c.plan) return all();
  return run(c.plan, subjects, api) ?? all();
}

/** Scryfall restricted to the given set codes (every printing is requested with unique=prints). */
export function apiSearchQuery(subtree: string, setCodes: string[]): string {
  const sets = [...new Set(setCodes)].sort().map((s) => `e:${s}`).join(' or ');
  return `(${subtree}) (${sets})`;
}

/** True when Scryfall's warnings say every term of the subtree was ignored. */
export function allIgnored(subtreeTerms: TermNode[], warnings: string[]): boolean {
  if (subtreeTerms.length === 0) return false;
  return subtreeTerms.every((t) => warnings.some((w) => w.includes(`“${t.raw}”`) && /ignored/i.test(w)));
}

export function apiTermsOf(c: Compiled, text: string): TermNode[] {
  const found: TermNode[] = [];
  const visit = (p: Plan | null) => {
    if (!p) return;
    if (p.k === 'api' && p.text === text) found.push(...p.terms);
    else if (p.k === 'not') visit(p.c);
    else if (p.k === 'and' || p.k === 'or') p.c.forEach(visit);
  };
  visit(c.plan);
  return found;
}
