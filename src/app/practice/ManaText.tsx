import { Fragment } from 'react';

const SPECIAL: Record<string, string> = { '½': 'HALF', '∞': 'INFINITY' };

export function symbolUrl(sym: string): string {
  const inner = sym.replace(/[{}]/g, '');
  return `https://svgs.scryfall.io/card-symbols/${SPECIAL[inner] ?? inner.replace(/\//g, '')}.svg`;
}

/** Oracle text with mana and tap symbols drawn from Scryfall's symbology SVGs. */
export function ManaText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\{[^}]+\})/g);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        /^\{[^}]+\}$/.test(p) ? (
          <img key={i} className="sym" src={symbolUrl(p)} alt={p} width={16} height={16} loading="lazy" decoding="async" />
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </span>
  );
}
