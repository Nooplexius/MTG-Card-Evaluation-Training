import { m } from 'motion/react';
import { useEffect, useRef } from 'react';
import { UNCERTAINTY_SHOW_STEPS } from '../../lib/grades.ts';
import type { CardView } from '../../lib/view.ts';
import { Tap, TapLink } from '../ui/Tap.tsx';
import { gradeLabel, gradeSpoken } from './GradePad.tsx';
import { GradeStrip } from './GradeStrip.tsx';

export const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;
const signed = (x: number, digits = 1) => `${x >= 0 ? '+' : '\u2212'}${Math.abs(x).toFixed(digits)}`;

export function diffWords(err: number): { text: string; tone: 'exact' | 'close' | 'over' | 'under' } {
  if (err === 0) return { text: 'exact', tone: 'exact' };
  const n = Math.abs(err);
  const dir = err > 0 ? 'overrated' : 'underrated';
  const s = `${err > 0 ? '+' : '\u2212'}${n}, ${dir}`;
  return { text: s, tone: n <= 1 ? 'close' : err > 0 ? 'over' : 'under' };
}

function CountUp({ from, to, reduced }: { from: number; to: number; reduced: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      el.textContent = pct1(to);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 320);
      const e = 1 - Math.pow(1 - t, 3);
      el.textContent = pct1(from + (to - from) * e);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, reduced]);
  return <span ref={ref}>{pct1(reduced ? to : from)}</span>;
}

export function GradeChip({ g, size = 'md', stamp = false, reduced = false }: { g: number; size?: 'sm' | 'md' | 'lg' | 'xl'; stamp?: boolean; reduced?: boolean }) {
  const cls = `chip chip--${size}${g >= 3 ? ' chip--ink' : ''}`;
  if (!stamp) return <span className={cls} style={{ ['--gc' as string]: `var(--g${g})` }}>{gradeLabel(g)}</span>;
  return (
    <m.span
      className={cls}
      style={{ ['--gc' as string]: `var(--g${g})` }}
      initial={reduced ? { opacity: 0 } : { scale: 1.18, opacity: 0 }}
      animate={reduced ? { opacity: 1 } : { scale: 1, opacity: 1 }}
      transition={reduced ? { duration: 0.12 } : { type: 'spring', stiffness: 520, damping: 26, mass: 0.7 }}
    >
      {gradeLabel(g)}
    </m.span>
  );
}

/** The why-context: at most three short lines, each skipped when its columns are missing. */
export function whyLines(v: CardView): string[] {
  const s = v.card.s;
  const lines: string[] = [];
  const parts: string[] = [];
  if (typeof s.ohWr === 'number' && typeof s.gdWr === 'number') parts.push(`opening hand ${pct1(s.ohWr)} · drawn later ${pct1(s.gdWr)}`);
  if (typeof s.iih === 'number') parts.push(`IIH ${signed(s.iih * 100)} pp`);
  if (parts.length > 0) lines.push(parts.join(' · '));
  if (v.colorGroup) lines.push(`${v.colorGroup.label}: ${pct1(v.colorGroup.avg)} average, ${signed((v.colorGroup.avg - v.mean) * 100)} vs the set`);
  if (v.draftPct !== null && typeof s.alsa === 'number') {
    const taken = Math.round(v.draftPct);
    const wins = Math.round(v.perfPct);
    const gap = v.draftPct - v.perfPct;
    if (gap >= 25) lines.push(`Drafters take it ahead of ${taken}% of the set, but it out-wins only ${wins}%: over-drafted`);
    else if (gap <= -25) lines.push(`Drafters take it ahead of only ${taken}% of the set, but it out-wins ${wins}%: under-drafted`);
    else lines.push(`Pick order matches results: taken ahead of ${taken}% of the set, out-wins ${wins}% (ALSA ${s.alsa.toFixed(2)})`);
  }
  return lines.slice(0, 3);
}

export function scryfallUrl(v: CardView): string {
  return `https://scryfall.com/card/${v.card.p.set}/${encodeURIComponent(v.card.p.collector_number)}`;
}

export interface RevealProps {
  view: CardView;
  user: number;
  reduced: boolean;
  onNext: () => void;
  nextLabel: string;
  streak: number;
  notes?: string[];
}

export function RevealPanel({ view, user, reduced, onNext, nextLabel, streak, notes = [] }: RevealProps) {
  const actual = view.card.g;
  const err = user - actual;
  const d = diffWords(err);
  const nextRef = useRef<HTMLButtonElement>(null);
  const noisy = view.seSteps >= UNCERTAINTY_SHOW_STEPS;
  const enter = (delay: number) => (reduced ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.12 } } : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.2, delay } });

  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true });
  }, [view.key]);

  return (
    <div className="reveal">
      <div className="reveal__scroll">
        <p className="sr-only" role="status" aria-live="assertive">
          {`17Lands grade ${gradeSpoken(actual)}. You said ${gradeSpoken(user)}. ${err === 0 ? 'Exact.' : `${Math.abs(err)} step${Math.abs(err) === 1 ? '' : 's'} ${err > 0 ? 'over' : 'under'}.`} GIH win rate ${pct1(view.card.s.gihWr)}, rank ${view.card.r} of ${view.n}.`}
        </p>
        <div className="reveal__head">
          <div className="reveal__side">
            <span className="smallcaps">You</span>
            <GradeChip g={user} size="lg" />
          </div>
          <div className="reveal__truth">
            <span className="smallcaps">17Lands</span>
            <GradeChip g={actual} size="xl" stamp reduced={reduced} />
          </div>
          <m.div className={`reveal__diff tone-${d.tone}`} {...enter(0.06)}>
            <span className="reveal__diffText display">{err === 0 ? 'Exact' : `${err > 0 ? '+' : '\u2212'}${Math.abs(err)}`}</span>
            <span className="reveal__diffUnit">{err === 0 ? 'on the 13-step scale' : `step${Math.abs(err) === 1 ? '' : 's'} ${err > 0 ? 'overrated' : 'underrated'}`}</span>
            {streak >= 3 && <span className="reveal__streak">{streak} in a row</span>}
          </m.div>
        </div>
        <GradeStrip user={user} actual={actual} reduced={reduced} uncertainty={noisy ? view.seSteps : 0} />
        {notes.map((n) => (
          <m.p key={n} className="reveal__note" {...enter(0.3)}>
            {n}
          </m.p>
        ))}
        <m.div className="reveal__numbers num" {...enter(0.04)}>
          <span>
            GIH WR{' '}
            <b>
              <CountUp from={view.mean} to={view.card.s.gihWr} reduced={reduced} />
            </b>
          </span>
          <span>set mean {pct1(view.mean)}</span>
          <span>
            #{view.card.r} of {view.n}
          </span>
          <span>{view.card.s.gih.toLocaleString('en-US')} games in hand</span>
        </m.div>
        {noisy && (
          <m.p className="reveal__noise" {...enter(0.1)}>
            Noisy truth: ±{view.seSteps.toFixed(1)} steps of sampling error on {view.card.s.gih.toLocaleString('en-US')} games.
          </m.p>
        )}
        <m.ul className="reveal__why" {...enter(0.12)}>
          {whyLines(view).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </m.ul>
        <div className="reveal__links">
          <TapLink href={scryfallUrl(view)}>Scryfall</TapLink>
          <TapLink href={view.cardDataUrl}>17Lands Card Data · {view.set}</TapLink>
        </div>
      </div>
      <Tap ref={nextRef} fb="card.next" className="next" onTap={onNext}>
        {nextLabel}
      </Tap>
    </div>
  );
}
