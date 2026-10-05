import { useEffect, useState } from 'react';
import type { HistoryRow } from '../../engine/analyticsService.ts';
import { engine } from '../engineClient.ts';
import { gradeLabel } from '../practice/GradePad.tsx';
import { GradeChip, diffWords } from '../practice/RevealPanel.tsx';
import { Zoom, type ZoomTarget } from '../practice/Zoom.tsx';
import { useRoute } from '../router.ts';
import { ScreenHead } from '../screens/ScreenHead.tsx';
import { Tap } from '../ui/Tap.tsx';
import { DEFAULT_SCOPE, StatsControls, type Scope } from './StatsControls.tsx';

type Sort = 'recent' | 'worst' | 'over' | 'under';

export function HistoryScreen() {
  const { param } = useRoute();
  const preset = param?.startsWith('q:') ? param.slice(2) : '';
  const [scope, setScope] = useState<Scope>({ ...DEFAULT_SCOPE, query: preset });
  const [sort, setSort] = useState<Sort>(preset ? 'worst' : 'recent');
  const [res, setRes] = useState<{ rows: HistoryRow[]; total: number; error: string | null } | null>(null);
  const [zoom, setZoom] = useState<ZoomTarget | null>(null);

  useEffect(() => {
    setScope((s) => ({ ...s, query: preset }));
  }, [preset]);

  useEffect(() => {
    let live = true;
    void engine()
      .call('history', { ...scope, sort, limit: 300 })
      .then((r) => live && setRes(r));
    return () => {
      live = false;
    };
  }, [scope, sort]);

  const open = async (r: HistoryRow) => {
    const v = await engine().call('snapshotView', r.printingId, r.key);
    if (v.view) setZoom({ printing: v.view.card.p, view: v.view });
    else if (v.snapshot) setZoom({ printing: v.snapshot.printing });
  };

  const dateFmt = (ts: number) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return (
    <div className="screen history">
      <ScreenHead title="History" sub={res ? `${res.total} evaluations` : 'Loading…'} />
      <StatsControls scope={scope} onChange={setScope} />
      <div className="seg seg--sort" role="radiogroup" aria-label="Sort">
        {(
          [
            ['recent', 'Recent'],
            ['worst', 'Worst misses'],
            ['over', 'Most overrated'],
            ['under', 'Most underrated'],
          ] as Array<[Sort, string]>
        ).map(([k, l]) => (
          <Tap key={k} fb="sort.change" role="radio" aria-checked={sort === k} className={`seg__opt${sort === k ? ' is-on' : ''}`} onTap={() => setSort(k)}>
            {l}
          </Tap>
        ))}
      </div>
      {res?.error && <p className="filter__error">{res.error}</p>}
      {res && res.total === 0 && <p className="notice">Nothing here yet.</p>}
      <ul className="hist-list">
        {(res?.rows ?? []).map((r) => {
          const d = diffWords(r.err);
          return (
            <li key={r.id}>
              <Tap fb="card.zoom" className="hist-row" onTap={() => void open(r)} aria-label={`${r.name}: you ${gradeLabel(r.user)}, 17Lands ${gradeLabel(r.actual)}. Open`}>
                <span className="hist-row__main">
                  <span className="hist-row__name">{r.name}</span>
                  <span className="hist-row__meta">
                    {r.lset} · {dateFmt(r.ts)}
                    {r.firstLook ? ' · first look' : ''}
                    {r.changed ? ` · grade changed (was ${gradeLabel(r.snapshotActual)})` : ''}
                  </span>
                </span>
                <span className="hist-row__grades">
                  <span className="miss-row__you">{gradeLabel(r.user)}</span>
                  <span aria-hidden>→</span>
                  <GradeChip g={r.actual} size="sm" />
                </span>
                <span className={`hist-row__diff tone-${d.tone}`}>{d.text}</span>
              </Tap>
            </li>
          );
        })}
      </ul>
      {res && res.total > res.rows.length && <p className="field__note">Showing the first {res.rows.length}. Narrow the filter to see more.</p>}
      {zoom && <Zoom target={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}
