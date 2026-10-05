import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import { App } from './app/App.tsx';
import { captureInstallPrompt } from './app/install.ts';
import { watchConnectivity } from './app/offline.ts';

captureInstallPrompt();
watchConnectivity();

createRoot(document.getElementById('root') as HTMLElement).render(<App />);

/** Service worker setup waits until the first card is up, so precaching never competes with it for bandwidth. */
function whenIdle(fn: () => void, delay: number) {
  const run = () => setTimeout(() => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 4000 }) : fn()), delay);
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  whenIdle(() => void registerSW({ immediate: true }), 2500);
}
