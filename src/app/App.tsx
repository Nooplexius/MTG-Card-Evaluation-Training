import { LazyMotion, MotionConfig } from 'motion/react';
import { lazy, Suspense, useEffect } from 'react';
import { AppProvider, useApp } from './AppContext.tsx';
import { endDrill, useDrill } from './drillStore.ts';
import { applyPracticeQuery, filterLabel, usePracticeFilter } from './filter/practiceFilter.ts';
import { PracticeScreen } from './practice/PracticeScreen.tsx';
import { useRoute } from './router.ts';
import { getSettings, useReducedMotion } from './settings.ts';

const loadMotion = () => import('./motionFeatures.ts').then((m) => m.default);
const screens = {
  menu: () => import('./MenuScreen.tsx').then((m) => ({ default: m.MenuScreen })),
  filter: () => import('./filter/FilterScreen.tsx').then((m) => ({ default: m.FilterScreen })),
  about: () => import('./screens/AboutScreen.tsx').then((m) => ({ default: m.AboutScreen })),
  data: () => import('./screens/DataScreen.tsx').then((m) => ({ default: m.DataScreen })),
  settings: () => import('./screens/SettingsScreen.tsx').then((m) => ({ default: m.SettingsScreen })),
  stats: () => import('./stats/StatsScreen.tsx').then((m) => ({ default: m.StatsScreen })),
  insights: () => import('./insights/InsightsScreen.tsx').then((m) => ({ default: m.InsightsScreen })),
  history: () => import('./stats/HistoryScreen.tsx').then((m) => ({ default: m.HistoryScreen })),
  compare: () => import('./compare/CompareScreen.tsx').then((m) => ({ default: m.CompareScreen })),
};
const MenuScreen = lazy(screens.menu);
const FilterScreen = lazy(screens.filter);
const AboutScreen = lazy(screens.about);
const DataScreen = lazy(screens.data);
const SettingsScreen = lazy(screens.settings);
const StatsScreen = lazy(screens.stats);
const InsightsScreen = lazy(screens.insights);
const HistoryScreen = lazy(screens.history);
const CompareScreen = lazy(screens.compare);

/** Loads the other screens' code one chunk per idle period, so opening any of them later never shows a blank frame. */
function prefetchScreens() {
  const queue = Object.values(screens);
  const idle = (fn: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 200));
  const step = () => {
    const next = queue.shift();
    if (!next) return;
    void next().finally(() => idle(step));
  };
  idle(step);
}

function Shell() {
  const { route } = useRoute();
  const { manifest, error } = useApp();
  const filter = usePracticeFilter();
  const drill = useDrill();

  useEffect(() => {
    if (!manifest) return;
    void applyPracticeQuery(getSettings().query);
    const t = setTimeout(prefetchScreens, 4000);
    return () => clearTimeout(t);
  }, [manifest]);

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
      {route !== 'practice' && (
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
      )}
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
