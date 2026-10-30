import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, Repeat, SkipBack } from 'lucide-react';
import { Falling } from '../components/Falling';
import { Keyboard } from '../components/Keyboard';
import { Sheet } from '../components/Sheet';
import { BUTTON, Chip, Choice, Empty, ICON_BUTTON, INPUT, KICKER } from '../components/ui';
import type { Piece } from '../types';
import { cn } from '../utils/cn';
import { HIGHEST, LOWEST } from '../utils/notes';
import { barCount, barTicks, type Sound } from '../utils/score';
import { usePlayer, type HandChoice } from '../utils/usePlayer';

type View = 'falling' | 'sheet';
const VIEWS: { id: View; label: string }[] = [
  { id: 'sheet', label: 'Noten' },
  { id: 'falling', label: 'Fallend' },
];
const HANDS: { id: HandChoice; label: string }[] = [
  { id: 'both', label: 'Beide' },
  { id: 'right', label: 'Rechts' },
  { id: 'left', label: 'Links' },
];

// The octaves a piece uses, so the keyboard fits the screen; at least two octaves
function rangeOf(sounds: Sound[]) {
  if (!sounds.length) return { low: 48, high: 84 };
  const keys = sounds.map(s => s.midi);
  let low = Math.max(LOWEST, Math.min(...keys) - (Math.min(...keys) % 12));
  let high = Math.min(HIGHEST, Math.max(...keys) + (12 - (Math.max(...keys) % 12)) % 12);
  if (high - low < 24) {
    low = Math.max(LOWEST, low - 12);
    high = Math.min(HIGHEST, high + 12);
  }
  return { low, high };
}

export function Practice({ piece }: { piece: Piece }) {
  const [view, setView] = useState<View>('sheet');
  const [hands, setHands] = useState<HandChoice>('both');
  const [speed, setSpeed] = useState(100);
  const [looping, setLooping] = useState(false);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(4);
  const [bar, setBar] = useState(1);

  const bars = barCount(piece);
  const ticks = barTicks(piece);
  const first = Math.min(Math.max(1, from), Math.max(1, bars));
  const last = Math.min(Math.max(first, to), Math.max(1, bars));
  const loop = useMemo(
    () => (looping ? { from: (first - 1) * ticks, to: last * ticks } : null),
    [looping, first, last, ticks],
  );

  const { player, sounds, running, active, toggle } = usePlayer(piece, hands, speed / 100, loop);
  const { low, high } = useMemo(() => rangeOf(sounds), [sounds]);

  // The bar number only needs to follow roughly
  useEffect(() => {
    const timer = setInterval(() => setBar(Math.min(Math.max(1, bars), Math.floor(player.position() / ticks) + 1)), 200);
    return () => clearInterval(timer);
  }, [player, ticks, bars]);

  if (!sounds.length) {
    return <div className="mx-auto max-w-2xl"><Empty>Dieses Stück hat noch keine Noten. Trag unter „Schreiben“ welche ein.</Empty></div>;
  }

  return (
    <div className="h-full flex flex-col">
      <header className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-line">
        <h1 className="flex-1 min-w-0 font-serif text-2xl text-text break-words">{piece.title || 'Ohne Titel'}</h1>
        <Choice items={VIEWS} value={view} onChange={setView} className="w-36 shrink-0" />
      </header>

      {view === 'falling' ? (
        <>
          <div className="flex-1 min-h-0 bg-ink">
            <Falling player={player} sounds={sounds} low={low} high={high} ticksPerBar={ticks} hands={hands} />
          </div>
          <Keyboard low={low} high={high} fit active={active.keys} className="h-16 sm:h-24" />
        </>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto bg-paper">
          <div className="mx-auto max-w-5xl px-1 sm:px-8 py-4 sm:py-8">
            <Sheet piece={piece} active={active.events} follow={[...active.events][0]} />
          </div>
        </div>
      )}

      <div className="shrink-0 border-t border-line px-3 py-1.5 space-y-1">
        <div className="flex items-center gap-2">
          <button type="button" aria-label={running ? 'Anhalten' : 'Abspielen'} onClick={toggle} className={cn(BUTTON, 'w-12 min-h-11 px-0')}>
            {running ? <Pause className="w-4 h-4" strokeWidth={1.5} /> : <Play className="w-4 h-4" strokeWidth={1.5} />}
          </button>
          <button type="button" aria-label="Zum Anfang" onClick={() => player.seek(loop?.from ?? 0)} className={ICON_BUTTON}>
            <SkipBack className="w-5 h-5" strokeWidth={1.25} />
          </button>
          <span className="shrink-0 w-[4.5rem] text-xs text-dim tabular-nums">Takt {bar} / {bars}</span>
          <label className={cn(KICKER, 'flex-1 min-w-0 flex items-center gap-2 tracking-normal')}>
            <span className="shrink-0 w-9 text-right">{speed} %</span>
            <input
              type="range" min={25} max={125} step={5} value={speed} aria-label="Tempo in Prozent"
              onChange={e => setSpeed(Number(e.target.value))}
              className="flex-1 min-w-0 accent-accent"
            />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Choice items={HANDS} value={hands} onChange={setHands} className="flex-1 min-w-0" />
          <Chip on={looping} label="Takte wiederholen" onClick={() => setLooping(!looping)} className="w-10 shrink-0 flex items-center justify-center">
            <Repeat className="w-4 h-4" strokeWidth={1.25} />
          </Chip>
          <input type="number" aria-label="Schleife von Takt" min={1} max={bars} value={from} onChange={e => setFrom(Number(e.target.value))} className={cn(INPUT, 'w-9 shrink-0 text-center')} />
          <input type="number" aria-label="Schleife bis Takt" min={1} max={bars} value={to} onChange={e => setTo(Number(e.target.value))} className={cn(INPUT, 'w-9 shrink-0 text-center')} />
        </div>
      </div>
    </div>
  );
}
