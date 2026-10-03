import { go, type Route } from './router.ts';
import { Icon, type IconName } from './ui/Icon.tsx';
import { Tap } from './ui/Tap.tsx';
import { useApp } from './AppContext.tsx';

const ITEMS: Array<{ route: Route; icon: IconName; label: string; note: string }> = [
  { route: 'practice', icon: 'play', label: 'Practice', note: 'Grade cards, see the truth' },
  { route: 'insights', icon: 'insights', label: 'Insights', note: 'Your weak spots and drills' },
  { route: 'stats', icon: 'stats', label: 'Stats', note: 'Accuracy, calibration, learning curve' },
  { route: 'history', icon: 'history', label: 'History', note: 'Every card you graded' },
  { route: 'compare', icon: 'compare', label: 'Compare', note: 'Which of two cards wins more?' },
  { route: 'settings', icon: 'settings', label: 'Settings', note: 'Session, sound, backup' },
  { route: 'data', icon: 'data', label: 'Data', note: 'Sets, dates and sources' },
  { route: 'about', icon: 'info', label: 'About & glossary', note: 'GIH WR, IIH, ALSA, credits' },
];

export function MenuScreen() {
  const { manifest } = useApp();
  return (
    <div className="screen menu">
      <header className="screen__head screen__head--bar">
        <Tap fb="nav.back" className="icon-btn" onTap={() => go('practice')} aria-label="Back to practice">
          <Icon name="back" />
        </Tap>
        <h1 className="brand display">Loupe</h1>
      </header>
      <nav aria-label="Main">
        <ul className="menu__list">
          {ITEMS.map((it) => (
            <li key={it.route}>
              <Tap fb="nav.open" className="menu__item" onTap={() => go(it.route)}>
                <Icon name={it.icon} />
                <span className="menu__text">
                  <span className="menu__label">{it.label}</span>
                  <span className="menu__note">{it.note}</span>
                </span>
                <Icon name="chevron" size={18} />
              </Tap>
            </li>
          ))}
        </ul>
      </nav>
      {manifest && (
        <p className="menu__foot">
          {manifest.sets.length} limited sets · {manifest.sets.reduce((n, s) => n + s.cards, 0).toLocaleString('en-US')} cards{manifest.synthetic ? ' · sample data' : ''}
        </p>
      )}
    </div>
  );
}
