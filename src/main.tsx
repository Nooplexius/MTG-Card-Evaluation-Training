import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import { App } from './app/App.tsx';
import { captureInstallPrompt } from './app/install.ts';
import { warmDataCache, watchConnectivity } from './app/offline.ts';

captureInstallPrompt();
watchConnectivity();

createRoot(document.getElementById('root') as HTMLElement).render(<App />);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  registerSW({
    immediate: true,
    onOfflineReady: () => void warmDataCache(),
    onRegisteredSW: () => {
      if (navigator.serviceWorker.controller) void warmDataCache();
      else navigator.serviceWorker.addEventListener('controllerchange', () => void warmDataCache(), { once: true });
    },
  });
}
