import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.BASE_PATH ?? '/';

/**
 * Inlines a few random pool cards into index.html so a first-time visitor's card image starts loading
 * in parallel with the JavaScript, before the manifest arrives.
 */
function starters(): Plugin {
  return {
    name: 'loupe-starters',
    transformIndexHtml(html) {
      const p = resolve(import.meta.dirname, 'public/data/manifest.json');
      if (!existsSync(p)) return html;
      const m = JSON.parse(readFileSync(p, 'utf8')) as { starters?: unknown[]; dataHash?: string };
      const payload = JSON.stringify({ hash: m.dataHash, cards: m.starters ?? [] }).replace(/</g, '\\u003c');
      return html.replace('/*__STARTERS__*/null', payload);
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    react(),
    starters(),
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
