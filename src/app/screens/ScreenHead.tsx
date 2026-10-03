import type { ReactNode } from 'react';
import { go, type Route } from '../router.ts';
import { Icon } from '../ui/Icon.tsx';
import { Tap } from '../ui/Tap.tsx';

export function ScreenHead({ title, sub, parent = 'menu', right }: { title: string; sub?: ReactNode; parent?: Route; right?: ReactNode }) {
  return (
    <header className="screen__head screen__head--bar">
      <Tap fb="nav.back" className="icon-btn" onTap={() => go(parent)} aria-label="Back">
        <Icon name="back" />
      </Tap>
      <div className="screen__titles">
        <h1>{title}</h1>
        {sub ? <p className="screen__sub">{sub}</p> : null}
      </div>
      {right}
    </header>
  );
}
