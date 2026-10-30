import { useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { HIGHEST, LOWEST, MIDDLE_C, isBlack, keyBox, label } from '../utils/notes';
import { cn } from '../utils/cn';

const KEY_WIDTH = 36; // px per white key where the keyboard scrolls
const OCTAVE = KEY_WIDTH * 7;

// Two ways to show it: all 88 keys to scroll through (writing), or just the range of a piece that
// fits the screen (practising), where it lines up with the falling notes.
export function Keyboard({ low = LOWEST, high = HIGHEST, fit, marked, active, reveal, keySig = 0, onKey, className }: {
  low?: number; high?: number; fit?: boolean; marked?: ReadonlySet<number>; active?: ReadonlySet<number>;
  reveal?: number; keySig?: number; onKey?: (midi: number) => void; className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const keys = useMemo(() => Array.from({ length: high - low + 1 }, (_, i) => low + i), [low, high]);
  const whites = keys.filter(k => !isBlack(k)).length;

  useEffect(() => {
    const box = scroller.current;
    if (!box || fit) return;
    const middle = keyBox(MIDDLE_C, low, high).left * whites * KEY_WIDTH;
    box.scrollLeft = middle - box.clientWidth / 2 + OCTAVE / 2;
  }, [fit, low, high, whites]);

  // A note picked in the score: bring its key into view
  useEffect(() => {
    const box = scroller.current;
    if (!box || fit || reveal === undefined) return;
    const x = keyBox(reveal, low, high).left * whites * KEY_WIDTH;
    box.scrollTo({ left: x - box.clientWidth / 2, behavior: 'smooth' });
  }, [fit, reveal, low, high, whites]);

  const scrollBy = (step: number) => scroller.current?.scrollBy({ left: step, behavior: 'smooth' });

  const draw = (midi: number) => {
    const box = keyBox(midi, low, high);
    const black = isBlack(midi);
    const on = marked?.has(midi);
    const sounding = active?.has(midi);
    const name = label(midi, keySig);
    const showName = !black && !fit && (midi % 12 === 0 || whites < 20);
    return (
      <button
        key={midi}
        type="button"
        onClick={onKey && (() => onKey(midi))}
        tabIndex={onKey ? 0 : -1}
        aria-label={name}
        aria-pressed={on}
        data-key={midi}
        className={cn(
          'absolute top-0 flex items-end justify-center select-none',
          black ? 'z-10 h-[60%] rounded-b-sm bg-gradient-to-b from-[#2a2018] to-[#0a0704] shadow-[0_3px_6px_rgba(0,0,0,0.6)]'
            : 'h-full rounded-b-sm border-r border-[#9a8a6e] bg-gradient-to-b from-[#f5efe8] to-[#d8cfba]',
          on && (black ? 'from-accent to-[#7a6028]' : 'from-[#ffe8a8] to-accent'),
          sounding && (black ? 'from-[#7fb4e6] to-[#2f6aa3]' : 'from-[#cfe4f7] to-[#7fb4e6]'),
        )}
        style={{ left: `${box.left * 100}%`, width: `${box.width * 100}%` }}
      >
        {showName && <span className="pb-1 text-[10px] leading-none text-[#5a4e35] pointer-events-none">{name}</span>}
      </button>
    );
  };

  const board = (
    <div className="relative h-full" style={fit ? undefined : { width: whites * KEY_WIDTH }}>
      {keys.map(draw)}
    </div>
  );

  if (fit) return <div className={cn('shrink-0 bg-ink', className)}>{board}</div>;

  return (
    <div className={cn('relative shrink-0 flex bg-ink', className)}>
      <button type="button" aria-label="Eine Oktave tiefer" onClick={() => scrollBy(-OCTAVE)} className="w-8 shrink-0 flex items-center justify-center text-dim border-r border-line">
        <ChevronLeft className="w-5 h-5" />
      </button>
      <div ref={scroller} data-testid="keys" className="no-scrollbar flex-1 min-w-0 overflow-x-auto overflow-y-hidden">{board}</div>
      <button type="button" aria-label="Eine Oktave höher" onClick={() => scrollBy(OCTAVE)} className="w-8 shrink-0 flex items-center justify-center text-dim border-l border-line">
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}
