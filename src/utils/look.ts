import { useSyncExternalStore } from 'react';

// The two looks of the app; the colours are in index.css, Barock is the default (no attribute)
export type Look = 'barock' | 'melancholie';
const KEY = 'klavier_look';

export function loadLook(): Look {
  try {
    return localStorage.getItem(KEY) === 'melancholie' ? 'melancholie' : 'barock';
  } catch {
    return 'barock';
  }
}

// Sets the look on the page, and the colour of the browser bar to the shell's
export function applyLook(look: Look) {
  const root = document.documentElement;
  if (look === 'barock') delete root.dataset.look;
  else root.dataset.look = look;
  const nav = getComputedStyle(root).getPropertyValue('--color-nav').trim();
  if (nav) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', nav);
}

// One look for every switch on the screen (the rule under „Stücke“ and the one in the sidebar)
let current: Look | null = null;
const listeners = new Set<() => void>();
const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
};
const read = () => (current ??= loadLook());

// The colours glide from one look to the other by themselves (index.css)
export function setLook(next: Look) {
  current = next;
  applyLook(next);
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Not saved: the look holds until the page is opened again
  }
  listeners.forEach(notify => notify());
}

export const useLook = () => useSyncExternalStore(subscribe, read);

// For tests: forget what was read, as a fresh start would
export const resetLook = () => {
  current = null;
};
