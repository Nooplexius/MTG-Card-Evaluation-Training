/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface Window {
  /** Set by index.html for a first-time visitor who lands on the practice screen. */
  __LOUPE_STARTER__?: { card: { set: string; o: string; id: string; v?: string; name: string }; url: string; hash?: string; shell?: string } | null;
  /** When the static first screen's card image loaded (ms since epoch). */
  __LOUPE_STARTER_LOADED__?: number;
  /** A grade tapped on the static first screen before the app mounted. */
  __LOUPE_EARLY_GRADE__?: { g: number; at: number } | null;
}
