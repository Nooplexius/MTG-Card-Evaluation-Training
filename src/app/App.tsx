import { LazyMotion, MotionConfig } from 'motion/react';
import { lazy, Suspense, useDeferredValue, useEffect, useState, type ComponentType } from 'react';
import { AppProvider, useApp } from './AppContext.tsx';
import { endDrill, useDrill } from './drillStore.ts';
import { applyPracticeQuery, filterLabel, usePracticeFilter } from './filter/practiceFilter.ts';
import { PracticeScreen } from './practice/PracticeScreen.tsx';
import { useRoute } from './router.ts';
import { getSettings, useReducedMotion } from './settings.ts';

const loadMotion = () => import('./motionFeatures.ts').then((m) => m.default);
/**
 * A lazily loaded screen whose code can be fetched ahead of time. Once loaded it renders without suspending;
 * the choice is made once per mount so a screen never switches component type while open.
 */
function lazyScreen(factory: () => Promise<ComponentType>) {
  let ready: ComponentType | null = null;
  const load = () =>
    factory().then((c) => {
      ready = c;
      return c;
    });
  const Lazy = lazy(() => load().then((c) => ({ default: c })));
  function Screen() {
    const [Direct] = useState(() => ready);
    return Direct ? <Direct /> : <Lazy />;
  }
  return { Screen, load };
}

const screens = {
  menu: lazyScreen(() => import('./MenuScreen.tsx').then((m) => m.MenuScreen)),
  filter: lazyScreen(() => import('./filter/FilterScreen.tsx').then((m) => m.FilterScreen)),
  about: lazyScreen(() => import('./screens/AboutScreen.tsx').then((m) => m.AboutScreen)),
  data: lazyScreen(() => import('./screens/DataScreen.tsx').then((m) => m.DataScreen)),
  settings: lazyScreen(() => import('./screens/SettingsScreen.tsx').then((m) => m.SettingsScreen)),
  stats: lazyScreen(() => import('./stats/StatsScreen.tsx').then((m) => m.StatsScreen)),
  insights: lazyScreen(() => import('./insights/InsightsScreen.tsx').then((m) => m.InsightsScreen)),
  history: lazyScreen(() => import('./stats/HistoryScreen.tsx').then((m) => m.HistoryScreen)),
  compare: lazyScreen(() => import('./compare/CompareScreen.tsx').then((m) => m.CompareScreen)),
};
const MenuScreen = screens.menu.Screen;
const FilterScreen = screens.filter.Screen;
const AboutScreen = screens.about.Screen;
const DataScreen = screens.data.Screen;
const SettingsScreen = screens.settings.Screen;
const StatsScreen = screens.stats.Screen;
const InsightsScreen = screens.insights.Screen;
const HistoryScreen = screens.history.Screen;
const CompareScreen = screens.compare.Screen;

/**
 * Loads the screens' code one chunk per idle period. It starts the first time the user leaves practice, so it never
 * competes with the core loop.
 */
let prefetched = false;
function prefetchScreens() {
  if (prefetched) return;
  prefetched = true;
  const queue = Object.values(screens).map((s) => s.load);
  const idle = (fn: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 200));
  const step = () => {
    const next = queue.shift();
    if (!next) return;
    void next()
      .catch(() => undefined)
      .finally(() => idle(step));
  };
  idle(step);
}

function Shell() {
  const current = useRoute();
  /** While a screen's code loads, the previous screen stays up instead of a blank fallback. */
  const { route } = useDeferredValue(current);
  const { manifest, error } = useApp();
  const filter = usePracticeFilter();
  const drill = useDrill();

  useEffect(() => {
    if (!manifest) return;
    void applyPracticeQuery(getSettings().query);
  }, [manifest]);

  useEffect(() => {
    if (current.route !== 'practice') prefetchScreens();
  }, [current.route]);

  if (error && !manifest) {
    return (
      <div className="screen">
        <h1>Can't load the card data</h1>
        <p className="screen__sub">{error}. Check your connection and reload.</p>
      </div>
    );
  }
  const total = manifest ? manifest.sets.reduce((n, s) => n + s.cards, 0) : null;
  return (
    <>
      <div hidden={route !== 'practice'} className="route-practice">
        <PracticeScreen filterLabel={filterLabel(filter.query)} filterCount={drill ? drill.keys.length : (filter.count ?? total)} filterVersion={filter.version} drill={drill} onEndDrill={endDrill} />
      </div>
      <Suspense fallback={<div className="screen" aria-busy="true" />}>
        {route === 'menu' && <MenuScreen />}
        {route === 'filter' && <FilterScreen />}
        {route === 'about' && <AboutScreen />}
        {route === 'data' && <DataScreen />}
        {route === 'settings' && <SettingsScreen />}
        {route === 'stats' && <StatsScreen />}
        {route === 'history' && <HistoryScreen />}
        {route === 'insights' && <InsightsScreen />}
        {route === 'compare' && <CompareScreen />}
      </Suspense>
    </>
  );
}

export function App() {
  const reduced = useReducedMotion();
  return (
    <LazyMotion features={loadMotion} strict>
      <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
        <AppProvider>
          <Shell />
        </AppProvider>
      </MotionConfig>
    </LazyMotion>
  );
}
