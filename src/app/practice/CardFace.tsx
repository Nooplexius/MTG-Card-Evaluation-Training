import { useEffect, useRef, useState } from 'react';
import { displayName, faces, hasFaceImages, imageUrl, type Printing } from '../../lib/card.ts';
import { ManaText } from './ManaText.tsx';

export function cardImageUrl(p: Pick<Printing, 'id' | 'image_version'>, back = false): string {
  return imageUrl(p, 'display', back ? 'back' : 'front');
}

const preloaded = new Map<string, Promise<void>>();
const decoded = new Set<string>();

/** Images already decoded (preloaded cards, or the starter painted by the static first screen) show without a fade. */
export function isDecoded(url: string): boolean {
  if (decoded.has(url)) return true;
  return window.__LOUPE_STARTER__?.url === url && typeof window.__LOUPE_STARTER_LOADED__ === 'number';
}

/** Fetches and decodes an image so it can appear in the next frame. */
export function preloadImage(url: string): Promise<void> {
  let p = preloaded.get(url);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.src = url;
      img
        .decode()
        .then(() => {
          decoded.add(url);
          resolve();
        })
        .catch(() => (img.complete && img.naturalWidth > 0 ? resolve() : reject(new Error('image failed'))));
    });
    preloaded.set(url, p);
    p.catch(() => preloaded.delete(url));
    if (preloaded.size > 60) preloaded.delete(preloaded.keys().next().value as string);
  }
  return p;
}

export function CardText({ p }: { p: Printing }) {
  return (
    <div className="card-text">
      {faces(p).map((f, i) => (
        <div key={i} className="card-text__face">
          <div className="card-text__head">
            <span className="card-text__name">{i === 0 ? displayName(p) : (f.printed_name ?? f.name)}</span>
            {f.mana_cost ? <ManaText className="card-text__cost" text={f.mana_cost} /> : null}
          </div>
          <div className="card-text__type">{f.type_line}</div>
          {f.oracle_text ? (
            <div className="card-text__body">
              {f.oracle_text.split('\n').map((line, j) => (
                <p key={j}>
                  <ManaText text={line} />
                </p>
              ))}
            </div>
          ) : null}
          {f.power !== undefined && f.toughness !== undefined ? <div className="card-text__pt display num">{`${f.power}/${f.toughness}`}</div> : null}
          {f.loyalty !== undefined ? <div className="card-text__pt display num">Loyalty {f.loyalty}</div> : null}
          {f.defense !== undefined ? <div className="card-text__pt display num">Defense {f.defense}</div> : null}
        </div>
      ))}
      {p.name !== displayName(p) ? <div className="card-text__alt">Card name on Scryfall: {p.name}</div> : null}
    </div>
  );
}

export interface CardFaceProps {
  printing: Pick<Printing, 'id' | 'image_version' | 'name'> & Partial<Printing>;
  back?: boolean;
  textMode?: boolean;
  onVisible?: () => void;
  onError?: () => void;
  onTap?: () => void;
  label: string;
}

/** The card image in a box reserved at 63:88; never covered or distorted. */
export function CardFace({ printing, back = false, textMode = false, onVisible, onError, onTap, label }: CardFaceProps) {
  const url = cardImageUrl(printing, back && hasFaceImages(printing as Printing));
  const [loaded, setLoaded] = useState(() => isDecoded(url));
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const describedBy = `card-desc-${printing.id}`;

  useEffect(() => {
    setLoaded(isDecoded(url));
    setFailed(false);
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      decoded.add(url);
      setLoaded(true);
      onVisible?.();
    }
  }, [url]);

  return (
    <div className={`card-box${loaded ? ' is-loaded' : ''}`}>
      {textMode && printing.type_line ? (
        <button type="button" className="card-box__text" onClick={onTap} aria-label={`${label}, text view. Open full screen`}>
          <CardText p={printing as Printing} />
        </button>
      ) : (
        <button type="button" className="card-box__hit" onClick={onTap} aria-label={`${label}. Open full screen`} aria-describedby={printing.type_line ? describedBy : undefined}>
          {!failed ? (
            <img
              ref={imgRef}
              key={url}
              className="card-box__img"
              src={url}
              alt=""
              width={672}
              height={936}
              crossOrigin="anonymous"
              decoding="async"
              fetchPriority="high"
              draggable={false}
              onLoad={() => {
                decoded.add(url);
                setLoaded(true);
                onVisible?.();
              }}
              onError={() => {
                setFailed(true);
                onError?.();
              }}
            />
          ) : (
            <span className="card-box__failed">
              <span className="display">{label}</span>
              <span>The image didn't load. Use the text view or skip this card.</span>
            </span>
          )}
        </button>
      )}
      {printing.type_line ? (
        <div id={describedBy} className="sr-only">
          <CardText p={printing as Printing} />
        </div>
      ) : null}
    </div>
  );
}
