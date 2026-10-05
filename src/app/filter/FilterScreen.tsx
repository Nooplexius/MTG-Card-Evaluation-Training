import { useCallback, useState } from 'react';
import { engine } from '../engineClient.ts';
import { feedback } from '../feedback/feedback.ts';
import { go } from '../router.ts';
import { ScreenHead } from '../screens/ScreenHead.tsx';
import { Tap } from '../ui/Tap.tsx';
import { FilterPanel } from './FilterPanel.tsx';
import { applyPracticeQuery, usePracticeFilter } from './practiceFilter.ts';

export function FilterScreen() {
  const f = usePracticeFilter();
  const [q, setQ] = useState(f.query);
  const [err, setErr] = useState<string | null>(null);
  const count = useCallback(async (query: string) => {
    const r = await engine().call('countQuery', query);
    return { count: r.count, error: r.error, warnings: r.warnings, needsConnection: r.needsConnection };
  }, []);

  const done = async () => {
    const r = await applyPracticeQuery(q);
    if (!r.ok) {
      feedback('filter.error');
      setErr(r.needsConnection ? 'This filter needs a connection to Scryfall. The previous pool stays active.' : (r.error ?? 'This filter could not be applied.'));
      return;
    }
    feedback('filter.apply');
    go('practice');
  };

  return (
    <div className="screen filter-screen">
      <ScreenHead
        title="Practice filter"
        sub="Which cards come up in practice"
        parent="practice"
        right={
          <Tap fb="action.primary" className="btn btn--primary" onTap={() => void done()} disabled={f.pending}>
            Practice
          </Tap>
        }
      />
      <FilterPanel value={q} onChange={setQ} count={count} />
      {err && (
        <p className="filter__error" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
