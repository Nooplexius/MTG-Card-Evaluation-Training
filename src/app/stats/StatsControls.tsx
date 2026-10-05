import { useCallback, useState } from 'react';
import type { Mode } from '../../lib/types.ts';
import { engine } from '../engineClient.ts';
import { FilterPanel } from '../filter/FilterPanel.tsx';
import { Icon } from '../ui/Icon.tsx';
import { Tap } from '../ui/Tap.tsx';

export interface Scope {
  query: string;
  look: 'all' | 'first' | 'review';
  days: number;
  mode: 'all' | Mode;
  basis: 'latest' | 'snapshot';
}

export const DEFAULT_SCOPE: Scope = { query: '', look: 'all', days: 0, mode: 'all', basis: 'latest' };

function Seg<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <Tap key={String(v)} fb="toggle.on" role="radio" aria-checked={v === value} className={`seg__opt${v === value ? ' is-on' : ''}`} onTap={() => onChange(v)}>
          {l}
        </Tap>
      ))}
    </div>
  );
}

/** The shared filter plus date range, mode, first-look/review and grade-basis toggles. */
export function StatsControls({ scope, onChange, showLook = true }: { scope: Scope; onChange: (s: Scope) => void; showLook?: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(scope.query);
  const count = useCallback(async (q: string) => engine().call('historyCount', q), []);
  return (
    <div className="scope">
      <Tap fb={open ? 'nav.back' : 'nav.open'} className="filter-chip" onTap={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name="filter" size={18} />
        <span className="filter-chip__text">{scope.query.trim() ? scope.query : 'All graded cards'}</span>
      </Tap>
      {open && (
        <div className="scope__filter">
          <FilterPanel value={draft} onChange={setDraft} count={count} unit="evaluations" />
          <Tap
            fb="filter.apply"
            className="btn btn--primary"
            onTap={() => {
              onChange({ ...scope, query: draft });
              setOpen(false);
            }}
          >
            Apply filter
          </Tap>
        </div>
      )}
      <div className="scope__toggles">
        {showLook && (
          <Seg
            label="First looks or reviews"
            value={scope.look}
            options={[
              ['all', 'All'],
              ['first', 'First looks'],
              ['review', 'Reviews'],
            ]}
            onChange={(look) => onChange({ ...scope, look })}
          />
        )}
        <Seg
          label="Date range"
          value={scope.days}
          options={[
            [7, '7 days'],
            [30, '30 days'],
            [0, 'All time'],
          ]}
          onChange={(days) => onChange({ ...scope, days })}
        />
        <Seg
          label="Mode"
          value={scope.mode}
          options={[
            ['all', 'Any mode'],
            ['adaptive', 'Adaptive'],
            ['random', 'Random'],
            ['drill', 'Drills'],
          ]}
          onChange={(mode) => onChange({ ...scope, mode })}
        />
        <Seg
          label="Grade basis"
          value={scope.basis}
          options={[
            ['latest', 'Latest grades'],
            ['snapshot', 'Grades at the time'],
          ]}
          onChange={(basis) => onChange({ ...scope, basis })}
        />
      </div>
    </div>
  );
}
