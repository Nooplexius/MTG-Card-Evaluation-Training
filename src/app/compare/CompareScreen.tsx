import { m } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { displayName } from '../../lib/card.ts';
import { levelLabel } from '../../lib/compare.ts';
import type { CardView } from '../../lib/view.ts';
import { useApp } from '../AppContext.tsx';
import { feedback } from '../feedback/feedback.ts';
import { filterLabel, usePracticeFilter } from '../filter/practiceFilter.ts';
import { useOffline } from '../offline.ts';
import { CardFace } from '../practice/CardFace.tsx';
import { gradeSpoken } from '../practice/GradePad.tsx';
import { GradeChip, pct1 } from '../practice/RevealPanel.tsx';
import { Zoom, type ZoomTarget } from '../practice/Zoom.tsx';
import { go } from '../router.ts';
import { ScreenHead } from '../screens/ScreenHead.tsx';
import { useReducedMotion } from '../settings.ts';
import { Icon } from '../ui/Icon.tsx';
import { Tap, TapLink } from '../ui/Tap.tsx';
import { useCompare, winnerOf, type Pair, type Side } from './useCompare.ts';

/** What drafters thought: ALSA is the average pick a card was last seen at, so lower means taken earlier. */
function crowdLine(win: CardView, lose: CardView): string | null {
  const a = win.card.s.alsa;
  const b = lose.card.s.alsa;
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  const w = displayName(win.card.p);
  const l = displayName(lose.card.p);
  const alsa = `ALSA ${b.toFixed(2)} vs ${a.toFixed(2)}`;
  if (a - b >= 0.3) return `Drafters took ${l} earlier (${alsa}), but ${w} wins more.`;
  if (b - a >= 0.3) return `Drafters agree: ${w} goes earlier too (ALSA ${a.toFixed(2)} vs ${b.toFixed(2)}).`;
  return `Drafters take them at about the same pick (ALSA ${a.toFixed(2)} and ${b.toFixed(2)}).`;
}

function Verdict({ pair, pick, reduced }: { pair: Pair; pick: Side; reduced: boolean }) {
  const winSide = winnerOf(pair);
  const win = winSide === 'left' ? pair.left : pair.right;
  const lose = winSide === 'left' ? pair.right : pair.left;
  const right = pick === winSide;
  const diff = (win.card.s.gihWr - lose.card.s.gihWr) * 100;
  const crowd = crowdLine(win, lose);
  const enter = (delay: number) => (reduced ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.12 } } : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.2, delay } });
  return (
    <div className="compare__result">
      <p className="sr-only" role="status" aria-live="assertive">
        {`${right ? 'Right.' : 'Not this time.'} ${displayName(win.card.p)} wins more: GIH win rate ${pct1(win.card.s.gihWr)}, ${gradeSpoken(win.card.g)}. ${displayName(lose.card.p)}: ${pct1(lose.card.s.gihWr)}, ${gradeSpoken(lose.card.g)}.`}
      </p>
      <m.p className="compare__verdict" {...enter(0)}>
        <span className={`display ${right ? 'tone-exact' : 'tone-over'}`}>{right ? 'Right' : 'Not this time'}</span>
        <span className="compare__diff num">
          {displayName(win.card.p)} wins {diff.toFixed(1)} points more
        </span>
      </m.p>
      {crowd && (
        <m.p className="compare__crowd" {...enter(0.12)}>
          {crowd}
        </m.p>
      )}
    </div>
  );
}

function Column({ view, side, pair, pick, revealed, reduced, onZoom, textMode }: { view: CardView; side: Side; pair: Pair; pick: Side | null; revealed: boolean; reduced: boolean; onZoom: (v: CardView) => void; textMode: boolean }) {
  const isWinner = revealed && winnerOf(pair) === side;
  const isPick = revealed && pick === side;
  const name = displayName(view.card.p);
  return (
    <div className={`compare__col${isWinner ? ' is-winner' : ''}${isPick ? ' is-picked' : ''}${isPick && !isWinner ? ' is-wrong' : ''}`}>
      <m.div
        key={view.key}
        className="compare__card"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reduced ? 0.12 : 0.22, delay: !reduced && side === 'right' ? 0.04 : 0, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <CardFace printing={view.card.p} textMode={textMode} label={name} onTap={() => onZoom(view)} />
      </m.div>
      <div className="compare__info">
        {revealed ? (
          <>
            <span className="compare__tags">
              {isPick && <span className="compare__tag compare__tag--pick">Your pick</span>}
              {isWinner && <span className="compare__tag compare__tag--win">Wins more</span>}
            </span>
            <span className="compare__wr num">
              <GradeChip g={view.card.g} size="sm" />
              <b>{pct1(view.card.s.gihWr)}</b>
            </span>
            <span className="compare__facts num">
              {view.card.s.gih.toLocaleString('en-US')} games{typeof view.card.s.alsa === 'number' ? ` · ALSA ${view.card.s.alsa.toFixed(2)}` : ''}
            </span>
          </>
        ) : (
          <span className="compare__name">{name}</span>
        )}
      </div>
    </div>
  );
}

export function CompareScreen() {
  const { manifest } = useApp();
  const filter = usePracticeFilter();
  const offline = useOffline();
  const reduced = useReducedMotion();
  const c = useCompare(manifest !== null, filter.version);
  const [zoom, setZoom] = useState<ZoomTarget | null>(null);
  const [textMode, setTextMode] = useState(false);
  const nextRef = useRef<HTMLButtonElement>(null);
  const { pair, phase, pick } = c;
  const revealed = phase === 'revealed' && pick !== null;

  useEffect(() => {
    if (revealed) nextRef.current?.focus({ preventScroll: true });
  }, [revealed, pair?.left.key]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (zoom || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (phase === 'picking') {
        if (k === 'arrowleft' || k === '1') {
          e.preventDefault();
          feedback('compare.pick');
          c.choose('left');
        } else if (k === 'arrowright' || k === '2') {
          e.preventDefault();
          feedback('compare.pick');
          c.choose('right');
        } else if (k === 't') {
          feedback(textMode ? 'toggle.off' : 'toggle.on');
          setTextMode((t) => !t);
        }
      } else if (phase === 'revealed' && (k === 'arrowright' || k === 'n')) {
        e.preventDefault();
        feedback('card.next');
        void c.next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, zoom, textMode, c.choose, c.next]);

  const s = c.summary;
  const score = c.visit.n > 0 ? `${c.visit.right} of ${c.visit.n} right${c.visit.streak >= 3 ? ` · ${c.visit.streak} in a row` : ''}` : s && s.recentN >= 10 ? `Last ${s.recentN}: ${Math.round((100 * s.recentRight) / s.recentN)}% right` : '';
  const meta = pair ? `${pair.left.setName} · ${pair.left.formatLabel}` : '';

  return (
    <div className="compare" data-phase={phase}>
      <ScreenHead
        title="Compare"
        sub={s ? levelLabel(pair?.level ?? s.level) : 'Which card has the higher GIH WR?'}
        right={
          <Tap fb={textMode ? 'toggle.off' : 'toggle.on'} className={`tool-btn${textMode ? ' is-on' : ''}`} onTap={() => setTextMode((t) => !t)} aria-pressed={textMode} aria-label="Text view">
            <Icon name="text" />
          </Tap>
        }
      />
      {phase === 'empty' ? (
        <div className="compare__empty">
          <p>No two cards from the same set have a clearly different GIH WR{filter.query ? ` under the filter “${filterLabel(filter.query)}”` : ''}.</p>
          <Tap fb="nav.open" className="next" onTap={() => go('filter')}>
            Change the filter
          </Tap>
        </div>
      ) : (
        <>
          <div className="compare__stage" aria-busy={phase === 'loading' && !pair}>
            <div className="compare__bar">
              <p className="compare__q">
                <span className="display">Which wins more?</span>
                <span className="compare__meta">
                  {meta}
                  {offline.offline ? ' · offline, cached cards only' : ''}
                </span>
              </p>
              <span className="compare__score num" aria-live="polite">
                {score}
              </span>
            </div>
            {pair &&
              (['left', 'right'] as const).map((side) => (
                <Column
                  key={side}
                  side={side}
                  view={side === 'left' ? pair.left : pair.right}
                  pair={pair}
                  pick={pick}
                  revealed={revealed}
                  reduced={reduced}
                  textMode={textMode}
                  onZoom={(v) => {
                    feedback('card.zoom');
                    setZoom({ printing: v.card.p, view: revealed ? v : undefined });
                  }}
                />
              ))}
          </div>
          {revealed && pair && pick ? (
            <Verdict pair={pair} pick={pick} reduced={reduced} />
          ) : (
            <div className="compare__result compare__result--hint">
              <p>Pick the card with the higher GIH WR, its win rate in games where it was in hand. Both come from the same set and format; tap a card to read it full size.</p>
            </div>
          )}
          <div className="compare__actions">
            {revealed ? (
              <Tap ref={nextRef} fb="card.next" className="next" onTap={() => void c.next()}>
                Next pair
              </Tap>
            ) : (
              (['left', 'right'] as const).map((side) => (
                <Tap key={side} fb="compare.pick" className="compare__pick" onTap={() => c.choose(side)} disabled={phase !== 'picking'}>
                  {side === 'left' ? 'Pick left' : 'Pick right'}
                  {pair && <span className="sr-only">: {displayName((side === 'left' ? pair.left : pair.right).card.p)}</span>}
                </Tap>
              ))
            )}
          </div>
          <p className="compare__credit">
            {manifest?.synthetic ? (
              <TapLink className="credit__link credit__link--warn" href="#/data" fb="nav.open">
                Sample data: invented numbers, not 17Lands
              </TapLink>
            ) : (
              <TapLink className="credit__link" href={pair?.left.cardDataUrl ?? 'https://www.17lands.com/card_data'}>
                Win-rate data from 17Lands Card Data
              </TapLink>
            )}
          </p>
        </>
      )}
      {zoom && <Zoom target={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}
