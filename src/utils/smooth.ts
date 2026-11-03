const lessMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

// How scripts scroll: gliding, unless less motion is asked for (CSS can't reach scrollTo)
export const glide = (): ScrollBehavior => (lessMotion() ? 'auto' : 'smooth');
