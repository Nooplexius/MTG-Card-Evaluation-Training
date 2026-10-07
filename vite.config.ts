import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.BASE_PATH ?? '/';

const ICON = (d: string, size = 22) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const KEYS: Array<[number, number, number, string, boolean]> = [
  [0, 1, 1, 'F', true],
  [3, 2, 1, 'D+', false], [2, 2, 2, 'D', false], [1, 2, 3, 'D\u2212', false],
  [6, 3, 1, 'C+', false], [5, 3, 2, 'C', false], [4, 3, 3, 'C\u2212', false],
  [9, 4, 1, 'B+', false], [8, 4, 2, 'B', false], [7, 4, 3, 'B\u2212', false],
  [12, 5, 1, 'A+', false], [11, 5, 2, 'A', false], [10, 5, 3, 'A\u2212', false],
];

/**
 * A static copy of the practice screen for a first-time visitor, painted before any JavaScript runs so the
 * starter card is the first thing on screen. React replaces it on mount; classes match the live markup.
 * A grade tapped before then is queued by index.html and committed on mount.
 */
function staticShell(total: number, synthetic: boolean): string {
  const keys = KEYS.map(
    ([g, col, row, label, tall]) =>
      `<button type="button" class="key${tall ? ' key--tall' : ''}" style="grid-column:${col};grid-row:${tall ? '1 / span 3' : row};--gc:var(--g${g})" aria-label="${label}" data-g="${g}"><span class="key__label display">${label}</span></button>`,
  ).join('');
  const credit = synthetic ? '<span class="credit__link credit__link--warn">Sample data: invented numbers, not 17Lands</span>' : '<span class="credit__link">Win-rate data from 17Lands Card Data</span>';
  return (
    `<div class="route-practice shell"><div class="practice" data-phase="grading">` +
    `<header class="topbar"><button type="button" class="icon-btn" aria-label="Menu">${ICON('M4 7h16M4 12h16M4 17h16')}</button>` +
    `<button type="button" class="filter-chip">${ICON('M4 6h16M7 12h10M10 18h4', 18)}<span class="sr-only">Practice filter: </span><span class="filter-chip__text">All sets</span><span class="filter-chip__count num">${total.toLocaleString('en-US')}</span></button>` +
    `<button type="button" class="mode-btn" aria-label="Random mode, tap to switch">${ICON('M4 7h3c4 0 6 10 10 10h3M17 14l3 3-3 3M4 17h3c1.5 0 2.7-1.4 3.8-3.2M14.2 9.2C15.3 7.4 16.5 7 17 7h3M17 4l3 3-3 3', 18)}<span>Random</span></button></header>` +
    `<div class="credit"><span class="credit__count num">1 / 20</span>${credit}<span class="credit__load"></span></div>` +
    `<main class="stage"><div class="card-slot"><div class="card-layout"><div class="card-wrap"><div class="card-deal"><div class="card-box is-loaded">` +
    `<button type="button" class="card-box__hit" aria-label="__NAME__. Open full screen"><img class="card-box__img" src="__URL__" alt="" width="672" height="936" crossorigin="anonymous" fetchpriority="high" decoding="async" draggable="false"></button></div></div></div>` +
    `<div class="card-tools"><button type="button" class="tool-btn" aria-label="Text view">${ICON('M5 6h14M5 10h14M5 14h9M5 18h11')}</button><button type="button" class="tool-btn tool-btn--quiet" aria-label="Skip this card (can't load or read it)">${ICON('M6 6l7 6-7 6V6zM16 6v12')}</button></div></div></div>` +
    `<div class="pad" role="group" aria-label="Grade this card">${keys}</div></main></div></div>`
  );
}

/**
 * Inlines a few random pool cards into index.html so a first-time visitor's card image starts loading
 * in parallel with the JavaScript, before the manifest arrives, and paints the static first screen.
 */
function starters(): Plugin {
  return {
    name: 'loupe-starters',
    transformIndexHtml(html) {
      const p = resolve(import.meta.dirname, 'public/data/manifest.json');
      if (!existsSync(p)) return html;
      const m = JSON.parse(readFileSync(p, 'utf8')) as { starters?: unknown[]; dataHash?: string; synthetic?: boolean; sets?: Array<{ cards: number }> };
      const total = (m.sets ?? []).reduce((n, s) => n + s.cards, 0);
      const payload = JSON.stringify({ hash: m.dataHash, cards: m.starters ?? [], shell: staticShell(total, Boolean(m.synthetic)) }).replace(/</g, '\\u003c');
      return html.replace('/*__STARTERS__*/null', payload);
    },
  };
}

/**
 * Build only: when the static first screen is shown, the app script starts once the starter card has painted
 * (its largest-contentful-paint entry, or two frames after load where that API is missing), so the card image
 * gets the bandwidth first on slow connections. Returning visitors load it immediately.
 */
function deferAppScript(): Plugin {
  return {
    name: 'loupe-defer-app-script',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const m = /<script type="module" crossorigin src="([^"]+)"><\/script>/.exec(html);
        if (!m) return html;
        const loader =
          `<script>(function(){var u=${JSON.stringify(m[1])};function go(){var s=document.createElement('script');s.type='module';s.crossOrigin='anonymous';s.src=u;document.head.appendChild(s);}` +
          `var img=window.__LOUPE_STARTER__&&document.querySelector('#root .card-box__img');if(!img){go();return;}var done=false;` +
          `function after(){if(done)return;done=true;setTimeout(go,0);}` +
          `var lcp=window.PerformanceObserver&&(PerformanceObserver.supportedEntryTypes||[]).indexOf('largest-contentful-paint')>=0;` +
          `if(lcp)new PerformanceObserver(function(l){l.getEntries().forEach(function(e){if(e.element===img)after();});}).observe({type:'largest-contentful-paint',buffered:true});` +
          `else if(img.complete)after();else img.addEventListener('load',function(){requestAnimationFrame(function(){requestAnimationFrame(after);});});` +
          `img.addEventListener('error',after);addEventListener('pointerdown',after,true);addEventListener('keydown',after,true);setTimeout(after,3000);})();</script>`;
        return html.replace(m[0], '').replace(/<link rel="modulepreload"[^>]*>/g, '').replace('<noscript>', `${loader}<noscript>`);
      },
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    react(),
    starters(),
    deferAppScript(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'Loupe — Limited card evaluation trainer',
        short_name: 'Loupe',
        description: 'Grade Magic: The Gathering Limited cards and learn from 17Lands win rates.',
        theme_color: '#0e1311',
        background_color: '#0e1311',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,webmanifest}'],
        globIgnores: ['**/data/**'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/\/data\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('/data/manifest.json') || url.pathname.endsWith('/data/status.json'),
            handler: 'NetworkFirst',
            options: { cacheName: 'loupe-manifest', networkTimeoutSeconds: 4, expiration: { maxEntries: 4 } },
          },
          {
            urlPattern: ({ url }) => /\/data\/(sets\/[A-Z0-9]+\.[0-9a-f]+|tags\.[0-9a-f]+)\.json$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'loupe-data', expiration: { maxEntries: 80, purgeOnQuotaError: true } },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'cards.scryfall.io',
            handler: 'CacheFirst',
            options: { cacheName: 'loupe-card-images', expiration: { maxEntries: 900, maxAgeSeconds: 60 * 60 * 24 * 60, purgeOnQuotaError: true }, cacheableResponse: { statuses: [200] } },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'svgs.scryfall.io',
            handler: 'CacheFirst',
            options: { cacheName: 'loupe-symbols', expiration: { maxEntries: 120 }, cacheableResponse: { statuses: [200] } },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: false,
    modulePreload: { polyfill: false },
  },
});
