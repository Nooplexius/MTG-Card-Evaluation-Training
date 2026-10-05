import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { localResult, loadQueryFixtures, readCorpus } from '../../pipeline/corpus.ts';
import { activeChips, chipGroups, toggleChip } from '../../src/lib/query/chips.ts';
import { compile, evaluate } from '../../src/lib/query/engine.ts';
import { numericStat } from '../../src/lib/query/local.ts';
import { parseQuery, serialize } from '../../src/lib/query/parse.ts';
import { ScryfallClient } from '../../src/lib/query/scryfall.ts';
import { ROOT } from '../helpers/fixtures.ts';

const fx = loadQueryFixtures(ROOT);
const corpus = readCorpus(join(ROOT, 'tests/fixtures/query/corpus.json.gz'));

describe('differential corpus: local engine equals Scryfall on the pinned pool', () => {
  it('has at least 60 queries covering the required categories', () => {
    const qs = corpus.entries.map((e) => e.q);
    expect(qs.length).toBeGreaterThanOrEqual(60);
    for (const re of [/otag:/, /(^|\s)-/, /:\/.*\//, /[<>]=?/, /is:dfc|is:transform/, /e:(big|tle|spg|pza|omb|otp)|set:tle/, /e:om1/, /a:"/]) expect(qs.some((q) => re.test(q)), String(re)).toBe(true);
    expect(corpus.setCodes).toEqual(fx.setCodes);
  });

  for (const e of corpus.entries) {
    it(e.q === '' ? '(empty query)' : e.q, () => {
      const r = localResult(e.q, fx, corpus.api);
      expect(r.missing).toEqual([]);
      if (e.scryfallStatus >= 400 || e.error) {
        expect(r.error, `Scryfall said ${e.scryfallStatus} ${e.scryfallDetails ?? ''}`).toBeTruthy();
        return;
      }
      expect(r.error).toBeNull();
      expect(r.ids?.length).toBe(e.expected?.length);
      expect(r.ids).toEqual(e.expected);
    });
  }
});

describe('query parsing', () => {
  it('binds AND tighter than OR and keeps raw terms', () => {
    const { ast } = parseQuery('t:creature or t:artifact o:draw');
    expect(ast?.kind).toBe('or');
    expect(serialize(ast!)).toBe('t:creature or t:artifact o:draw');
    expect(serialize(parseQuery('-(t:creature or t:land) c:r').ast!)).toBe('-(t:creature or t:land) c:r');
  });
  it('reports unclosed parentheses and quotes like Scryfall', () => {
    expect(parseQuery('(t:creature').error).toMatch(/unclosed parentheses/);
    expect(parseQuery('o:"draw a').error).toMatch(/unclosed/);
  });
  it('reads regex values with spaces and escaped slashes', () => {
    const { ast } = parseQuery('o:/draw a card\\/s/ t:elf');
    expect(ast?.kind === 'and' && ast.children[0].kind === 'term' && ast.children[0].value).toBe('draw a card\\/s');
  });
  it('counts * as 0 in power and toughness like Scryfall', () => {
    expect(numericStat('*')).toBe(0);
    expect(numericStat('1+*')).toBe(1);
    expect(numericStat('3')).toBe(3);
    expect(numericStat('∞')).toBeNull();
  });
  it('drops ignored app-only terms with a warning and treats display keywords as no-ops', () => {
    const c = compile('lset:tla crowd:sideways unique:prints', fx.ctx);
    expect(c.warnings.join()).toMatch(/crowd:over or crowd:under/);
    const flags = evaluate(c, fx.subjects);
    expect([...flags].filter(Boolean).length).toBe(fx.pool.filter((p) => p.lset === 'TLA').length);
  });
});

describe('quick chips write visible syntax', () => {
  const groups = chipGroups([{ code: 'TLA', name: 'Avatar' }]);
  const color = groups.find((g) => g.id === 'color')!;
  const mv = groups.find((g) => g.id === 'mv')!;
  it('adds, ORs within a group and removes terms', () => {
    let q = toggleChip('', color, 'r');
    expect(q).toBe('c:r');
    q = toggleChip(q, color, 'g');
    expect(q).toBe('(c:r or c:g)');
    q = toggleChip(`otag:removal ${q}`, mv, '6');
    expect(q).toBe('otag:removal (c:r or c:g) mv>=6');
    expect(activeChips(q, groups)).toMatchObject({ color: ['r', 'g'], mv: ['6'] });
    q = toggleChip(q, color, 'r');
    expect(q).toBe('otag:removal c:g mv>=6');
    q = toggleChip(q, color, 'g');
    expect(q).toBe('otag:removal mv>=6');
  });
  it('recognizes typed terms case-insensitively and leaves unrelated OR groups alone', () => {
    expect(activeChips('C:R t:elf', groups).color).toEqual(['r']);
    expect(activeChips('(c:r or t:elf)', groups).color).toEqual([]);
  });
});

describe('Scryfall client', () => {
  it('runs one request at a time at most twice per second, pages, and treats 404 as empty', async () => {
    let t = 0;
    const calls: number[] = [];
    const client = new ScryfallClient({
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
      fetch: (async (url: string) => {
        calls.push(t);
        if (String(url).includes('page=2')) return new Response(JSON.stringify({ data: [{ id: 'c' }], has_more: false, total_cards: 3 }), { status: 200 });
        if (String(url).includes('nothing')) return new Response(JSON.stringify({ details: 'none' }), { status: 404 });
        return new Response(JSON.stringify({ data: [{ id: 'a' }, { id: 'b' }], has_more: true, next_page: 'https://api.scryfall.com/cards/search?page=2', total_cards: 3 }), { status: 200 });
      }) as typeof fetch,
    });
    expect((await client.search('t:elf')).ids).toEqual(['a', 'b', 'c']);
    expect((await client.search('nothing')).ids).toEqual([]);
    for (let i = 1; i < calls.length; i++) expect(calls[i] - calls[i - 1]).toBeGreaterThanOrEqual(500);
    expect((await client.search('t:elf')).ids).toEqual(['a', 'b', 'c']);
    expect(calls).toHaveLength(3);
  });

  it('locks out for 30 seconds after a 429 instead of retrying', async () => {
    let t = 0;
    let n = 0;
    const client = new ScryfallClient({
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
      fetch: (async () => {
        n++;
        return new Response('{}', { status: 429 });
      }) as typeof fetch,
    });
    await expect(client.search('t:elf')).rejects.toThrow(/slow down/);
    await expect(client.search('t:goblin')).rejects.toThrow(/slow down/);
    expect(n).toBe(1);
    t += 31_000;
    await expect(client.search('t:goblin')).rejects.toThrow(/slow down/);
    expect(n).toBe(2);
  });

  it('reports a missing connection as offline', async () => {
    const client = new ScryfallClient({
      fetch: (async () => {
        throw new TypeError('Failed to fetch');
      }) as typeof fetch,
    });
    await expect(client.search('t:elf')).rejects.toThrow(/connection/);
  });
});
