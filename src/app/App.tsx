import { LazyMotion, MotionConfig } from 'motion/react';
import { lazy, Suspense, useEffect } from 'react';
import { AppProvider, useApp } from './AppContext.tsx';
import { endDrill, useDrill } from './drillStore.ts';
import { applyPracticeQuery, filterLabel, usePracticeFilter } from './filter/practiceFilter.ts';
import { PracticeScreen } from './practice/PracticeScreen.tsx';
import { useRoute } from './router.ts';
import { getSettings, useReducedMotion } from './settings.ts';

const loadMotion = () => import('./motionFeatures.ts').then((m) => m.default);
const MenuScreen = lazy(() => import('./MenuScreen.tsx').then((m) => ({ default: m.MenuScreen })));
const FilterScreen = lazy(() => import('./filter/FilterScreen.tsx').then((m) => ({ default: m.FilterScreen })));
const AboutScreen = lazy(() => import('./screens/AboutScreen.tsx').then((m) => ({ default: m.AboutScreen })));
const DataScreen = lazy(() => import('./screens/DataScreen.tsx').then((m) => ({ default: m.DataScreen })));
const SettingsScreen = lazy(() => import('./screens/SettingsScreen.tsx').then((m) => ({ default: m.SettingsScreen })));
const StatsScreen = lazy(() => import('./stats/StatsScreen.tsx').then((m) => ({ default: m.StatsScreen })));
const InsightsScreen = lazy(() => import('./insights/InsightsScreen.tsx').then((m) => ({ default: m.InsightsScreen })));
const HistoryScreen = lazy(() => import('./stats/HistoryScreen.tsx').then((m) => ({ default: m.HistoryScreen })));

function Shell() {
  const { route } = useRoute();
  const { manifest, error } = useApp();
  const filter = usePracticeFilter();
  const drill = useDrill();

  useEffect(() => {
    if (!manifest) return;
    void applyPracticeQuery(getSettings().query);
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
