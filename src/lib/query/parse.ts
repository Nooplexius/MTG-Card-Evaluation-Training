/** Scryfall search syntax → syntax tree. AND binds tighter than OR; '-' negates a term or group. */

export type Op = ':' | '=' | '!=' | '<' | '<=' | '>' | '>=';

export interface TermNode {
  kind: 'term';
  /** Lowercased keyword, or '' for a bare name word or phrase. */
  key: string;
  op: Op;
  value: string;
  quoted: boolean;
  regex: boolean;
  /** `!name` exact-name terms. */
  exact: boolean;
  /** The term exactly as typed (used when sending it to Scryfall). */
  raw: string;
  start: number;
  end: number;
}

export type Node = { kind: 'and'; children: Node[] } | { kind: 'or'; children: Node[] } | { kind: 'not'; child: Node } | TermNode;

export interface ParseResult {
  ast: Node | null;
  error: string | null;
}

type Tok = { t: 'lp'; pos: number } | { t: 'rp'; pos: number } | { t: 'or'; pos: number } | { t: 'and'; pos: number } | { t: 'neg'; pos: number } | { t: 'term'; node: TermNode };

const OPS: Op[] = ['!=', '<=', '>=', ':', '=', '<', '>'];

class ParseError extends Error {}

function readQuoted(s: string, i: number): { value: string; end: number } {
  let j = i + 1;
  let out = '';
  while (j < s.length && s[j] !== '"') {
    if (s[j] === '\\' && s[j + 1] === '"') {
      out += '"';
      j += 2;
      continue;
    }
    out += s[j++];
  }
  if (j >= s.length) throw new ParseError('Your search contains an unclosed quotation mark.');
  return { value: out, end: j + 1 };
}

function readRegex(s: string, i: number): { value: string; end: number } {
  let j = i + 1;
  let out = '';
  while (j < s.length && s[j] !== '/') {
    if (s[j] === '\\' && j + 1 < s.length) {
      out += s[j] + s[j + 1];
      j += 2;
      continue;
    }
    out += s[j++];
  }
  if (j >= s.length) throw new ParseError('Your search contains an unclosed regular expression.');
  return { value: out, end: j + 1 };
}

const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

export function tokenize(s: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (isSpace(c)) {
      i++;
      continue;
    }
    if (c === '(') {
      toks.push({ t: 'lp', pos: i++ });
      continue;
    }
    if (c === ')') {
      toks.push({ t: 'rp', pos: i++ });
      continue;
    }
    if (c === '-' && i + 1 < s.length && !isSpace(s[i + 1]) && s[i + 1] !== ')') {
      toks.push({ t: 'neg', pos: i++ });
      continue;
    }
    const start = i;
    let exact = false;
    if (c === '!' && s[i + 1] !== '=') {
      exact = true;
      i++;
    }
    if (s[i] === '"') {
      const q = readQuoted(s, i);
      toks.push({ t: 'term', node: { kind: 'term', key: '', op: ':', value: q.value, quoted: true, regex: false, exact, raw: s.slice(start, q.end), start, end: q.end } });
      i = q.end;
      continue;
    }
    const m = /^[A-Za-z_]+/.exec(s.slice(i));
    if (m && !exact) {
      const after = i + m[0].length;
      const op = OPS.find((o) => s.startsWith(o, after));
      if (op) {
        let j = after + op.length;
        let value = '';
        let quoted = false;
        let regex = false;
        if (s[j] === '"') {
          const q = readQuoted(s, j);
          value = q.value;
          quoted = true;
          j = q.end;
        } else if (s[j] === '/') {
          const r = readRegex(s, j);
          value = r.value;
          regex = true;
          j = r.end;
        } else {
          while (j < s.length && !isSpace(s[j]) && s[j] !== ')') value += s[j++];
        }
        toks.push({ t: 'term', node: { kind: 'term', key: m[0].toLowerCase(), op, value, quoted, regex, exact: false, raw: s.slice(start, j), start, end: j } });
        i = j;
        continue;
      }
    }
    let j = i;
    let word = '';
    while (j < s.length && !isSpace(s[j]) && s[j] !== ')' && s[j] !== '(') word += s[j++];
    if (!exact && /^(or|and)$/i.test(word)) {
      toks.push({ t: word.toLowerCase() === 'or' ? 'or' : 'and', pos: start });
      i = j;
      continue;
    }
    if (word === '' && j === i) {
      i++;
      continue;
    }
    toks.push({ t: 'term', node: { kind: 'term', key: '', op: ':', value: word, quoted: false, regex: false, exact, raw: s.slice(start, j), start, end: j } });
    i = j;
  }
  return toks;
}

export function parseQuery(q: string): ParseResult {
  let toks: Tok[];
  try {
    toks = tokenize(q);
  } catch (e) {
    return { ast: null, error: (e as Error).message };
  }
  let i = 0;
  const peek = () => toks[i];

  const parseOr = (): Node | null => {
    const parts: Node[] = [];
    let cur = parseAnd();
    if (cur) parts.push(cur);
    while (peek() && peek().t === 'or') {
      i++;
      cur = parseAnd();
      if (cur) parts.push(cur);
    }
    if (parts.length === 0) return null;
    return parts.length === 1 ? parts[0] : { kind: 'or', children: parts };
  };

  const parseAnd = (): Node | null => {
    const parts: Node[] = [];
    for (;;) {
      const t = peek();
      if (!t || t.t === 'or' || t.t === 'rp') break;
      if (t.t === 'and') {
        i++;
        continue;
      }
      const u = parseUnary();
      if (u) parts.push(u);
    }
    if (parts.length === 0) return null;
    return parts.length === 1 ? parts[0] : { kind: 'and', children: parts };
  };

  const parseUnary = (): Node | null => {
    const t = peek();
    if (t.t === 'neg') {
      i++;
      if (!peek()) return null;
      const inner = parseUnary();
      return inner ? { kind: 'not', child: inner } : null;
    }
    if (t.t === 'lp') {
      i++;
      const inner = parseOr();
      if (!peek() || peek().t !== 'rp') throw new ParseError('Your search contains unclosed parentheses.');
      i++;
      return inner;
    }
    if (t.t === 'term') {
      i++;
      return t.node;
    }
    i++;
    return null;
  };

  try {
    const ast = parseOr();
    if (i < toks.length && toks[i].t === 'rp') return { ast: null, error: 'Your search has a closing parenthesis without an opening one.' };
    return { ast, error: null };
  } catch (e) {
    return { ast: null, error: (e as Error).message };
  }
}

/** Serializes a tree back to Scryfall syntax, keeping each term as typed. */
export function serialize(n: Node): string {
  switch (n.kind) {
    case 'term':
      return n.raw;
    case 'not':
      return `-${n.child.kind === 'term' ? serialize(n.child) : `(${serialize(n.child)})`}`;
    case 'and':
      return n.children.map((c) => (c.kind === 'or' ? `(${serialize(c)})` : serialize(c))).join(' ');
    case 'or':
      return n.children.map((c) => serialize(c)).join(' or ');
  }
}

export function terms(n: Node | null): TermNode[] {
  if (!n) return [];
  if (n.kind === 'term') return [n];
  if (n.kind === 'not') return terms(n.child);
  return n.children.flatMap(terms);
}
