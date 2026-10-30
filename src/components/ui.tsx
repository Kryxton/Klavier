import type { ReactNode } from 'react';
import { cn } from '../utils/cn';

// Highlights use the accent tokens (index.css), so the look is one set of colors
export const BUTTON = 'flex items-center justify-center gap-2 min-h-11 px-3 rounded-md bg-accent text-on-accent text-sm font-semibold whitespace-nowrap disabled:opacity-40';
export const BUTTON_GHOST = 'flex items-center justify-center gap-2 min-h-11 px-3 rounded-md border border-line text-text text-sm whitespace-nowrap disabled:opacity-40';
export const INPUT = 'bg-ink border border-line rounded-md px-3 py-2 text-text outline-none focus:border-accent min-w-0';
export const LABEL = 'text-xs text-dim';
export const HEADING = 'font-serif text-accent-light';

// A small toggle button
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
        'min-h-10 min-w-0 px-0.5 rounded-md border text-xs sm:text-sm whitespace-nowrap transition-colors disabled:opacity-40',
        on ? 'bg-accent text-on-accent border-transparent font-semibold' : 'border-line text-dim',
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
  return <div className="border border-dashed border-line rounded-md p-6 text-sm text-dim text-center">{children}</div>;
}
