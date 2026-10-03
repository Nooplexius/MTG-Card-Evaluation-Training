import { resolve } from 'node:path';
import { runBuild } from './build.ts';
import { todayUtc } from './eligibility.ts';

const ROOT = resolve(import.meta.dirname, '..');

function arg(name: string, args: string[]): string | null {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < args.length) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : null;
}

const flag = (name: string, args: string[]) => args.includes(`--${name}`);

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const today = arg('today', args) ?? todayUtc();
  const common = {
    root: ROOT,
    outDir: resolve(ROOT, arg('out', args) ?? 'public/data'),
    cacheDir: resolve(ROOT, arg('cache', args) ?? '.cache'),
    dataBranch: arg('data-branch', args) ? resolve(ROOT, arg('data-branch', args) as string) : null,
    today,
    offline: flag('offline', args),
    lastGoodUrl: arg('last-good', args),
  };
  switch (cmd) {
    case 'build': {
      const { exitCode } = await runBuild({ ...common, fetch17: flag('fetch', args), dryRun: false });
      process.exitCode = exitCode;
      return;
    }
    case 'status': {
      const { exitCode } = await runBuild({ ...common, fetch17: false, dryRun: true });
      process.exitCode = exitCode;
      return;
    }
    case 'synth': {
      const { generateSynthetic } = await import('./synth.ts');
      await generateSynthetic({ root: ROOT, cacheDir: common.cacheDir, today, offline: common.offline });
      return;
    }
    case 'corpus-record': {
      const { recordCorpus } = await import('./corpus.ts');
      await recordCorpus({ root: ROOT, cacheDir: common.cacheDir });
      return;
    }
    case 'corpus-drift': {
      const { corpusDrift } = await import('./corpus.ts');
      process.exitCode = await corpusDrift({ root: ROOT, strict: flag('strict', args) });
      return;
    }
    default:
      console.log('Usage: tsx pipeline/cli.ts <build|status|synth|corpus-record|corpus-drift> [--today YYYY-MM-DD] [--offline] [--fetch --data-branch DIR] [--last-good URL] [--out DIR]');
      process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : e);
  process.exitCode = 2;
});
