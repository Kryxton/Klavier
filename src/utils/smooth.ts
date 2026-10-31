import { flushSync } from 'react-dom';

// Runs a state change as a soft cross-fade where the browser can do that, otherwise just runs it
export function smoothly(change: () => void) {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !document.startViewTransition) return change();
  document.startViewTransition(() => flushSync(change));
}
