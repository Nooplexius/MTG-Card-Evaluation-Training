import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Manifest, SetFile, StatusFile } from '../src/lib/data.ts';
import { computeBuild, standardAnalysis, type ComputeOutput, type FetchSummary, type PipelineConfig } from './compute.ts';
import { discoverExports, loadSnapshots } from './exports/discover.ts';
import { eligibility } from './eligibility.ts';
import { CARDS_CSV_URL, indexCardsCsv, parseCardsCsv } from './inputs/cardsCsv.ts';
import { SharedInputError, getJson } from './inputs/http.ts';
import { bulkFile, loadCards, loadKeywordCatalog, loadOracleTags, loadSets, SCRYFALL_HEADERS, type ScryCard, type ScrySet } from './inputs/scryfall.ts';
import { dailyFetch, pruneSnapshots, readFetchState, readLatestFilters, releaseDatesFrom, type DataBranch } from './inputs/seventeen.ts';
import type { WisResponse } from './inputs/standard.ts';
import { buildLimitedSet, standardToLimited, type SetsConfig } from './limitedSets.ts';
import { renderStatus } from './status.ts';

export interface RunOptions {
  root: string;
  outDir: string;
  cacheDir: string;
  dataBranch: string | null;
  today: string;
  offline: boolean;
  /** Run the once-a-day 17Lands fetch (scheduled job only). */
  fetch17: boolean;
  /** Base URL of the deployed site, for reading back the last good manifest. */
  lastGoodUrl: string | null;
  /** Never contact 17Lands (CI): cards.csv comes from the cache, or the committed test subset. */
  no17Lands?: boolean;
  dryRun: boolean;
  quiet?: boolean;
}

export function readConfig(root: string): { pipeline: PipelineConfig; sets: SetsConfig } {
  const pipeline = JSON.parse(readFileSync(join(root, 'data/config/pipeline.json'), 'utf8')) as PipelineConfig;
  const sets = JSON.parse(readFileSync(join(root, 'data/config/sets.json'), 'utf8')) as SetsConfig;
  return { pipeline, sets };
}

export function userAgent(cfg: PipelineConfig): string {
  return `${cfg.appName}/1.0 (+${cfg.appUrl}; Limited card-evaluation trainer; one request per active set per day)`;
}

async function loadText(url: string, path: string, offline: boolean, maxAgeHours: number): Promise<string> {
  const { statSync } = await import('node:fs');
  if (existsSync(path)) {
    const age = (Date.now() - statSync(path).mtimeMs) / 3_600_000;
    if (offline || age < maxAgeHours) return readFileSync(path, 'utf8');
  }
  if (offline) throw new SharedInputError(`Offline and no cached copy of ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': SCRYFALL_HEADERS['User-Agent'] } });
  if (!res.ok) throw new SharedInputError(`GET ${url} returned HTTP ${res.status}`);
  const text = await res.text();
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
  return text;
}

export interface SharedInputs {
  wis: WisResponse;
  scrySets: ScrySet[];
  cards: ScryCard[];
  tags: Awaited<ReturnType<typeof loadOracleTags>>;
  cardsCsv: Map<string, Map<string, number[]>>;
  keywords: string[];
}

/** Loads every shared input; any failure is fatal for the run. With `cardsCsvFallback`, cards.csv is never downloaded. */
export async function loadSharedInputs(opts: { cacheDir: string; offline: boolean; today: string; setsCfg: SetsConfig; cardsCsvFallback?: string; log?: (m: string) => void }): Promise<SharedInputs> {
  const scryDir = join(opts.cacheDir, 'scryfall');
  const wisPath = join(opts.cacheDir, 'wis-standard.json');
  const wis = JSON.parse(await loadText('https://whatsinstandard.com/api/v6/standard.json', wisPath, opts.offline, 6)) as WisResponse;
  const scrySets = await loadSets(scryDir, opts.offline);
  const cardsPath = await bulkFile('default_cards', scryDir, opts.offline);
  const tagsPath = await bulkFile('oracle_tags', scryDir, opts.offline);
  const configured = Object.keys(opts.setsCfg.sets).map((c) => (opts.setsCfg.sets[c].scryfall ?? c).toLowerCase());
  const relevant = new Set<string>(['spg', 'mar', 'spm', 'spe', ...configured]);
  for (const s of scrySets) if (s.parent_set_code && relevant.has(s.parent_set_code)) relevant.add(s.code);
  for (const c of Object.values(opts.setsCfg.sets)) for (const b of c.extraBonus ?? []) relevant.add(b.toLowerCase());
  const recentCut = `${Number(opts.today.slice(0, 4)) - 5}${opts.today.slice(4)}`;
  const recentStd = new Set(scrySets.filter((s) => ['expansion', 'core'].includes(s.set_type) && (s.released_at ?? '') >= recentCut).map((s) => s.code));
  const cards = await loadCards(cardsPath, (c) => c.lang === 'en' && (relevant.has(c.set) || recentStd.has(c.set) || typeof c.arena_id === 'number'));
  const tags = await loadOracleTags(tagsPath);
  const csvPath = join(opts.cacheDir, '17lands', 'cards.csv');
  let csvText: string;
  if (opts.cardsCsvFallback) {
    const local = existsSync(csvPath) ? csvPath : opts.cardsCsvFallback;
    opts.log?.(`cards.csv read from ${local === csvPath ? 'the input cache' : 'the committed test subset'} (17Lands is not contacted).`);
    csvText = readFileSync(local, 'utf8');
  } else csvText = await loadText(CARDS_CSV_URL, csvPath, opts.offline, 24);
  const cardsCsv = indexCardsCsv(parseCardsCsv(csvText));
  const keywords = await loadKeywordCatalog(scryDir, opts.offline);
  return { wis, scrySets, cards, tags, cardsCsv, keywords };
}

async function readLastGood(url: string | null, wanted: string[]): Promise<{ manifest: Manifest; setFiles: Map<string, SetFile> } | null> {
  if (!url) return null;
  const base = url.endsWith('/') ? url : `${url}/`;
  try {
    const manifest = await getJson<Manifest>(`${base}data/manifest.json`, { Accept: 'application/json' });
    const setFiles = new Map<string, SetFile>();
    for (const s of manifest.sets.filter((x) => wanted.includes(x.code))) {
      setFiles.set(s.code, await getJson<SetFile>(`${base}data/${s.file}`, { Accept: 'application/json' }));
    }
    return { manifest, setFiles };
  } catch {
    return null;
  }
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 10);

export function writeOutput(outDir: string, out: ComputeOutput): Manifest {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'sets'), { recursive: true });
  const sets = out.manifest.sets.map((s) => {
    const file = out.setFiles.find((f) => f.code === s.code) as SetFile;
    const json = JSON.stringify(file);
    const name = `sets/${s.code}.${hash(json)}.json`;
    writeFileSync(join(outDir, name), json);
    return { ...s, file: name, bytes: Buffer.byteLength(json) };
  });
  const tagsJson = JSON.stringify(out.tags);
  const tagsFile = `tags.${hash(tagsJson)}.json`;
  writeFileSync(join(outDir, tagsFile), tagsJson);
  writeFileSync(join(outDir, 'status.json'), JSON.stringify(out.status, null, 1));
  const dataHash = hash(sets.map((s) => s.file).join('|') + tagsFile);
  const manifest: Manifest = { ...out.manifest, sets, dataHash, tagsFile, statusFile: 'status.json' };
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
  return manifest;
}

export async function runBuild(opts: RunOptions): Promise<{ out: ComputeOutput; manifest: Manifest | null; exitCode: number }> {
  const say = (m: string) => {
    if (!opts.quiet) console.log(m);
  };
  const { pipeline, sets: setsCfg } = readConfig(opts.root);
  if (opts.no17Lands && opts.fetch17) throw new Error('--fetch and --no-17lands contradict each other.');
  const shared = await loadSharedInputs({
    cacheDir: opts.cacheDir,
    offline: opts.offline,
    today: opts.today,
    setsCfg,
    cardsCsvFallback: opts.no17Lands ? join(opts.root, 'tests/fixtures/17lands/cards.csv') : undefined,
    log: say,
  });
  const db: DataBranch | null = opts.dataBranch ? { root: opts.dataBranch } : null;

  const sa = standardAnalysis(shared.wis, shared.cards, shared.scrySets, opts.today);
  const stdMap = standardToLimited(sa.standard, setsCfg, shared.scrySets);
  const poolCodes = [...stdMap.keys()];
  const savedFilters = db ? readLatestFilters(db) : null;
  let fetchSummary: FetchSummary = {
    disabled: !pipeline.autoFetch17Lands,
    halted: false,
    activeSets: [],
    filtersDate: savedFilters?.date ?? null,
    releaseDates: pipeline.autoFetch17Lands ? releaseDatesFrom(savedFilters?.response ?? null) : {},
    state: db ? readFetchState(db) : { sets: {} },
  };
  const targetsFor = (releaseDates: Record<string, string>) =>
    poolCodes.map((code) => {
      const ls = buildLimitedSet(code, setsCfg, shared.scrySets, shared.cards);
      const rel = releaseDates[code] ?? setsCfg.sets[code]?.arenaRelease ?? null;
      return { code, format: ls.format, eligible: eligibility(rel, opts.today, pipeline).eligible };
    });
  const live = savedFilters?.response.live_formats_by_expansion ?? {};
  fetchSummary.activeSets = targetsFor(fetchSummary.releaseDates).filter((t) => (live[t.code] ?? []).includes(t.format)).map((t) => t.code);

  if (opts.fetch17 && db && !opts.dryRun) {
    const res = await dailyFetch({
      enabled: pipeline.autoFetch17Lands,
      today: opts.today,
      targets: targetsFor(releaseDatesFrom(savedFilters?.response ?? null)),
      db,
      userAgent: userAgent(pipeline),
      fetch,
      log: say,
    });
    fetchSummary = {
      disabled: res.disabled,
      halted: res.halted,
      activeSets: res.activeSets,
      filtersDate: res.filtersDate,
      releaseDates: res.disabled ? {} : releaseDatesFrom(res.filters),
      state: res.state,
    };
    for (const f of res.failures) say(`17Lands fetch failed for ${f.code}: ${f.message} (stopped for the day)`);
  } else if (opts.fetch17 && !db) {
    say('No data branch checkout given (--data-branch); skipping the 17Lands fetch.');
  }

  const exp = discoverExports(join(opts.root, 'data/17lands'), opts.root, setsCfg.eventTypes, 'export');
  const syn = discoverExports(join(opts.root, 'data/synthetic'), opts.root, setsCfg.eventTypes, 'synthetic');
  const snaps = loadSnapshots(db);
  const disputed = [...stdMap.entries()].filter(([, stds]) => stds.some((s) => sa.disagree.has(s))).map(([k]) => k);
  const lastGood = disputed.length > 0 ? await readLastGood(opts.lastGoodUrl ?? pipeline.appUrl, disputed) : null;

  const out = computeBuild({
    today: opts.today,
    generatedAt: new Date().toISOString(),
    pipeline,
    setsCfg,
    wis: shared.wis,
    scrySets: shared.scrySets,
    cards: shared.cards,
    tags: shared.tags,
    cardsCsv: shared.cardsCsv,
    keywords: shared.keywords,
    exports: exp.data,
    exportErrors: [...exp.errors, ...snaps.errors, ...syn.errors],
    snapshots: snaps.data,
    synthetic: syn.data,
    fetch: fetchSummary,
    lastGood,
  });
  for (const w of [...exp.warnings, ...syn.warnings]) out.log.push(w);

  if (out.fatal.length > 0) {
    for (const f of out.fatal) console.error(`FATAL: ${f}`);
    return { out, manifest: null, exitCode: 2 };
  }
  let manifest: Manifest | null = null;
  if (!opts.dryRun) manifest = writeOutput(opts.outDir, out);
  if (opts.fetch17 && db && !opts.dryRun) {
    const inUse = new Set(out.status.sets.filter((s) => s.source === 'fetch' && s.dataDate).map((s) => `snapshots/${s.code}/${s.format}/${s.dataDate}.json`));
    const removed = pruneSnapshots(db, pipeline.keepSnapshots ?? 14, inUse);
    if (removed.length > 0) out.log.push(`Pruned ${removed.length} old snapshot(s) from the data branch (git history keeps them).`);
  }
  if (!opts.quiet) {
    for (const l of out.log) console.log(`· ${l}`);
    console.log('');
    console.log(renderStatus(out.status));
    if (out.unmatched.length > 0) {
      console.log(`\nUnmatched cards (${out.unmatched.length}):`);
      for (const u of out.unmatched) console.log(`  ${u.set}  ${u.name}: ${u.reason}`);
    } else console.log('\nUnmatched cards: none');
    if (manifest) console.log(`\nWrote ${manifest.sets.length} sets, ${manifest.sets.reduce((s, x) => s + x.cards, 0)} cards to ${opts.outDir} (dataHash ${manifest.dataHash}${manifest.synthetic ? ', SYNTHETIC' : ''}).`);
  }
  return { out, manifest, exitCode: 0 };
}

export function readStatusFile(outDir: string): StatusFile | null {
  const p = join(outDir, 'status.json');
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as StatusFile) : null;
}

export function listFiles(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir) : [];
}
