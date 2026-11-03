import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '../utils/cn';
import { setLook, useLook } from '../utils/look';
import { smoothly } from '../utils/smooth';

const FAR = 60; // px to the right that switch the look on letting go (less on a short rule)

// The gilded double rule under the big titles. Its lozenge is a hidden switch: drag it to the
// right along the rule and let go, and the look changes; it always springs back to the middle.
export function LookRule({ className }: { className?: string }) {
  const look = useLook();
  const rule = useRef<HTMLDivElement>(null);
  const start = useRef<number | null>(null);
  const [shift, setShift] = useState(0);
  const [held, setHeld] = useState(false);

  const room = () => {
    const width = rule.current?.getBoundingClientRect().width ?? 0;
    return width > 0 ? width / 2 - 8 : Infinity;
  };
  const far = () => Math.min(FAR, room() * 0.6);
  const toggle = () => smoothly(() => setLook(look === 'barock' ? 'melancholie' : 'barock'));

  const down = (e: PointerEvent<HTMLDivElement>) => {
    start.current = e.clientX;
    setHeld(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (start.current === null) return;
    const dx = e.clientX - start.current;
    // To the right it follows the finger up to the end of the rule; to the left it gives a little
    setShift(dx >= 0 ? Math.min(dx, room()) : Math.max(dx / 4, -12));
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (start.current === null) return;
    const went = e.clientX - start.current >= far();
    start.current = null;
    setHeld(false);
    setShift(0);
    if (went) toggle();
  };
  const cancel = () => {
    start.current = null;
    setHeld(false);
    setShift(0);
  };
  const key = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    toggle();
  };

  const armed = shift >= far();
  return (
    <div ref={rule} className={cn('relative h-11', className)}>
      <div aria-hidden className="ornament absolute inset-x-0 top-1/2 -translate-y-1/2" />
      <div
        role="switch"
        aria-checked={look === 'melancholie'}
        aria-label="Aussehen wechseln"
        tabIndex={0}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        onKeyDown={key}
        data-armed={armed || undefined}
        className="absolute top-0 left-1/2 -ml-[22px] flex h-11 w-11 cursor-grab touch-pan-y items-center justify-center rounded-full outline-none select-none focus-visible:ring-1 focus-visible:ring-trim active:cursor-grabbing"
        style={{
          transform: `translateX(${shift}px)`,
          transition: held ? 'none' : 'transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        <span
          aria-hidden
          className="lozenge"
          style={{ transform: `rotate(45deg) scale(${armed ? 1.45 : held ? 1.2 : 1})` }}
        />
      </div>
    </div>
  );
}
