import { useEffect, useState } from 'react';
import type { StatusFile } from '../../lib/data.ts';
import { useApp } from '../AppContext.tsx';
import { baseUrl } from '../engineClient.ts';
import { TapLink } from '../ui/Tap.tsx';
import { ScreenHead } from './ScreenHead.tsx';

const STATE: Record<string, string> = { live: 'Live', 'held-back': 'Held back', missing: 'Missing', refused: 'Refused', 'fetch-failed': 'Fetch failed', stale: 'Stale' };

export function DataScreen() {
  const { manifest } = useApp();
  const [status, setStatus] = useState<StatusFile | null>(null);
  useEffect(() => {
    if (!manifest) return;
    fetch(`${baseUrl()}data/${manifest.statusFile}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => setStatus(s as StatusFile | null))
      .catch(() => setStatus(null));
  }, [manifest]);
  const dateFmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return (
    <div className="screen">
      <ScreenHead title="Data" sub={manifest ? `Built ${dateFmt(manifest.today)}${manifest.synthetic ? ' · synthetic sample data' : ''}` : undefined} />
      {manifest?.synthetic && (
        <p className="notice notice--warn">
          These grades and win rates are invented sample data for development. They are not 17Lands numbers. Real data appears once the owner adds 17Lands exports.
        </p>
      )}
      <table className="table">
        <caption className="sr-only">Limited sets in the practice pool</caption>
        <thead>
          <tr>
            <th scope="col">Set</th>
            <th scope="col">Data</th>
            <th scope="col" className="num">
              Cards
            </th>
          </tr>
        </thead>
        <tbody>
          {(manifest?.sets ?? []).map((s) => (
            <tr key={s.code}>
              <th scope="row">
                <span className="table__strong">{s.code}</span> <span className="table__dim">{s.name}</span>
              </th>
              <td>
                <TapLink href={s.cardDataUrl}>17Lands Card Data</TapLink> · {s.code} {s.formatLabel} · {s.windowLabel}
                <span className="table__dim"> · {s.source === 'fetch' ? 'fetched daily' : s.source === 'export' ? 'export' : 'sample'}</span>
              </td>
              <td className="num">{s.cards}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {status && (
        <section>
          <h2 className="section-title smallcaps">Every Standard-legal limited set</h2>
          <ul className="status-list">
            {status.sets.map((s) => (
              <li key={s.code}>
                <span className={`status-pill status-pill--${s.state}`}>{STATE[s.state] ?? s.state}</span>
                <span className="table__strong">{s.code}</span> <span>{s.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
