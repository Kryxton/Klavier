import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, Repeat, SkipBack } from 'lucide-react';
import { Falling } from '../components/Falling';
import { Sheet } from '../components/Sheet';
import { Choice, Empty, ICON_BUTTON, INPUT, SHEET, Toggle } from '../components/ui';
import type { Piece } from '../types';
import { cn } from '../utils/cn';
import { barCount, barTicks } from '../utils/score';
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

export function Practice({ piece }: { piece: Piece }) {
  const [view, setView] = useState<View>('sheet');
  const [hands, setHands] = useState<HandChoice>('both');
  const [speed, setSpeed] = useState(100);
  const [pedal, setPedal] = useState(false);
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

  const { player, sounds, running, active, toggle } = usePlayer(piece, { hands, speed: speed / 100, loop, pedal, followNotes: view === 'sheet' });

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
      <header className="shrink-0 flex items-center gap-3 px-4 py-2 md:px-6">
        <h1 className="flex-1 min-w-0 truncate text-[17px] font-bold tracking-tight md:text-[20px]">{piece.title || 'Ohne Titel'}</h1>
        <Choice items={VIEWS} value={view} onChange={setView} className="w-40 shrink-0" />
      </header>

      {view === 'falling' ? (
        <div className="flex-1 min-h-0 md:px-6">
          <div className="appear h-full overflow-hidden bg-stage md:rounded-2xl">
            <Falling player={player} sounds={sounds} ticksPerBar={ticks} hands={hands} />
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto md:px-6 md:pb-4">
          <div className={cn(SHEET, 'appear mx-auto max-w-5xl px-1 py-3 sm:px-6 sm:py-6')}>
            <Sheet piece={piece} active={active.events} follow={[...active.events][0]} />
          </div>
        </div>
      )}

      <div className="shrink-0 px-3 py-2">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-3 gap-y-2">
          <button type="button" aria-label={running ? 'Anhalten' : 'Abspielen'} onClick={toggle} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-white">
            {running ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="ml-0.5 h-5 w-5" fill="currentColor" />}
          </button>
          <button type="button" aria-label="Zum Anfang" onClick={() => player.seek(loop?.from ?? 0)} className={ICON_BUTTON}>
            <SkipBack className="h-5 w-5" />
          </button>
          <span className="shrink-0 text-[13px] text-dim tabular-nums">Takt {bar} von {bars}</span>
          <label className="flex flex-1 min-w-[8rem] items-center gap-2 text-[13px] text-dim">
            <span className="shrink-0 w-10 text-right tabular-nums">{speed} %</span>
            <input
              type="range" min={25} max={125} step={5} value={speed} aria-label="Tempo in Prozent"
              onChange={e => setSpeed(Number(e.target.value))}
              className="flex-1 min-w-0 accent-accent"
            />
          </label>
          <div className="flex w-full items-center gap-2 lg:w-auto">
            <Choice items={HANDS} value={hands} onChange={setHands} className="flex-1 min-w-0 lg:w-56 lg:flex-none" />
            <Toggle on={pedal} onClick={() => setPedal(!pedal)} className="shrink-0 px-3">Pedal</Toggle>
            <Toggle on={looping} label="Takte wiederholen" onClick={() => setLooping(!looping)} className="w-9 shrink-0 px-0">
              <Repeat className="h-4 w-4" />
            </Toggle>
            <input type="number" aria-label="Schleife von Takt" min={1} max={bars} value={from} onChange={e => setFrom(Number(e.target.value))} className={cn(INPUT, 'w-12 shrink-0 px-1 py-1.5 text-center')} />
            <input type="number" aria-label="Schleife bis Takt" min={1} max={bars} value={to} onChange={e => setTo(Number(e.target.value))} className={cn(INPUT, 'w-12 shrink-0 px-1 py-1.5 text-center')} />
          </div>
        </div>
      </div>
    </div>
  );
}
