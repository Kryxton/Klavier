import type { Duration } from '../types';

// Real note symbols for the length buttons: they say at a glance what „1/8“ has to be read for
const HEAD = 'M3.6 15.9c0-1.5 1.8-2.9 3.7-2.9 1.3 0 2.1.7 2.1 1.7 0 1.5-1.8 2.9-3.7 2.9-1.3 0-2.1-.7-2.1-1.7z';

export function NoteIcon({ duration }: { duration: Duration }) {
  const open = duration === 'w' || duration === 'h';
  const stem = duration !== 'w';
  const flags = { w: 0, h: 0, q: 0, '8': 1, '16': 2, '32': 3 }[duration];
  return (
    <svg viewBox="0 0 18 20" width="18" height="20" aria-hidden fill="currentColor">
      <path
        d={HEAD}
        fill={open ? 'none' : 'currentColor'}
        stroke="currentColor"
        strokeWidth={open ? 1.3 : 0}
        transform={duration === 'w' ? 'translate(2.4 -5)' : undefined}
      />
      {stem && <rect x="8.7" y="2" width="1.2" height="13.4" rx="0.6" />}
      {Array.from({ length: flags }, (_, i) => (
        <path key={i} d={`M9.9 ${2 + i * 3.2}c.5 2.4 3.6 3 3.4 6-.6-1.8-2-2.6-3.4-3z`} />
      ))}
    </svg>
  );
}

export function TieIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M3 8c3 5 11 5 14 0" />
    </svg>
  );
}

export function DotIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden fill="currentColor">
      <circle cx="10" cy="10" r="2.4" />
    </svg>
  );
}
