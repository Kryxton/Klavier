import { useState } from 'react';

// The two looks of the app; the colours are in index.css, Barock is the default (no attribute)
export type Look = 'barock' | 'melancholie';
export const LOOKS: { id: Look; label: string }[] = [
  { id: 'barock', label: 'Barock' },
  { id: 'melancholie', label: 'Melancholie' },
];
const KEY = 'klavier_look';

export function loadLook(): Look {
  try {
    const saved = localStorage.getItem(KEY);
    return LOOKS.some(look => look.id === saved) ? (saved as Look) : 'barock';
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

export function useLook() {
  const [look, setLook] = useState(loadLook);
  const choose = (next: Look) => {
    setLook(next);
    applyLook(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Not saved: the look holds until the page is opened again
    }
  };
  return [look, choose] as const;
}
