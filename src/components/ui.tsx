import type { ReactNode } from 'react';
import { cn } from '../utils/cn';

// Sharp corners, hairlines and letter spacing instead of boxes and fills. Colors only from the
// tokens in index.css.
export const BUTTON = 'flex items-center justify-center gap-2 min-h-12 px-5 bg-text text-ink text-[11px] font-semibold uppercase tracking-[0.2em] whitespace-nowrap disabled:opacity-30';
export const BUTTON_GHOST = 'flex items-center justify-center gap-2 min-h-12 px-5 border border-line text-text text-[11px] font-medium uppercase tracking-[0.2em] whitespace-nowrap disabled:opacity-30';
export const TEXT_BUTTON = 'min-h-11 px-2 text-[11px] font-medium uppercase tracking-[0.2em] text-dim whitespace-nowrap disabled:opacity-30';
export const ICON_BUTTON = 'flex items-center justify-center min-h-10 min-w-10 text-dim disabled:opacity-25';
export const INPUT = 'bg-transparent border-b border-line px-0 py-2 text-text outline-none focus:border-accent min-w-0';
export const KICKER = 'text-[10px] font-medium uppercase tracking-[0.24em] text-dim';
export const HEADING = 'font-serif text-text';

// A small toggle: the word lights up and a hairline appears under it
export function Chip({ on, onClick, disabled, label, children, className }: {
  on: boolean; onClick: () => void; disabled?: boolean; label?: string; children: ReactNode; className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      aria-label={label}
      className={cn(
        'min-h-10 min-w-0 px-0.5 border-b text-xs tracking-wide whitespace-nowrap transition-colors disabled:opacity-30',
        on ? 'border-accent text-text' : 'border-transparent text-dim',
        className,
      )}
    >
      {children}
    </button>
  );
}

// One of a few options, in equal widths
export function Choice<T extends string | number>({ items, value, onChange, className }: {
  items: readonly { id: T; label: string; name?: string }[]; value: T; onChange: (v: T) => void; className?: string;
}) {
  return (
    <div className={cn('grid gap-1', className)} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map(item => (
        <Chip key={item.id} on={value === item.id} onClick={() => onChange(item.id)} label={item.name}>
          {item.label}
        </Chip>
      ))}
    </div>
  );
}

// Shown where something is still missing
export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-6 py-16 text-center text-dim">{children}</div>;
}
