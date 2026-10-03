import type { SetState, StatusFile } from '../src/lib/data.ts';
import { formatLabel } from '../src/lib/data.ts';

const STATE_LABEL: Record<SetState, string> = {
  live: 'live',
  'held-back': 'held back',
  missing: 'missing',
  refused: 'refused',
  'fetch-failed': 'fetch failed',
  stale: 'stale',
};

const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));

/** Plain-text status table: every Standard-legal limited set with its state, reason and export link when not live and fresh. */
export function renderStatus(st: StatusFile): string {
  const lines: string[] = [];
  lines.push(
    `Status on ${st.today} · autoFetch17Lands ${st.autoFetch17Lands ? 'on' : 'off'} · 17Lands embargo ${st.respect17LandsEmbargo ? 'respected' : 'OFF (local/private builds only)'} · active-set list ${st.activeListDate ? `from ${st.activeListDate}` : 'never fetched'}${st.synthetic ? ' · SYNTHETIC SAMPLE DATA' : ''}`,
  );
  lines.push(`Standard (${st.standard.length}): ${st.standard.join(' ')}`);
  lines.push('');
  lines.push(`${pad('SET', 5)}${pad('FORMAT', 17)}${pad('STATE', 14)}${pad('SOURCE', 11)}${pad('DATA', 12)}${pad('CARDS', 7)}REASON`);
  for (const s of st.sets) {
    const covers = s.standardCodes.filter((c) => c !== s.code);
    lines.push(
      `${pad(s.code, 5)}${pad(formatLabel(s.format), 17)}${pad(STATE_LABEL[s.state] + (s.active ? '*' : ''), 14)}${pad(s.source ?? '—', 11)}${pad(s.dataDate ?? '—', 12)}${pad(s.cards === null ? '—' : String(s.cards), 7)}${s.reason}${covers.length > 0 ? ` (includes ${covers.join(', ')})` : ''}`,
    );
    for (const f of s.flags) lines.push(`${' '.repeat(5)}! ${f}`);
    if (s.unmatched.length > 0) lines.push(`${' '.repeat(5)}! ${s.unmatched.length} unmatched: ${s.unmatched.slice(0, 5).join(' | ')}${s.unmatched.length > 5 ? ' | …' : ''}`);
  }
  lines.push('* active on Arena in its configured format (fetched daily once the embargo has passed)');
  const pool = st.sets.filter((s) => s.inPool);
  lines.push('');
  lines.push(`Pool: ${pool.length} limited sets (${pool.map((s) => s.code).join(' ')}), ${pool.reduce((n, s) => n + (s.cards ?? 0), 0)} cards.`);
  const needs = st.sets.filter((s) => s.state !== 'live' || st.synthetic);
  if (needs.length > 0) {
    lines.push('');
    lines.push('Export links for sets that are not live and fresh (Table view, all column groups, All time, no filters → Export data → Download as CSV → data/17lands/):');
    for (const s of needs) lines.push(`  ${pad(s.code, 5)}${s.exportLink}`);
  }
  for (const p of st.problems) lines.push(`! ${p}`);
  return lines.join('\n');
}
