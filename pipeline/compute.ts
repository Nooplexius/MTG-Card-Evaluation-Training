import type { Manifest, ManifestSet, SetFile, SetStatus, StarterCard, StatusFile, TagsFile } from '../src/lib/data.ts';
import { DATA_SCHEMA, formatLabel } from '../src/lib/data.ts';
import { seededRng, shuffle } from '../src/lib/random.ts';
import type { DiscoverError } from './exports/discover.ts';
import { chooseNewestValid, type ChainResult, type ValidationConfig } from './exports/validate.ts';
import { daysBetween, eligibility, type EligibilityRules } from './eligibility.ts';
import type { OracleTag, ScryCard, ScrySet } from './inputs/scryfall.ts';
import { cardDataPageUrl, exportLink, type FetchState } from './inputs/seventeen.ts';
import { crossCheckStandard, scryfallStandardShare, standardSetCodes, type WisResponse } from './inputs/standard.ts';
import { buildJoinIndex, joinRow, setMatchRate, type JoinIndex } from './join.ts';
import { buildLimitedSet, standardToLimited, type LimitedSet, type SetsConfig } from './limitedSets.ts';
import { buildSetFile, buildTagIndex, type JoinedRow } from './output.ts';
import type { SeventeenData } from './types.ts';

export interface PipelineConfig extends EligibilityRules {
  autoFetch17Lands: boolean;
  minGradedCards: number;
  staleAfterDays: number;
  appName: string;
  appUrl: string;
  validation: ValidationConfig & { minMatchRate: number };
}

export interface FetchSummary {
  disabled: boolean;
  halted: boolean;
  activeSets: string[];
  filtersDate: string | null;
  releaseDates: Record<string, string>;
  state: FetchState;
}

export interface ComputeInput {
  today: string;
  generatedAt: string;
  pipeline: PipelineConfig;
  setsCfg: SetsConfig;
  wis: WisResponse;
  scrySets: ScrySet[];
  cards: ScryCard[];
  tags: OracleTag[];
  cardsCsv: Map<string, Map<string, number[]>>;
  exports: SeventeenData[];
  exportErrors: DiscoverError[];
  snapshots: SeventeenData[];
  synthetic: SeventeenData[];
  fetch: FetchSummary;
  lastGood: { manifest: Manifest; setFiles: Map<string, SetFile> } | null;
}

export interface Unmatched {
  set: string;
  name: string;
  reason: string;
}

export interface ComputeOutput {
  manifest: Omit<Manifest, 'dataHash' | 'tagsFile' | 'statusFile'>;
  setFiles: SetFile[];
  tags: TagsFile;
  status: StatusFile;
  unmatched: Unmatched[];
  log: string[];
  /** A shared input (Standard list, Scryfall) is unusable: fail loudly and do not deploy. */
  fatal: string[];
}

interface Assigned {
  data: SeventeenData;
  set: string;
  format: string;
}

function inferSet(d: SeventeenData, candidates: LimitedSet[], idx: JoinIndex, minRate: number): { set: string | null; detail: string } {
  const rates = candidates.map((ls) => ({ code: ls.code, rate: setMatchRate(d.rows, ls, idx) })).sort((a, b) => b.rate - a.rate);
  const winners = rates.filter((r) => r.rate >= minRate);
  if (winners.length === 1) return { set: winners[0].code, detail: `${(winners[0].rate * 100).toFixed(1)}% of rows match ${winners[0].code}` };
  if (winners.length > 1) return { set: null, detail: `matches several sets (${winners.map((w) => `${w.code} ${(w.rate * 100).toFixed(0)}%`).join(', ')})` };
  const best = rates[0];
  return { set: null, detail: best ? `no set reaches ${(minRate * 100).toFixed(0)}% matching rows (best: ${best.code} ${(best.rate * 100).toFixed(1)}%)` : 'no candidate sets' };
}

function fmtDate(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function windowLabel(date: string): string {
  return `all time through ${fmtDate(date)}`;
}

export interface StandardAnalysis {
  standard: string[];
  /** Standard codes where whatsinstandard and Scryfall disagree. */
  disagree: Set<string>;
  log: string[];
  fatal: string[];
}

export function standardAnalysis(wis: WisResponse, cards: ScryCard[], scrySets: ScrySet[], today: string): StandardAnalysis {
  const log: string[] = [];
  const fatal: string[] = [];
  let standard: string[] = [];
  try {
    standard = standardSetCodes(wis, today);
  } catch (e) {
    fatal.push(`Standard list unusable: ${(e as Error).message}`);
  }
  if (standard.length < 3) fatal.push(`Standard list has only ${standard.length} sets on ${today}`);
  const checks = crossCheckStandard(standard, cards);
  const disagree = new Set(checks.filter((c) => !c.agrees).map((c) => c.code));
  for (const c of checks.filter((x) => !x.agrees)) log.push(`Standard check: whatsinstandard lists ${c.code} but only ${(c.legalShare * 100).toFixed(0)}% of its ${c.printings} Scryfall printings are legal:standard`);
  const scryOnly = scrySets.filter((s) => ['expansion', 'core'].includes(s.set_type) && !s.parent_set_code && !s.digital && (s.released_at ?? '9999') <= today && !standard.includes(s.code.toUpperCase()));
  for (const s of scryOnly) {
    const share = scryfallStandardShare(s.code, cards);
    if (share.printings >= 50 && share.legalShare >= 0.5) {
      disagree.add(s.code.toUpperCase());
      log.push(`Standard check: Scryfall marks ${(share.legalShare * 100).toFixed(0)}% of ${s.code.toUpperCase()} legal:standard but whatsinstandard does not list it`);
    }
  }
  return { standard, disagree, log, fatal };
}

export function computeBuild(inp: ComputeInput): ComputeOutput {
  const { today, pipeline: cfg, setsCfg } = inp;
  const rules: EligibilityRules = { minDaysLive: cfg.minDaysLive, respect17LandsEmbargo: cfg.respect17LandsEmbargo, embargoDays: cfg.embargoDays };
  const sa = standardAnalysis(inp.wis, inp.cards, inp.scrySets, today);
  const { standard, disagree } = sa;
  const log: string[] = [...sa.log];
  const fatal: string[] = [...sa.fatal];

  const stdMap = standardToLimited(standard, setsCfg, inp.scrySets);
  for (const code of disagree) {
    const owner = [...stdMap.entries()].find(([, stds]) => stds.includes(code))?.[0];
    if (!owner && setsCfg.sets[code]) stdMap.set(code, [code]);
  }
  const releaseOf = (code: string): string | null => inp.fetch.releaseDates[code] ?? setsCfg.sets[code]?.arenaRelease ?? null;
  const poolCodes = [...stdMap.keys()].sort((a, b) => (releaseOf(a) ?? '9999').localeCompare(releaseOf(b) ?? '9999') || a.localeCompare(b));
  const candidateCodes = [...new Set([...Object.keys(setsCfg.sets), ...poolCodes])];
  const limited = new Map(candidateCodes.map((c) => [c, buildLimitedSet(c, setsCfg, inp.scrySets, inp.cards)] as const));
  const idx = buildJoinIndex(inp.cards, inp.cardsCsv);
  const setNames = new Map(inp.scrySets.map((s) => [s.code, s.name] as const));

  const fileProblems = new Map<string, string[]>();
  const noteProblem = (set: string, msg: string) => fileProblems.set(set, [...(fileProblems.get(set) ?? []), msg]);
  const unassigned: string[] = [];
  const assign = (list: SeventeenData[]): Assigned[] => {
    const out: Assigned[] = [];
    for (const d of list) {
      if (d.set) {
        out.push({ data: d, set: d.set, format: d.format ?? limited.get(d.set)?.format ?? setsCfg.defaultFormat });
        continue;
      }
      const inf = inferSet(d, [...limited.values()].filter((ls) => releaseOf(ls.code) !== null || setsCfg.sets[ls.code]), idx, cfg.validation.minMatchRate);
      if (!inf.set) {
        unassigned.push(`${d.path}: ${inf.detail}`);
        continue;
      }
      d.set = inf.set;
      const configured = limited.get(inf.set)?.format ?? setsCfg.defaultFormat;
      const format = d.formatOverride ?? configured;
      d.format = format;
      if (format !== configured) noteProblem(inf.set, `${d.path} is ${format} data (file-name override); the pool uses ${configured}, so it is not used`);
      log.push(`${d.path}: ${inf.detail}; ${format}; dated ${d.date} (${d.dateSource})`);
      out.push({ data: d, set: inf.set, format });
    }
    return out;
  };

  const chainFor = (list: Assigned[]) => {
    const groups = new Map<string, SeventeenData[]>();
    for (const a of list) {
      const k = `${a.set}|${a.format}`;
      groups.set(k, [...(groups.get(k) ?? []), a.data]);
    }
    const out = new Map<string, ChainResult>();
    for (const [k, ds] of groups) out.set(k, chooseNewestValid(ds, cfg.validation));
    return out;
  };

  const real = assign([...inp.exports, ...inp.snapshots]);
  let chains = chainFor(real);
  const realLive = poolCodes.some((c) => chains.get(`${c}|${limited.get(c)?.format}`)?.chosen);
  let synthetic = false;
  if (!realLive && inp.synthetic.length > 0) {
    synthetic = true;
    chains = chainFor(assign(inp.synthetic));
    log.push('No valid 17Lands data for any set: building on synthetic sample files. The deploy is skipped.');
  }
  for (const [k, ch] of chains) {
    for (const e of ch.entries) if (!e.result.ok) log.push(`${e.data.path} (${k.replace('|', ' ')}) refused: ${e.result.reasons.join('; ')}`);
  }

  const statuses: SetStatus[] = [];
  const liveJoined = new Map<string, { ls: LimitedSet; data: SeventeenData; joined: JoinedRow[]; unmatched: Unmatched[] }>();
  const unmatchedAll: Unmatched[] = [];
  const keptFromLastGood: string[] = [];

  for (const code of poolCodes) {
    const ls = limited.get(code) as LimitedSet;
    const release = releaseOf(code);
    const elig = eligibility(release, today, rules);
    const chain = chains.get(`${code}|${ls.format}`);
    const active = inp.fetch.activeSets.includes(code);
    const flags: string[] = [];
    const std = stdMap.get(code) ?? [code];
    const status: SetStatus = {
      code,
      name: ls.name,
      format: ls.format,
      state: 'missing',
      inPool: false,
      reason: '',
      flags,
      source: null,
      dataDate: null,
      active,
      release,
      eligibleFrom: elig.eligibleFrom,
      cards: null,
      standardCodes: std,
      exportLink: exportLink(code, ls.format),
      cardDataUrl: cardDataPageUrl(code, ls.format),
      unmatched: [],
    };
    statuses.push(status);
    if (inp.fetch.releaseDates[code] && ls.configRelease && inp.fetch.releaseDates[code] !== ls.configRelease) {
      flags.push(`17Lands start date ${inp.fetch.releaseDates[code]} differs from data/config/sets.json (${ls.configRelease})`);
    }
    for (const p of fileProblems.get(code) ?? []) flags.push(p);
    const stdDisagree = std.filter((s) => disagree.has(s));
    if (stdDisagree.length > 0) {
      flags.push(`Standard legality of ${stdDisagree.join('/')} is disputed (whatsinstandard vs Scryfall); keeping the last good data`);
      const lgSet = inp.lastGood?.manifest.sets.find((s) => s.code === code);
      const lgFile = inp.lastGood?.setFiles.get(code);
      if (lgSet && lgFile) {
        keptFromLastGood.push(code);
        Object.assign(status, { state: 'live', inPool: true, reason: `kept from the last deployment (${lgSet.dataDate})`, source: lgSet.source, dataDate: lgSet.dataDate, cards: lgSet.cards });
      } else {
        Object.assign(status, { state: 'held-back', reason: 'Standard legality disputed and no previously deployed data to keep' });
      }
      continue;
    }

    if (!elig.eligible) {
      status.state = 'held-back';
      status.reason =
        elig.reason === 'missing-release-date'
          ? 'no Arena release date (17Lands start_dates or data/config/sets.json)'
          : elig.reason === 'embargo'
            ? `17Lands embargo until ${elig.eligibleFrom} (Arena release ${release} + ${cfg.embargoDays} days)`
            : `live on Arena for fewer than ${cfg.minDaysLive} days (eligible ${elig.eligibleFrom})`;
      if (chain?.chosen) {
        status.source = chain.chosen.kind === 'snapshot' ? 'fetch' : chain.chosen.kind === 'synthetic' ? 'synthetic' : 'export';
        status.dataDate = chain.chosen.date;
      }
      continue;
    }

    if (!chain || chain.entries.length === 0) {
      status.state = 'missing';
      status.reason = active ? 'active on Arena but nothing fetched yet and no export in data/17lands/' : 'no export in data/17lands/';
      continue;
    }
    if (!chain.chosen) {
      const newest = chain.entries[chain.entries.length - 1];
      status.state = 'refused';
      status.reason = `${newest.data.path} refused: ${newest.result.reasons.join('; ')}; no earlier valid data`;
      continue;
    }

    const data = chain.chosen;
    const joined: JoinedRow[] = [];
    const unmatched: Unmatched[] = [];
    const seen = new Map<string, JoinedRow>();
    for (const row of data.rows) {
      const out = joinRow(row, ls, idx);
      if (!out.ok) {
        unmatched.push({ set: code, name: row.name, reason: out.reason });
        continue;
      }
      const prev = seen.get(out.match.oracleId);
      if (prev) {
        const keep = (row.gih ?? 0) > (prev.row.gih ?? 0) ? { row, match: out.match } : prev;
        const drop = keep === prev ? row : prev.row;
        unmatched.push({ set: code, name: drop.name, reason: `same oracle card as "${keep.row.name}"; kept the row with more games in hand` });
        if (keep !== prev) {
          joined[joined.indexOf(prev)] = keep;
          seen.set(out.match.oracleId, keep);
        }
        continue;
      }
      const jr = { row, match: out.match };
      seen.set(out.match.oracleId, jr);
      joined.push(jr);
    }
    unmatchedAll.push(...unmatched);
    status.unmatched = unmatched.map((u) => `${u.name}: ${u.reason}`);
    status.source = data.kind === 'snapshot' ? 'fetch' : data.kind === 'synthetic' ? 'synthetic' : 'export';
    status.dataDate = data.date;
    const graded = data.rows.filter((r) => typeof r.gihWr === 'number').length;
    if (graded < cfg.minGradedCards) {
      status.state = 'held-back';
      status.reason = `only ${graded} cards have a GIH WR; ${cfg.minGradedCards} are needed`;
      continue;
    }
    liveJoined.set(code, { ls, data, joined, unmatched });
    status.inPool = true;
    status.state = 'live';
    const age = daysBetween(data.date, today);
    status.reason = `${formatLabel(ls.format)} ${status.source === 'fetch' ? 'fetched' : status.source === 'synthetic' ? 'synthetic sample' : 'export'} from ${data.date}`;
    if (data.kind === 'synthetic') {
      status.state = 'missing';
      status.reason = 'no export in data/17lands/; this development build uses a synthetic sample';
    }
    if (chain.newestRefused) {
      status.state = 'refused';
      status.reason = `${chain.newestRefused.data.path} refused: ${chain.newestRefused.result.reasons.join('; ')}; using ${data.path} from ${data.date}`;
    }
    const fetchEntry = inp.fetch.state.sets[code];
    const shouldHaveFetched = active && !inp.fetch.disabled;
    if (shouldHaveFetched && fetchEntry && fetchEntry.date === today && fetchEntry.status !== 'ok') {
      if (status.state === 'live') status.state = 'fetch-failed';
      status.reason += `; today's fetch failed (${fetchEntry.message ?? fetchEntry.status})`;
      flags.push(`fetch failed ${fetchEntry.date}: ${fetchEntry.message ?? fetchEntry.status}`);
    } else if (shouldHaveFetched && inp.fetch.halted && data.date !== today) {
      if (status.state === 'live') status.state = 'fetch-failed';
      status.reason += '; 17Lands requests halted today after an error';
    }
    if (active && age > cfg.staleAfterDays) {
      if (status.state === 'live') status.state = 'stale';
      flags.push(`stale: newest data is ${age} days old while the set is active (daily fetch ${inp.fetch.disabled ? 'switched off' : 'failing'})`);
      if (status.state === 'stale') status.reason += `; ${age} days old while active on Arena`;
    }
  }

  const poolOracles = new Set<string>();
  for (const v of liveJoined.values()) for (const j of v.joined) poolOracles.add(j.match.oracleId);
  for (const code of keptFromLastGood) for (const c of inp.lastGood?.setFiles.get(code)?.cards ?? []) poolOracles.add(c.o);
  const tagIndex = buildTagIndex(inp.tags, poolOracles);
  if (inp.tags.length === 0) fatal.push('Scryfall oracle tags are empty');

  const setFiles: SetFile[] = [];
  const manifestSets: ManifestSet[] = [];
  for (const code of poolCodes) {
    const v = liveJoined.get(code);
    if (v) {
      const built = buildSetFile({ code, name: v.ls.name, format: v.ls.format, data: v.data, joined: v.joined, setNames, tags: tagIndex, minGraded: cfg.minGradedCards });
      if (!built.file) continue;
      const st = statuses.find((s) => s.code === code) as SetStatus;
      st.cards = built.file.cards.length;
      setFiles.push(built.file);
      manifestSets.push({
        code,
        name: v.ls.name,
        format: v.ls.format,
        formatLabel: formatLabel(v.ls.format),
        source: built.file.source,
        dataDate: built.file.dataDate,
        precision: built.file.precision,
        windowLabel: windowLabel(built.file.dataDate),
        cardDataUrl: cardDataPageUrl(code, v.ls.format),
        release: releaseOf(code) as string,
        cards: built.file.cards.length,
        mean: built.file.mean,
        sd: built.file.sd,
        file: '',
        bytes: 0,
        bonusSheets: v.ls.bonus.filter((b) => built.file?.cards.some((c) => c.b === b)).concat(built.file.cards.some((c) => c.b === 'spg') ? ['spg'] : []),
        scryfallCodes: [...new Set(built.file.cards.map((c) => c.p.set))].sort((a, b) => (a === v.ls.main ? -1 : b === v.ls.main ? 1 : a.localeCompare(b))),
      });
      continue;
    }
    if (keptFromLastGood.includes(code) && inp.lastGood) {
      const lgSet = inp.lastGood.manifest.sets.find((s) => s.code === code) as ManifestSet;
      const lgFile = inp.lastGood.setFiles.get(code) as SetFile;
      const remapped: SetFile = {
        ...lgFile,
        cards: lgFile.cards.map((c) => ({
          ...c,
          t: [...(tagIndex.byOracle.get(c.o) ?? [])].map((id) => tagIndex.indexOf.get(id)).filter((x): x is number => x !== undefined).sort((a, b) => a - b),
        })),
      };
      setFiles.push(remapped);
      manifestSets.push({ ...lgSet, heldOver: true });
    }
  }

  const rng = seededRng(`starters:${today}`);
  const allCards = setFiles.flatMap((f) => f.cards.map((c) => ({ set: f.code, c })));
  const starters: StarterCard[] = shuffle(allCards, rng)
    .slice(0, 32)
    .map(({ set, c }) => ({ set, o: c.o, id: c.p.id, v: c.p.image_version, name: c.p.name }));

  const known = [...new Set(inp.tags.map((t) => t.slug))].sort();
  const aliases: Record<string, string> = {};
  for (const t of inp.tags) for (const a of t.aliases) aliases[a] = t.slug;

  const notes: string[] = [];
  if (synthetic) notes.push('Synthetic sample data: win rates and grades are invented for development and are not 17Lands numbers.');
  for (const u of unassigned) {
    log.push(`Unassigned export ${u}`);
    notes.push(`Could not assign ${u}`);
  }
  for (const e of inp.exportErrors) log.push(`Unreadable file ${e.path}: ${e.message}`);

  const problems = [...unassigned.map((u) => `Unassigned export ${u}`), ...inp.exportErrors.map((e) => `Unreadable file ${e.path}: ${e.message}`)];
  const status: StatusFile = {
    schema: DATA_SCHEMA,
    generatedAt: inp.generatedAt,
    today,
    autoFetch17Lands: cfg.autoFetch17Lands,
    respect17LandsEmbargo: cfg.respect17LandsEmbargo,
    activeListDate: inp.fetch.filtersDate,
    synthetic,
    standard,
    sets: statuses,
    problems,
  };

  return {
    manifest: { schema: DATA_SCHEMA, generatedAt: inp.generatedAt, today, synthetic, sets: manifestSets, starters, notes },
    setFiles,
    tags: { schema: DATA_SCHEMA, slugs: tagIndex.slugs, labels: tagIndex.labels, aliases, known },
    status,
    unmatched: unmatchedAll,
    log,
    fatal,
  };
}

export type { OracleTag };
