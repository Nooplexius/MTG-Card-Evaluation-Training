import { useEffect, useMemo, useRef, useState } from 'react';
import { activeChips, chipGroups, toggleChip } from '../../lib/query/chips.ts';
import { useApp } from '../AppContext.tsx';
import { engine } from '../engineClient.ts';
import { feedback } from '../feedback/feedback.ts';
import { Icon } from '../ui/Icon.tsx';
import { Tap, TapLink } from '../ui/Tap.tsx';

export interface CountResult {
  count: number | null;
  error: string | null;
  warnings: string[];
  needsConnection: boolean;
}

export interface FilterPanelProps {
  value: string;
  onChange: (q: string) => void;
  /** Counts matches for a query in this panel's scope (pool or history). */
  count: (q: string) => Promise<CountResult>;
  unit?: string;
}

const EXAMPLES = ['otag:removal', 'crowd:over', 'kw:flying', 'o:"draw a card"', 'is:dfc', 'pow>=4', 't:creature -c:m', 'set:spg'];

export function FilterPanel({ value, onChange, count, unit = 'cards' }: FilterPanelProps) {
  const { manifest } = useApp();
  const groups = useMemo(() => chipGroups((manifest?.sets ?? []).map((s) => ({ code: s.code, name: s.name }))), [manifest]);
  const active = useMemo(() => activeChips(value, groups), [value, groups]);
  const [res, setRes] = useState<CountResult | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [saved, setSaved] = useState<Array<{ id?: number; name: string; query: string }>>([]);
  const [naming, setNaming] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const off = engine().on('query-progress', (p) => {
      const pr = p as { page: number; pages: number | null; step: number; steps: number };
      setProgress(`Asking Scryfall${pr.steps > 1 ? ` (${pr.step} of ${pr.steps})` : ''}… page ${pr.page}${pr.pages ? ` of ${pr.pages}` : ''}`);
    });
    void engine().call('savedFilters').then(setSaved);
    return () => {
      off();
    };
  }, []);

  useEffect(() => {
    const my = ++seq.current;
    const t = setTimeout(async () => {
      const r = await count(value);
      if (my !== seq.current) return;
      setProgress(null);
      setRes(r);
    }, 220);
    return () => clearTimeout(t);
  }, [value, count]);

  return (
    <div className="filter">
      <div className="filter__field">
        <label className="sr-only" htmlFor="q">
          Scryfall search
        </label>
        <input
          id="q"
          className="filter__input"
          type="search"
          inputMode="search"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Scryfall syntax, e.g. t:creature c:r otag:removal"
          value={value}
          onChange={(e) => {
            feedback('input.type');
            onChange(e.target.value);
          }}
        />
        {value && (
          <Tap fb="action.secondary" className="icon-btn" onTap={() => onChange('')} aria-label="Clear filter">
            <Icon name="close" size={18} />
          </Tap>
        )}
      </div>
      <div className="filter__status" aria-live="polite">
        {progress ? (
          <span className="filter__progress">{progress}</span>
        ) : res && res.count !== null && !res.error ? (
          <span className="filter__count num">
            <b>{res.count.toLocaleString('en-US')}</b> {unit}
          </span>
        ) : null}
        {res?.error && (
          <p className="filter__error" role="alert">
            {res.error}
          </p>
        )}
        {res?.needsConnection && <p className="filter__warn">Some terms need a connection to Scryfall. The last pool that worked stays active.</p>}
        {res?.warnings.map((w) => (
          <p key={w} className="filter__warn">
            {w}
          </p>
        ))}
      </div>
      {groups.map((g) => (
        <div key={g.id} className="chips" role="group" aria-label={g.label}>
          <span className="chips__label smallcaps">{g.label}</span>
          <div className="chips__row">
            {g.options.map((o) => {
              const on = active[g.id]?.includes(o.id) ?? false;
              return (
                <Tap key={o.id} fb={on ? 'chip.off' : 'chip.on'} className={`chip-btn${on ? ' is-on' : ''}${g.id === 'color' ? ` chip-btn--color chip-btn--${o.id}` : ''}`} aria-pressed={on} title={o.title} onTap={() => onChange(toggleChip(value, g, o.id))}>
                  {o.label}
                </Tap>
              );
            })}
          </div>
        </div>
      ))}
      <div className="saved">
        <span className="chips__label smallcaps">Saved filters</span>
        <div className="chips__row">
          {saved.map((s) => (
            <Tap key={s.id} fb="chip.on" className={`chip-btn${s.query === value ? ' is-on' : ''}`} onTap={() => onChange(s.query)} title={s.query}>
              {s.name}
            </Tap>
          ))}
          {naming === null ? (
            <Tap fb="action.secondary" className="chip-btn chip-btn--add" disabled={!value.trim()} onTap={() => setNaming('')}>
              <Icon name="save" size={16} /> Save this filter
            </Tap>
          ) : (
            <form
              className="saved__form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!naming.trim()) return;
                feedback('action.primary');
                void engine()
                  .call('saveFilter', naming.trim(), value)
                  .then(() => engine().call('savedFilters'))
                  .then((x) => {
                    setSaved(x);
                    setNaming(null);
                  });
              }}
            >
              <input className="filter__input saved__name" aria-label="Filter name" placeholder="Name" value={naming} autoFocus onChange={(e) => setNaming(e.target.value)} />
              <Tap fb="action.primary" type="submit" className="btn btn--primary">
                Save
              </Tap>
            </form>
          )}
        </div>
      </div>
      <details className="syntax-help" onToggle={(e) => feedback((e.currentTarget as HTMLDetailsElement).open ? 'nav.open' : 'nav.back')}>
        <summary>Search syntax</summary>
        <p>The filter speaks Scryfall syntax, so what you learn here works on Scryfall too. Chips write their terms into the field. Two extras only work in Loupe:</p>
        <ul>
          <li>
            <code>lset:tla</code> a limited set, including its bonus-sheet cards
          </li>
          <li>
            <code>crowd:over</code> / <code>crowd:under</code> cards drafters take much earlier or later than their win rate deserves
          </li>
        </ul>
        <div className="chips__row">
          {EXAMPLES.map((ex) => (
            <Tap key={ex} fb="chip.on" className="chip-btn chip-btn--code" onTap={() => onChange(value.trim() ? `${value.trim()} ${ex}` : ex)}>
              {ex}
            </Tap>
          ))}
        </div>
        <p>
          Terms Loupe can't check on the device (artist, flavor text, prices, art tags, …) are asked of Scryfall once and cached. <TapLink href="https://scryfall.com/docs/syntax">Scryfall syntax guide</TapLink>
        </p>
      </details>
    </div>
  );
}
