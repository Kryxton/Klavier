import type { ReactNode } from 'react';
import type { Hands } from '../types';
import { cn } from '../utils/cn';

// Colors only from the tokens in index.css
export const BUTTON = 'flex items-center justify-center gap-2 min-h-12 px-5 rounded-xl bg-text text-on-text text-[15px] font-semibold whitespace-nowrap disabled:opacity-30';
export const BUTTON_RED = 'flex items-center justify-center gap-2 min-h-12 px-5 rounded-xl bg-accent text-on-accent text-[15px] font-semibold whitespace-nowrap disabled:opacity-30';
export const BUTTON_SOFT = 'flex items-center justify-center gap-2 min-h-12 px-5 rounded-xl bg-track text-text text-[15px] font-medium whitespace-nowrap disabled:opacity-40';
export const TEXT_BUTTON = 'min-h-11 px-2 text-[15px] font-medium text-accent whitespace-nowrap disabled:opacity-30';
export const ICON_BUTTON = 'flex items-center justify-center min-h-10 min-w-10 rounded-xl text-text disabled:opacity-25';
export const INPUT = 'bg-card border border-line rounded-xl px-3 py-2.5 text-text outline-none focus:border-accent min-w-0';
export const LABEL = 'text-[13px] text-dim';
export const SHEET = 'paper shadow-sheet-edge md:rounded-2xl md:shadow-sheet';

// One of a few options: a track with a thumb that slides to the chosen one
export function Choice<T extends string | number>({ items, value, onChange, className }: {
  items: readonly { id: T; label: ReactNode; name?: string }[]; value: T; onChange: (v: T) => void; className?: string;
}) {
  const index = Math.max(0, items.findIndex(item => item.id === value));
  return (
    <div role="group" className={cn('relative grid rounded-control bg-track p-0.5', className)} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      <div className="absolute inset-y-0.5 left-0.5 pr-1" style={{ width: `calc((100% - 4px) / ${items.length})`, transform: `translateX(${index * 100}%)`, transition: 'transform 260ms var(--ease-out-soft)' }} aria-hidden>
        <div className="h-full w-full rounded-thumb bg-thumb shadow-thumb" style={{ width: 'calc(100% + 4px)' }} />
      </div>
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          aria-pressed={value === item.id}
          aria-label={item.name}
          onClick={() => onChange(item.id)}
          className={cn(
            'relative z-10 flex min-h-9 min-w-0 items-center justify-center whitespace-nowrap px-1 text-[13px] font-medium active:scale-100',
            value === item.id ? 'text-text' : 'text-dim',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

// Both hands or one: to play, or to copy bars
export const HAND_CHOICES: { id: Hands; label: string }[] = [
  { id: 'both', label: 'Beide' },
  { id: 'right', label: 'Rechts' },
  { id: 'left', label: 'Links' },
];

// A small on/off button
export function Toggle({ on, onClick, label, children, className }: {
  on: boolean; onClick: () => void; label?: string; children: ReactNode; className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      className={cn(
        'flex min-h-9 min-w-0 items-center justify-center rounded-control px-2 text-[13px] font-medium whitespace-nowrap',
        on ? 'bg-accent-soft text-accent' : 'bg-track text-dim',
        className,
      )}
    >
      {children}
    </button>
  );
}

// Shown where something is still missing
export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-6 py-16 text-center text-dim">{children}</div>;
}
