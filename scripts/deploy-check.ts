/**
 * Decides whether the data-and-deploy workflow publishes this build, and writes the data status to the job summary.
 * Outputs (GITHUB_OUTPUT): deploy=true|false, reason=<text>. Exits 1 only when the config breaks a deployment rule.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Manifest, StatusFile } from '../src/lib/data.ts';
import { readConfig } from '../pipeline/build.ts';
import { renderStatus } from '../pipeline/status.ts';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'public/data');
const { pipeline } = readConfig(root);
const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8')) as Manifest;
const status = JSON.parse(readFileSync(join(out, 'status.json'), 'utf8')) as StatusFile;
const event = process.env.GITHUB_EVENT_NAME ?? 'local';

async function pagesEnabled(): Promise<boolean | null> {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) return null;
  const res = await fetch(`https://api.github.com/repos/${repo}/pages`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': `${pipeline.appName}/1.0 deploy check` },
  });
  if (res.status === 404) return false;
  return res.ok ? true : null;
}

async function liveDataHash(): Promise<string | null> {
  try {
    const res = await fetch(new URL('data/manifest.json', pipeline.appUrl), { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } });
    return res.ok ? ((await res.json()) as Manifest).dataHash : null;
  } catch {
    return null;
  }
}

async function decide(): Promise<{ deploy: boolean; reason: string; fail?: boolean }> {
  if (!pipeline.respect17LandsEmbargo) return { deploy: false, fail: true, reason: 'respect17LandsEmbargo is off in data/config/pipeline.json. The public deployment keeps the 17Lands embargo on; turn it back on to deploy.' };
  if (manifest.synthetic) return { deploy: false, reason: 'No valid 17Lands data yet, so this build uses synthetic samples and is not deployed. Waiting for exports in data/17lands/ or the first daily fetch (see the export links below).' };
  const pages = await pagesEnabled();
  if (pages === false) return { deploy: false, reason: 'GitHub Pages is not enabled for this repository. One-time step: Settings → Pages → Build and deployment → Source: GitHub Actions, then re-run this workflow.' };
  if (event === 'schedule') {
    const live = await liveDataHash();
    if (live === manifest.dataHash) return { deploy: false, reason: `Data unchanged since the last deploy (dataHash ${live}).` };
    return { deploy: true, reason: live ? `Data changed (${live} → ${manifest.dataHash}).` : 'No live deployment found; deploying.' };
  }
  return { deploy: true, reason: `Triggered by ${event}; deploying real data (dataHash ${manifest.dataHash}).` };
}

const d = await decide();
console.log(d.reason);
console.log('');
console.log(renderStatus(status));
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `deploy=${d.deploy}\nreason=${d.reason.replace(/\n/g, ' ')}\n`);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${d.deploy ? 'Deploying' : 'Not deploying'}\n\n${d.reason}\n\n\`\`\`\n${renderStatus(status)}\n\`\`\`\n`);
}
if (d.fail) process.exitCode = 1;
