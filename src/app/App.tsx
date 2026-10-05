import { domAnimation, LazyMotion, MotionConfig } from 'motion/react';
import { lazy, Suspense, useEffect } from 'react';
import { AppProvider, useApp } from './AppContext.tsx';
import { FilterScreen } from './filter/FilterScreen.tsx';
import { applyPracticeQuery, filterLabel, usePracticeFilter } from './filter/practiceFilter.ts';
import { MenuScreen } from './MenuScreen.tsx';
import { PracticeScreen } from './practice/PracticeScreen.tsx';
import { useRoute } from './router.ts';
import { getSettings, useReducedMotion } from './settings.ts';

const AboutScreen = lazy(() => import('./screens/AboutScreen.tsx').then((m) => ({ default: m.AboutScreen })));
const DataScreen = lazy(() => import('./screens/DataScreen.tsx').then((m) => ({ default: m.DataScreen })));
const SettingsScreen = lazy(() => import('./screens/SettingsScreen.tsx').then((m) => ({ default: m.SettingsScreen })));

function Shell() {
  const { route } = useRoute();
  const { manifest, error } = useApp();
  const filter = usePracticeFilter();

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
        <PracticeScreen filterLabel={filterLabel(filter.query)} filterCount={filter.count ?? total} filterVersion={filter.version} />
      </div>
      {route !== 'practice' && (
        <Suspense fallback={<div className="screen" aria-busy="true" />}>
          {route === 'menu' && <MenuScreen />}
          {route === 'filter' && <FilterScreen />}
          {route === 'about' && <AboutScreen />}
          {route === 'data' && <DataScreen />}
          {route === 'settings' && <SettingsScreen />}
        </Suspense>
      )}
    </>
  );
}

export function App() {
  const reduced = useReducedMotion();
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
        <AppProvider>
          <Shell />
        </AppProvider>
      </MotionConfig>
    </LazyMotion>
  );
}
