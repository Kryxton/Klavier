import { flushSync } from 'react-dom';

const lessMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

// Runs a state change as a soft cross-fade where the browser can do that, otherwise just runs it
export function smoothly(change: () => void) {
  if (lessMotion() || !document.startViewTransition) return change();
  document.startViewTransition(() => flushSync(change));
}

// How scripts scroll: gliding, unless less motion is asked for (CSS can't reach scrollTo)
export const glide = (): ScrollBehavior => (lessMotion() ? 'auto' : 'smooth');
