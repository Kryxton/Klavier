import { useSyncExternalStore } from 'react';

// The service worker (public/sw.js) starts the app from its cache and reports a newer version
let available = false;
const listeners = new Set<() => void>();

// Called before the first render, so a message that arrives early isn't missed
export const startServiceWorker = () => {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type !== 'update-available') return;
    available = true;
    listeners.forEach(notify => notify());
  });
  navigator.serviceWorker.register('/sw.js').catch(e => console.error('Service worker failed', e));
};

const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
};

export const useUpdateAvailable = () => useSyncExternalStore(subscribe, () => available);
