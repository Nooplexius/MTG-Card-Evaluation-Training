import { m } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { InsightsView } from '../../engine/insightService.ts';
import type { Insight } from '../../lib/insights.ts';
import { startDrill } from '../drillStore.ts';
import { engine } from '../engineClient.ts';
import { feedback } from '../feedback/feedback.ts';
import { gradeLabel } from '../practice/GradePad.tsx';
import { GradeChip } from '../practice/RevealPanel.tsx';
import { Zoom, type ZoomTarget } from '../practice/Zoom.tsx';
import { go, useRoute } from '../router.ts';
import { useReducedMotion } from '../settings.ts';
import { ScreenHead } from '../screens/ScreenHead.tsx';
import { Tap } from '../ui/Tap.tsx';

const sgn = (x: number) => `${x > 0 ? '+' : x < 0 ? '\u2212' : ''}${Math.abs(x).toFixed(1)}`;

function InsightCard({ ins, onExample, index }: { ins: Insight; onExample: (key: string, printingId: string) => void; index: number }) {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const enter = reduced ? { initial: { opacity: 0 }, animate: { opacity: 1 } } : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.05 * index, duration: 0.24 } };
  const tone = ins.kind === 'strength' ? 'strength' : ins.kind === 'behavior' ? 'behavior' : ins.effect > 0 ? 'over' : 'under';
  return (
    <m.article className={`insight insight--${tone}`} {...enter}>
      <h2 className="insight__headline">{ins.headline}</h2>
      {ins.tip && <p className="insight__tip">{ins.tip}</p>}
      {ins.examples.length > 0 && (
        <ul className="insight__examples" aria-label="Where it happened">
          {ins.examples.map((x) => (
            <li key={x.printingId}>
              <Tap fb="card.zoom" className="example" onTap={() => onExample(x.key, x.printingId)} aria-label={`${x.name ?? 'Card'}: you ${gradeLabel(x.user)}, 17Lands ${gradeLabel(x.actual)}`}>
                <span className="example__name">{x.name ?? 'Card'}</span>
                <span className="example__grades">
                  <span className="miss-row__you">{gradeLabel(x.user)}</span>
                  <span aria-hidden>→</span>
                  <GradeChip g={x.actual} size="sm" />
                </span>
              </Tap>
            </li>
          ))}
        </ul>
      )}
      <div className="insight__actions">
        {ins.kind === 'facet' && ins.facet && (
          <Tap
            fb="drill.start"
            className="btn btn--primary"
            onTap={() => {
              void startDrill(ins.facet?.id as string).then((ok) => {
                if (!ok) feedback('filter.error');
              });
            }}
          >
            Drill this
          </Tap>
        )}
        <Tap fb={open ? 'nav.back' : 'nav.open'} className="btn" onTap={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Hide evidence' : 'Evidence'}
        </Tap>
      </div>
      {open && (
        <div className="insight__evidence">
          <p>{ins.detail}</p>
          <dl className="evidence">
            <dt>Cards</dt>
            <dd className="num">{ins.n}</dd>
            {ins.kind !== 'behavior' || ins.id === 'behavior:compression' || ins.id === 'behavior:optimism' || ins.id === 'behavior:pessimism' ? (
              <>
                <dt>Effect</dt>
                <dd className="num">{ins.id === 'behavior:compression' || ins.id === 'behavior:expansion' ? `slope ${(1 + ins.effect).toFixed(2)}` : `${sgn(ins.effect)} steps`}</dd>
                <dt>95% interval</dt>
                <dd className="num">{ins.id === 'behavior:compression' || ins.id === 'behavior:expansion' ? `${(1 + ins.lo).toFixed(2)} to ${(1 + ins.hi).toFixed(2)}` : `${sgn(ins.lo)} to ${sgn(ins.hi)} steps`}</dd>
              </>
            ) : null}
            {ins.kind === 'facet' && (
              <>
                <dt>Effective sample</dt>
                <dd className="num">{ins.nEff.toFixed(0)}</dd>
              </>
            )}
          </dl>
          {ins.facet && (
            <p className="field__note">
              Facet query: <code>{ins.facet.query}</code>
            </p>
          )}
        </div>
      )}
    </m.article>
  );
}

/** How older first looks are weighted, in plain words. */
function MemoryNote({ memory }: { memory: NonNullable<InsightsView['memory']> }) {
  if (Number.isFinite(memory.halfLife)) {
    return (
      <p className="field__note memory-note">
        Recent first looks count more: one counts half after {memory.halfLife} newer ones, so these results rest on about {Math.round(memory.nEff)} effective first looks of {memory.n}. Loupe picked this rate because it predicts your next grades better than weighing everything equally; the evidence bar accounts for the smaller effective sample.
      </p>
    );
  }
  if (memory.scores.length > 0) {
    return <p className="field__note memory-note">All {memory.n} first looks count fully: your grading has been steady enough that older ones still describe you.</p>;
  }
  return null;
}

export function InsightsScreen() {
  const { param } = useRoute();
  const [view, setView] = useState<InsightsView | null>(null);
  const [zoom, setZoom] = useState<ZoomTarget | null>(null);
  const autostart = useRef(false);

  useEffect(() => {
    void engine()
      .call('insights')
      .then(setView);
  }, []);

  useEffect(() => {
    if (!param?.startsWith('drill:') || autostart.current) return;
    autostart.current = true;
    void startDrill(param.slice(6));
  }, [param]);

  const open = async (key: string, printingId: string) => {
    const v = await engine().call('snapshotView', printingId, key);
    if (v.view) setZoom({ printing: v.view.card.p, view: v.view });
    else if (v.snapshot) setZoom({ printing: v.snapshot.printing });
  };

  const cards = view?.insights.filter((i) => i.kind === 'facet') ?? [];
  const behavior = view?.insights.filter((i) => i.kind === 'behavior') ?? [];
  const strengths = view?.insights.filter((i) => i.kind === 'strength') ?? [];
  return (
    <div className="screen insights">
      <ScreenHead title="Insights" sub={view ? `From ${view.firstLooks} first looks${view.memory && Number.isFinite(view.memory.halfLife) ? ', recent ones weighted more' : ''}` : 'Working…'} />
      {view && view.firstLooks < view.needed && (
        <p className="notice">
          Insights need at least {view.needed} first looks to separate real patterns from noise; you have {view.firstLooks}. A few more sessions will do it.
        </p>
      )}
      {view && view.firstLooks >= view.needed && view.insights.length === 0 && <p className="notice">No clear weak spots yet: nothing in your first looks stands out beyond what chance would produce. Keep grading; the evidence bar is deliberately high.</p>}
      {view?.calibration && (
        <p className="field__note">
          Your calibration: slope {view.calibration.slope.toFixed(2)} (1 is ideal), offset at C {sgn(view.calibration.intercept)} steps, scatter ±{view.calibration.tau.toFixed(1)} steps.
        </p>
      )}
      {view?.memory && <MemoryNote memory={view.memory} />}
      {cards.length > 0 && <h2 className="section-title smallcaps">Weak spots</h2>}
      {cards.map((ins, i) => (
        <InsightCard key={ins.id} ins={ins} index={i} onExample={(k, p) => void open(k, p)} />
      ))}
      {behavior.length > 0 && <h2 className="section-title smallcaps">Habits</h2>}
      {behavior.map((ins, i) => (
        <InsightCard key={ins.id} ins={ins} index={i + cards.length} onExample={(k, p) => void open(k, p)} />
      ))}
      {strengths.length > 0 && <h2 className="section-title smallcaps">Strengths</h2>}
      {strengths.map((ins, i) => (
        <InsightCard key={ins.id} ins={ins} index={i + cards.length + behavior.length} onExample={(k, p) => void open(k, p)} />
      ))}
      {view && view.drills.length > 0 && (
        <section>
          <h2 className="section-title smallcaps">Drills</h2>
          <ul className="drill-list">
            {view.drills.map((d) => (
              <li key={d.id} className="drill-row">
                <span className="table__strong">{d.label}</span>
                <span className="field__note">
                  {d.done} cards{d.mastered ? ', mastered' : ''} · before the drill {sgn(d.preEffect)} ± {d.preSe.toFixed(1)} steps
                  {d.progress ? ` · on ${d.progress.n} later first looks ${sgn(d.progress.effect)} ± ${d.progress.se.toFixed(1)}` : ' · later first looks will show whether it stuck'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="row-actions">
        <Tap fb="nav.open" className="btn" onTap={() => go('stats')}>
          Stats
        </Tap>
        <Tap fb="nav.open" className="btn" onTap={() => go('practice')}>
          Practice
        </Tap>
      </div>
      {zoom && <Zoom target={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}
