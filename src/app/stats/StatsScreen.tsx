import { useEffect, useMemo, useState } from 'react';
import type { GroupRow, Headline } from '../../lib/analytics.ts';
import type { StatsResult } from '../../engine/analyticsService.ts';
import { engine } from '../engineClient.ts';
import { go } from '../router.ts';
import { useReducedMotion } from '../settings.ts';
import { ScreenHead } from '../screens/ScreenHead.tsx';
import { Tap } from '../ui/Tap.tsx';
import { CalibrationPlot, Confusion, LearningCurve } from './Charts.tsx';
import { DEFAULT_SCOPE, StatsControls, type Scope } from './StatsControls.tsx';

export const f2 = (x: number | null, d = 2) => (x === null ? '—' : x.toFixed(d));
export const pc = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
export const sgn = (x: number | null, d = 2) => (x === null ? '—' : `${x > 0 ? '+' : x < 0 ? '\u2212' : ''}${Math.abs(x).toFixed(d)}`);

function HeadTable({ first, review }: { first: Headline; review: Headline }) {
  const rows: Array<[string, (h: Headline) => string, string]> = [
    ['Mean error', (h) => f2(h.mae), 'steps; one step is B to B+'],
    ['Within one step', (h) => pc(h.within), 'counts as correct'],
    ['Exact', (h) => pc(h.exact), ''],
    ['Bias', (h) => sgn(h.bias), '+ means you grade too high'],
    ['Calibration slope', (h) => f2(h.slope), 'below 1: too timid at the extremes'],
    ['Offset at C', (h) => sgn(h.intercept), 'optimism (+) or pessimism (−)'],
    ['Rank correlation', (h) => f2(h.spearman), 'ordering skill; 1 is perfect'],
    ['Cards graded', (h) => String(h.n), ''],
    ['Trend', (h) => (h.trend === null ? '—' : `${sgn(h.trend)} ${h.trend <= 0 ? '(better)' : '(worse)'}`), 'recent half vs earlier half'],
  ];
  return (
    <table className="table head-table">
      <thead>
        <tr>
          <th scope="col">
            <span className="sr-only">Measure</span>
          </th>
          <th scope="col" className="num">
            First looks
          </th>
          <th scope="col" className="num">
            Reviews
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, fn, note]) => (
          <tr key={label}>
            <th scope="row">
              <span className="table__strong">{label}</span>
              {note && <span className="table__note">{note}</span>}
            </th>
            <td className="num head-table__v">{fn(first)}</td>
            <td className="num head-table__v">{fn(review)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type SortKey = 'n' | 'mae' | 'bias' | 'trend' | 'label';

export function GroupTable({ rows, caption, onRow, firstLabel = 'Facet' }: { rows: Array<GroupRow & { group?: string }>; caption: string; onRow?: (r: GroupRow) => void; firstLabel?: string }) {
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'n', dir: -1 });
  const sorted = useMemo(() => {
    const v = (r: GroupRow) => (sort.k === 'label' ? r.label : sort.k === 'bias' ? Math.abs(r.bias ?? 0) : (r[sort.k] ?? -Infinity));
    return [...rows].sort((a, b) => {
      const x = v(a);
      const y = v(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, sort]);
  const head = (k: SortKey, label: string, num = true) => (
    <th scope="col" className={num ? 'num' : ''} aria-sort={sort.k === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <Tap fb="sort.change" className="th-btn" onTap={() => setSort((s) => ({ k, dir: s.k === k ? ((-s.dir) as 1 | -1) : k === 'label' ? 1 : -1 }))}>
        {label}
        {sort.k === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
      </Tap>
    </th>
  );
  return (
    <table className="table group-table">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          {head('label', firstLabel, false)}
          {head('n', 'n')}
          {head('mae', 'Error')}
          {head('bias', 'Bias')}
          {head('trend', 'Trend')}
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.id}>
            <th scope="row">
              {onRow ? (
                <Tap fb="nav.open" className="row-link" onTap={() => onRow(r)}>
                  {r.label}
                </Tap>
              ) : (
                r.label
              )}
              {r.group && <span className="table__note">{r.group}</span>}
            </th>
            <td className="num">{r.n}</td>
            <td className="num">{f2(r.mae)}</td>
            <td className={`num ${(r.bias ?? 0) >= 0.5 ? 'is-over' : (r.bias ?? 0) <= -0.5 ? 'is-under' : ''}`}>{sgn(r.bias)}</td>
            <td className="num">{r.trend === null ? '—' : sgn(r.trend)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StatsScreen() {
  const reduced = useReducedMotion();
  const [scope, setScope] = useState<Scope>(DEFAULT_SCOPE);
  const [res, setRes] = useState<StatsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    void engine()
      .call('stats', scope)
      .then((r) => {
        if (!live) return;
        setRes(r);
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [scope]);

  const facets = res ? (showAll ? res.facets : [...res.facets].sort((a, b) => b.n - a.n).slice(0, 14)) : [];
  return (
    <div className="screen stats">
      <ScreenHead title="Stats" sub={res ? `${res.total} evaluations${res.changed ? ` · ${res.changed} with changed grades` : ''}` : 'Loading…'} />
      <StatsControls scope={scope} onChange={setScope} />
      {res?.error && <p className="filter__error">{res.error}</p>}
      {res?.needsConnection && <p className="filter__warn">This filter needs a connection to Scryfall.</p>}
      {res && res.total === 0 && !loading && <p className="notice">No evaluations match yet. Grade some cards, then come back.</p>}
      {res && res.total > 0 && (
        <>
          <section aria-busy={loading}>
            <h2 className="section-title smallcaps">Headline</h2>
            <p className="field__note">First looks here are uniformly sampled first looks only (Random mode and Adaptive probes), so they measure skill rather than the scheduler's mix.</p>
            <HeadTable first={res.headFirst} review={res.headReview} />
            <p className="field__note">
              {res.streaks.correctNow} correct in a row (best {res.streaks.correctBest}) · {res.streaks.days} day{res.streaks.days === 1 ? '' : 's'} in a row · {res.streaks.today} today
            </p>
          </section>
          <section>
            <h2 className="section-title smallcaps">Learning curve</h2>
            <p className="field__note">Rolling mean error over your last 20 uniformly sampled first looks, in steps.</p>
            <LearningCurve points={res.curve} reduced={reduced} />
          </section>
          <section>
            <h2 className="section-title smallcaps">Calibration</h2>
            <p className="field__note">Your average grade for each 17Lands grade. On the diagonal is perfect; a line flatter than the diagonal means you compress grades toward the middle.</p>
            <CalibrationPlot bins={res.calibration} reduced={reduced} />
          </section>
          <section>
            <h2 className="section-title smallcaps">Confusion</h2>
            <p className="field__note">Rows are 17Lands grades (A+ at the top), columns are your grades; the outlined diagonal is exact.</p>
            <Confusion m={res.confusion} reduced={reduced} />
          </section>
          <section>
            <h2 className="section-title smallcaps">By facet</h2>
            <GroupTable rows={facets} caption="Accuracy by card facet" onRow={(r) => go('history', `q:${res.facets.find((x) => x.id === r.id)?.query ?? ''}`)} />
            {res.facets.length > 14 && (
              <Tap fb="action.secondary" className="btn" onTap={() => setShowAll((s) => !s)}>
                {showAll ? 'Show the 14 largest' : `Show all ${res.facets.length} facets`}
              </Tap>
            )}
          </section>
          <section>
            <h2 className="section-title smallcaps">By set</h2>
            <GroupTable rows={res.sets} firstLabel="Set" caption="Accuracy by limited set" onRow={(r) => go('history', `q:lset:${r.id.toLowerCase()}`)} />
          </section>
        </>
      )}
    </div>
  );
}
