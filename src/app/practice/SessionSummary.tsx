import { m } from 'motion/react';
import { useEffect, useState } from 'react';
import { displayName } from '../../lib/card.ts';
import type { Evaluation, Session } from '../../lib/types.ts';
import type { CardView } from '../../lib/view.ts';
import { engine } from '../engineClient.ts';
import { feedback } from '../feedback/feedback.ts';
import { go } from '../router.ts';
import { getSettings, setSettings, useReducedMotion } from '../settings.ts';
import { Tap } from '../ui/Tap.tsx';
import { gradeLabel } from './GradePad.tsx';
import { GradeChip, diffWords } from './RevealPanel.tsx';
import { Zoom, type ZoomTarget } from './Zoom.tsx';

/** The three biggest misses, one per card (a missed card often returns later in the same session). */
function worstByCard(es: Evaluation[]): Evaluation[] {
  const byKey = new Map<string, Evaluation>();
  for (const e of es) {
    const cur = byKey.get(e.key);
    if (!cur || Math.abs(e.user - e.actual) > Math.abs(cur.user - cur.actual)) byKey.set(e.key, e);
  }
  return [...byKey.values()].sort((a, b) => Math.abs(b.user - b.actual) - Math.abs(a.user - a.actual)).slice(0, 3);
}

export interface SummaryExtras {
  recentMae: number | null;
  drill: { facetId: string; label: string; query: string; headline: string } | null;
}

export function SessionSummary({ session, onNew, drillLabel, onEndDrill }: { session: Session; onNew: () => void; drillLabel?: string; onEndDrill?: () => void }) {
  const reduced = useReducedMotion();
  const [evals, setEvals] = useState<Evaluation[] | null>(null);
  const [views, setViews] = useState<Record<string, CardView | null>>({});
  const [extras, setExtras] = useState<SummaryExtras | null>(null);
  const [zoom, setZoom] = useState<ZoomTarget | null>(null);
  const [best, setBest] = useState<{ rate: number; isNew: boolean } | null>(null);
  const [streak, setStreak] = useState<{ days: number; today: number } | null>(null);

  useEffect(() => {
    void engine()
      .call('sessionEvaluations', session.id)
      .then(async (es) => {
        setEvals(es);
        const firsts = es.filter((e) => e.firstLook);
        if (firsts.length >= 8) {
          const rate = firsts.filter((e) => Math.abs(e.user - e.actual) <= 1).length / firsts.length;
          const prev = getSettings().bestFirstLook;
          const isNew = rate > prev;
          if (isNew) {
            setSettings({ bestFirstLook: rate });
            setTimeout(() => feedback('milestone'), 500);
          }
          setBest({ rate, isNew });
        }
        const worst = worstByCard(es);
        const vs: Record<string, CardView | null> = {};
        for (const w of worst) vs[w.key] = await engine().call('view', w.key);
        setViews(vs);
      });
    void engine()
      .call('streakInfo')
      .then((s) => setStreak({ days: s.days, today: s.today }));
    void engine()
      .call('summaryExtras', session.id)
      .then((x) => setExtras(x as SummaryExtras))
      .catch(() => setExtras({ recentMae: null, drill: null }));
  }, [session.id]);

  const n = evals?.length ?? 0;
  const errs = (evals ?? []).map((e) => e.user - e.actual);
  const within = n > 0 ? errs.filter((x) => Math.abs(x) <= 1).length / n : 0;
  const exact = n > 0 ? errs.filter((x) => x === 0).length / n : 0;
  const mae = n > 0 ? errs.reduce((s, x) => s + Math.abs(x), 0) / n : 0;
  const worst = worstByCard(evals ?? []);
  const enter = (i: number) => (reduced ? { initial: { opacity: 0 }, animate: { opacity: 1 } } : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.06 * i, duration: 0.24 } });
  const delta = extras?.recentMae !== null && extras?.recentMae !== undefined && n > 0 ? mae - extras.recentMae : null;

  return (
    <div className="screen summary">
      <header className="screen__head">
        <h1>{drillLabel ? `Drill done: ${drillLabel}` : 'Session complete'}</h1>
        <p className="screen__sub">{n} cards graded</p>
      </header>
      <m.section className="summary__numbers" {...enter(0)}>
        <div className="big-stat">
          <span className="big-stat__value display num">{Math.round(within * 100)}%</span>
          <span className="big-stat__label">within one step</span>
        </div>
        <div className="big-stat">
          <span className="big-stat__value display num">{Math.round(exact * 100)}%</span>
          <span className="big-stat__label">exact</span>
        </div>
        <div className="big-stat">
          <span className="big-stat__value display num">{mae.toFixed(2)}</span>
          <span className="big-stat__label">mean error (steps)</span>
        </div>
      </m.section>
      {(best || streak) && (
        <m.p className="summary__meta" {...enter(1)}>
          {best ? (best.isNew ? `New personal best: ${Math.round(best.rate * 100)}% of first looks within one step. ` : `First looks within one step: ${Math.round(best.rate * 100)}% (best ${Math.round(getSettings().bestFirstLook * 100)}%). `) : ''}
          {streak ? `${streak.today} of ${getSettings().dailyGoal} cards today · ${streak.days}-day streak` : ''}
        </m.p>
      )}
      {delta !== null && (
        <m.p className={`summary__delta ${delta <= 0 ? 'is-better' : 'is-worse'}`} {...enter(1)}>
          {delta <= 0 ? `${Math.abs(delta).toFixed(2)} steps closer than your recent sessions` : `${delta.toFixed(2)} steps further off than your recent sessions`}
        </m.p>
      )}
      {worst.length > 0 && (
        <m.section {...enter(2)}>
          <h2 className="section-title smallcaps">Biggest misses</h2>
          <ul className="miss-list">
            {worst.map((w) => {
              const v = views[w.key];
              const d = diffWords(w.user - w.actual);
              return (
                <li key={w.id}>
                  <Tap fb="card.zoom" className="miss-row" onTap={() => v && setZoom({ printing: v.card.p, view: v })} disabled={!v} aria-label={`Review ${v ? displayName(v.card.p) : 'card'}`}>
                    <span className="miss-row__name">{v ? displayName(v.card.p) : '…'}</span>
                    <span className="miss-row__grades">
                      <span className="miss-row__you">{gradeLabel(w.user)}</span>
                      <span aria-hidden>→</span>
                      <GradeChip g={w.actual} size="sm" />
                    </span>
                    <span className={`miss-row__diff tone-${d.tone}`}>{d.text}</span>
                  </Tap>
                </li>
              );
            })}
          </ul>
        </m.section>
      )}
      {extras?.drill && !drillLabel && (
        <m.section className="summary__drill" {...enter(3)}>
          <h2 className="section-title smallcaps">Recommended next</h2>
          <p>{extras.drill.headline}</p>
          <Tap fb="drill.start" className="btn btn--primary" onTap={() => go('insights', `drill:${extras.drill?.facetId}`)}>
            Drill this
          </Tap>
        </m.section>
      )}
      <div className="summary__actions">
        {drillLabel ? (
          <Tap fb="action.primary" className="btn btn--primary" onTap={() => onEndDrill?.()}>
            Back to practice
          </Tap>
        ) : (
          <Tap fb="action.primary" className="btn btn--primary" onTap={onNew}>
            New session
          </Tap>
        )}
        <Tap fb="nav.open" className="btn" onTap={() => go('stats')}>
          Stats
        </Tap>
      </div>
      {zoom && <Zoom target={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}
