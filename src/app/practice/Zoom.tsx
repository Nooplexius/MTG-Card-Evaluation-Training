import { m } from 'motion/react';
import { useEffect, useState } from 'react';
import { displayName, hasFaceImages, imageUrl, type Printing } from '../../lib/card.ts';
import type { CardView } from '../../lib/view.ts';
import { feedback } from '../feedback/feedback.ts';
import { useReducedMotion } from '../settings.ts';
import { Icon } from '../ui/Icon.tsx';
import { Tap, TapLink } from '../ui/Tap.tsx';
import { CardText } from './CardFace.tsx';
import { GradeChip, pct1, scryfallUrl } from './RevealPanel.tsx';

export interface ZoomTarget {
  printing: Printing | (Pick<Printing, 'id' | 'image_version' | 'name'> & Partial<Printing>);
  /** Present when the card's grade may be shown (it has been revealed). */
  view?: CardView;
}

/** Full-screen card view that replaces the practice screen: large image, DFC flip, text view. */
export function Zoom({ target, onClose }: { target: ZoomTarget; onClose: () => void }) {
  const reduced = useReducedMotion();
  const p = target.printing;
  const dfc = hasFaceImages(p as Printing);
  const [back, setBack] = useState(false);
  const [text, setText] = useState(false);
  const [hiLoaded, setHiLoaded] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        feedback('nav.back');
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const face = back ? 'back' : 'front';
  return (
    <m.div className="zoom" role="dialog" aria-modal="true" aria-label={`${displayName(p as Printing)}, full screen`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0.12 : 0.18 }}>
      <div className="zoom__bar">
        <Tap fb="nav.back" className="icon-btn" onTap={onClose} aria-label="Close">
          <Icon name="close" />
        </Tap>
        <span className="zoom__title">{displayName(p as Printing)}</span>
        {p.type_line ? (
          <Tap fb={text ? 'toggle.off' : 'toggle.on'} className={`icon-btn${text ? ' is-on' : ''}`} onTap={() => setText((t) => !t)} aria-pressed={text} aria-label="Text view">
            <Icon name="text" />
          </Tap>
        ) : null}
        {dfc ? (
          <Tap fb="card.flip" className="icon-btn" onTap={() => setBack((b) => !b)} aria-label={back ? 'Show front face' : 'Show back face'}>
            <Icon name="flip" />
          </Tap>
        ) : null}
      </div>
      <div
        className="zoom__stage"
        onClick={() => {
          feedback('nav.back');
          onClose();
        }}
      >
        {text && p.type_line ? (
          <div className="zoom__text" onClick={(e) => e.stopPropagation()}>
            <CardText p={p as Printing} />
          </div>
        ) : (
          <m.div key={face} className="zoom__card" initial={reduced ? { opacity: 0 } : { opacity: 0, rotateY: 70 }} animate={{ opacity: 1, rotateY: 0 }} transition={{ duration: reduced ? 0.12 : 0.24 }}>
            <img className="zoom__img" src={imageUrl(p, 'display', face)} alt="" width={672} height={936} crossOrigin="anonymous" />
            <img className={`zoom__img zoom__img--hi${hiLoaded ? ' is-loaded' : ''}`} src={imageUrl(p, 'png', face)} alt={displayName(p as Printing)} width={745} height={1040} crossOrigin="anonymous" onLoad={() => setHiLoaded(true)} />
          </m.div>
        )}
      </div>
      {target.view ? (
        <div className="zoom__facts">
          <GradeChip g={target.view.card.g} size="lg" />
          <span className="num">
            GIH WR <b>{pct1(target.view.card.s.gihWr)}</b> · #{target.view.card.r} of {target.view.n} · {target.view.set} {target.view.formatLabel}
          </span>
          <span className="zoom__links">
            <TapLink href={scryfallUrl(target.view)}>Scryfall</TapLink>
            <TapLink href={target.view.cardDataUrl}>17Lands</TapLink>
          </span>
        </div>
      ) : (
        <p className="zoom__hint">Tap anywhere to go back</p>
      )}
    </m.div>
  );
}
