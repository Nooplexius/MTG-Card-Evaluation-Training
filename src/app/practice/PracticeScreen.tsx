import { m } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { displayName, hasFaceImages, type Printing } from '../../lib/card.ts';
import type { Mode } from '../../lib/types.ts';
import type { CardView } from '../../lib/view.ts';
import { useApp } from '../AppContext.tsx';
import { useOffline } from '../offline.ts';
import { feedback } from '../feedback/feedback.ts';
import { go } from '../router.ts';
import { setSettings, useReducedMotion, useSettings } from '../settings.ts';
import { Icon } from '../ui/Icon.tsx';
import { Tap, TapLink } from '../ui/Tap.tsx';
import { CardFace } from './CardFace.tsx';
import { GradePad } from './GradePad.tsx';
import { RevealPanel } from './RevealPanel.tsx';
import { SessionSummary } from './SessionSummary.tsx';
import { usePractice, DEAL_MS } from './usePractice.ts';
import { Zoom, type ZoomTarget } from './Zoom.tsx';

export interface PracticeProps {
  filterLabel: string;
  filterCount: number | null;
  filterVersion: number;
  drill?: { id: string; keys: string[]; label: string } | null;
  onEndDrill?: () => void;
}

/** FLIP: animate the card box from its old rect to its new one using transforms only. */
function useFlip(ref: React.RefObject<HTMLElement | null>, dep: unknown, reduced: boolean) {
  const last = useRef<DOMRect | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const next = el.getBoundingClientRect();
    const prev = last.current;
    last.current = next;
    if (!prev || reduced || prev.width === 0 || next.width === 0) return;
    const s = prev.width / next.width;
    const dx = prev.left + prev.width / 2 - (next.left + next.width / 2);
    const dy = prev.top + prev.height / 2 - (next.top + next.height / 2);
    if (Math.abs(1 - s) < 0.01 && Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${s})` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  }, [dep]);
  useEffect(() => {
    const onResize = () => {
      last.current = ref.current?.getBoundingClientRect() ?? null;
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
}

export function PracticeScreen({ filterLabel, filterCount, filterVersion, drill, onEndDrill }: PracticeProps) {
  const { manifest, starter, progress } = useApp();
  const settings = useSettings();
  const offline = useOffline();
  const reduced = useReducedMotion();
  const mode: Mode = drill ? 'drill' : settings.mode;
  const p = usePractice(manifest, starter, { mode, drillKeys: drill?.keys, drillId: drill?.id, filterVersion });
  const [zoom, setZoom] = useState<ZoomTarget | null>(null);
  const [textMode, setTextMode] = useState(false);
  const [back, setBack] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useFlip(wrapRef, p.phase, reduced);

  const cur = p.current;
  const view: CardView | null = cur?.view ?? null;
  const printing = (view?.card.p ?? cur?.image) as Printing | undefined;
  const label = printing ? displayName(printing as Printing) : 'Card';
  const dfc = printing ? hasFaceImages(printing as Printing) : false;

  useEffect(() => {
    setBack(false);
  }, [cur?.key]);

  useEffect(() => {
    if (p.phase !== 'revealed') return;
    const onKey = (e: KeyboardEvent) => {
      if (zoom) return;
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'n') {
        e.preventDefault();
        feedback('card.next');
        p.next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p.phase, zoom, p.next]);

  useEffect(() => {
    if (p.phase !== 'grading') return;
    const onKey = (e: KeyboardEvent) => {
      if (zoom || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (k === 't') {
        feedback(textMode ? 'toggle.off' : 'toggle.on');
        setTextMode((t) => !t);
      } else if (k === 'o' && dfc) {
        feedback('card.flip');
        setBack((b) => !b);
      } else if (k === 'v' && printing) {
        feedback('card.zoom');
        setZoom({ printing });
      } else if (k === 'k') {
        feedback('card.skip');
        p.skip('other');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p.phase, zoom, textMode, dfc, printing]);

  const onVisible = useCallback(() => p.markVisible(), [p.markVisible]);
  const sessionText = p.session && p.session.length > 0 ? `${Math.min(p.session.done + (p.phase === 'grading' ? 1 : 0), p.session.length)} / ${p.session.length}` : p.session ? `${p.session.done + (p.phase === 'grading' ? 1 : 0)}` : '';
  const setMeta = view ? manifest?.sets.find((s) => s.code === view.set) : cur ? manifest?.sets.find((s) => s.code === cur.key.split(':')[0]) : null;

  if (p.phase === 'summary' && p.session) {
    return <SessionSummary session={p.session} onNew={p.newSession} drillLabel={drill?.label} onEndDrill={onEndDrill} />;
  }

  return (
    <div className="practice" data-phase={p.phase}>
      <header className="topbar">
        <Tap fb="nav.open" className="icon-btn" onTap={() => go('menu')} aria-label="Menu">
          <Icon name="menu" />
        </Tap>
        <Tap fb="nav.open" className="filter-chip" onTap={() => go('filter')} aria-label={`Practice filter: ${filterLabel}. Change`}>
          <Icon name="filter" size={18} />
          <span className="filter-chip__text">{drill ? `Drill · ${drill.label}` : filterLabel}</span>
          {filterCount !== null && <span className="filter-chip__count num">{filterCount.toLocaleString('en-US')}</span>}
        </Tap>
        {drill ? (
          <Tap fb="action.secondary" className="mode-btn" onTap={() => onEndDrill?.()} aria-label="End drill">
            <Icon name="close" size={18} />
            <span>Drill</span>
          </Tap>
        ) : (
          <Tap
            fb={settings.mode === 'random' ? 'toggle.off' : 'toggle.on'}
            className="mode-btn"
            onTap={() => setSettings({ mode: settings.mode === 'random' ? 'adaptive' : 'random' })}
            aria-label={`Mode: ${settings.mode === 'random' ? 'Random' : 'Adaptive'}. Switch`}
          >
            <Icon name={settings.mode === 'random' ? 'shuffle' : 'target'} size={18} />
            <span>{settings.mode === 'random' ? 'Random' : 'Adaptive'}</span>
          </Tap>
        )}
      </header>
      <div className="credit">
        <span className="credit__count num" aria-label="Session progress">
          {sessionText}
        </span>
        {offline.offline ? (
          <span className="credit__link credit__link--warn">Offline · practicing with {offline.cards ?? 0} cached cards</span>
        ) : manifest?.synthetic ? (
          <TapLink className="credit__link credit__link--warn" href="#/data" fb="nav.open">
            Sample data: invented numbers, not 17Lands
          </TapLink>
        ) : (
          <TapLink className="credit__link" href={setMeta?.cardDataUrl ?? 'https://www.17lands.com/card_data'}>
            Win-rate data from 17Lands Card Data{setMeta ? ` · ${setMeta.code} ${setMeta.formatLabel}` : ''}
          </TapLink>
        )}
        {p.session && progress.total > 0 && progress.loaded < progress.total ? <span className="credit__load num">{Math.round((100 * progress.loaded) / progress.total)}%</span> : <span className="credit__load" />}
      </div>
      <main className="stage">
        <div className="card-slot">
          <div className="card-layout">
            <div className="card-wrap" ref={wrapRef}>
              {printing && (
                <m.div
                  key={cur?.key}
                  className="card-deal"
                  initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: (reduced ? 120 : DEAL_MS) / 1000, ease: [0.2, 0.8, 0.2, 1] }}
                >
                  <CardFace
                    printing={printing}
                    back={back}
                    textMode={textMode}
                    label={label}
                    onVisible={onVisible}
                    onTap={() => {
                      feedback('card.zoom');
                      setZoom({ printing, view: p.phase === 'revealed' && view ? view : undefined });
                    }}
                  />
                </m.div>
              )}
              {!printing && <div className="card-box card-box--empty" aria-hidden />}
            </div>
            <div className="card-tools" aria-label="Card tools">
              <Tap fb={textMode ? 'toggle.off' : 'toggle.on'} className={`tool-btn${textMode ? ' is-on' : ''}`} onTap={() => setTextMode((t) => !t)} aria-pressed={textMode} aria-label="Text view">
                <Icon name="text" />
              </Tap>
              {dfc && (
                <Tap fb="card.flip" className={`tool-btn${back ? ' is-on' : ''}`} onTap={() => setBack((b) => !b)} aria-pressed={back} aria-label={back ? 'Show front face' : 'Show back face'}>
                  <Icon name="flip" />
                </Tap>
              )}
              {p.phase === 'grading' && (
                <Tap fb="card.skip" className="tool-btn tool-btn--quiet" onTap={() => p.skip('other')} aria-label="Skip this card (can't load or read it)">
                  <Icon name="skip" />
                </Tap>
              )}
            </div>
          </div>
        </div>
        {p.phase === 'revealed' && view && p.reveal ? (
          <RevealPanel
            view={view}
            user={p.reveal.user}
            contrasts={p.reveal.contrasts}
            reduced={reduced}
            streak={p.streak}
            onNext={p.next}
            onContrast={(c) => setZoom({ printing: c.card.p, view: c })}
            notes={[...(p.reveal.goalReached ? [`Daily goal reached: ${p.today} cards today`] : []), ...(p.reveal.drillMastered ? ['Drill mastered: the last 8 cards were on target'] : [])]}
            nextLabel={p.session && p.session.length > 0 && p.session.done >= p.session.length ? 'See session summary' : 'Next card'}
          />
        ) : p.phase === 'revealed' ? (
          <div className="reveal reveal--wait" aria-busy="true">
            <span className="smallcaps">Loading the 17Lands numbers…</span>
          </div>
        ) : p.phase === 'empty' ? (
          <div className="reveal reveal--wait">
            <p>No cards match this filter.</p>
            <Tap fb="nav.open" className="next" onTap={() => go('filter')}>
              Change the filter
            </Tap>
          </div>
        ) : (
          <GradePad key={cur?.key ?? 'none'} onCommit={p.commit} disabled={!cur || p.phase !== 'grading'} showHints={settings.showKeyHints} />
        )}
      </main>
      {zoom && <Zoom target={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}
