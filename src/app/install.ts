interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;

export function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
  });
}

export function isStandalone(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

/** iOS Safari can clear site storage after seven days without a visit unless the app is on the Home Screen. */
export function isIosBrowser(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandalone();
}

export function canPromptInstall(): boolean {
  return deferred !== null && !isStandalone();
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const choice = await deferred.userChoice;
  deferred = null;
  return choice.outcome === 'accepted';
}
