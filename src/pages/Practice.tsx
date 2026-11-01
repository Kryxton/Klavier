import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Metronome, Pause, Play, Repeat, SkipBack } from 'lucide-react';
import { Falling } from '../components/Falling';
import { Sheet } from '../components/Sheet';
import { Choice, Empty, ICON_BUTTON, SHEET, Toggle } from '../components/ui';
import type { Piece } from '../types';
import { cn } from '../utils/cn';
import type { Bars } from '../utils/edit';
import { barCount, barTicks } from '../utils/score';
import { usePlayer, type HandChoice } from '../utils/usePlayer';
import { useScreenAwake } from '../utils/wakeLock';
import { useRecording } from '../utils/useRecording';

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
  const [countIn, setCountIn] = useState(false);
  const [loopBars, setLoopBars] = useState<{ from: number; to: number } | null>(null);
  // Bars are tapped on the notes, so the falling view steps aside until the loop is set
  const [picking, setPicking] = useState<{ first: number | null; back: View } | null>(null);
  const [bar, setBar] = useState(1);
  useScreenAwake();

  const bars = barCount(piece);
  const ticks = barTicks(piece);
  const loop = useMemo(() => (loopBars ? { from: loopBars.from * ticks, to: (loopBars.to + 1) * ticks } : null), [loopBars, ticks]);

  const recording = useRecording(piece);
  const [original, setOriginal] = useState(false);
  const { player, sounds, running, active, play, pause } = usePlayer(piece, {
    hands, speed: speed / 100, loop, pedal, countIn, followNotes: view === 'sheet', recording: original ? recording : null,
  });

  // The bar number only needs to follow roughly
  useEffect(() => {
    const timer = setInterval(() => setBar(Math.min(Math.max(1, bars), Math.floor(player.position() / ticks) + 1)), 200);
    return () => clearInterval(timer);
  }, [player, ticks, bars]);

  // Dragging the falling notes holds the music, letting go picks it up from there
  const resume = useRef(false);
  const grab = useCallback(() => {
    resume.current = player.isRunning();
    pause();
  }, [player, pause]);
  const drop = useCallback(() => {
    if (resume.current) play();
  }, [play]);

  if (!sounds.length) {
    return <div className="mx-auto max-w-2xl"><Empty>Dieses Stück hat noch keine Noten. Trag unter „Notenblatt“ welche ein.</Empty></div>;
  }

  const stopPicking = (next: View) => {
    setPicking(null);
    setView(next);
  };

  const tapLoop = () => {
    if (picking) return stopPicking(picking.back);
    if (loopBars) return setLoopBars(null);
    setPicking({ first: null, back: view });
    setView('sheet');
  };

  const tapBar = (tapped: number) => {
    if (!picking) return play(tapped * ticks);
    if (picking.first === null) return setPicking({ ...picking, first: tapped });
    const from = Math.min(picking.first, tapped);
    setLoopBars({ from, to: Math.max(picking.first, tapped) });
    if (!running) player.seek(from * ticks);
    stopPicking(picking.back);
  };

  const shown = picking ? picking.first !== null && { from: picking.first, to: picking.first } : loopBars;
  const marked: Bars | null = shown ? { ...shown, hands: 'both' } : null;
  const loopName = loopBars && (loopBars.from === loopBars.to ? `Schleife: Takt ${loopBars.from + 1}` : `Schleife: Takt ${loopBars.from + 1} bis ${loopBars.to + 1}`);
  const hint = picking
    ? picking.first === null ? 'Tippe den ersten Takt der Schleife.' : `Takt ${picking.first + 1} – tippe jetzt den letzten Takt.`
    : loopName;

  return (
    <div className="h-full flex flex-col">
      <header className="shrink-0 flex items-center gap-3 px-4 py-2 md:px-6">
        <h1 className="flex-1 min-w-0 truncate text-[17px] font-bold tracking-tight md:text-[20px]">{piece.title || 'Ohne Titel'}</h1>
        <Choice items={VIEWS} value={view} onChange={stopPicking} className="w-40 shrink-0" />
      </header>

      {view === 'falling' ? (
        <div className="flex-1 min-h-0 md:px-6">
          <div className="appear h-full overflow-hidden bg-stage md:rounded-2xl">
            <Falling player={player} sounds={sounds} ticksPerBar={ticks} hands={hands} onGrab={grab} onDrop={drop} />
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto md:px-6 md:pb-4">
          <div className={cn(SHEET, 'appear mx-auto max-w-5xl px-1 py-3 sm:px-6 sm:py-6')}>
            <Sheet piece={piece} active={active.events} follow={[...active.events][0]} bars={marked} onBar={tapBar} />
          </div>
        </div>
      )}

      <div className="shrink-0 px-3 py-2">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-3 gap-y-2">
          {hint && <p className="w-full text-center text-[13px] text-dim">{hint}</p>}
          <button type="button" aria-label={running ? 'Anhalten' : 'Abspielen'} onClick={() => (running ? pause() : play())} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-white">
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
            {recording && <Toggle on={original} onClick={() => setOriginal(!original)} className="shrink-0 px-3">Original</Toggle>}
            {!original && <Toggle on={pedal} onClick={() => setPedal(!pedal)} className="shrink-0 px-3">Pedal</Toggle>}
            <Toggle on={countIn} label="Vorzähler" onClick={() => setCountIn(!countIn)} className="w-9 shrink-0 px-0">
              <Metronome className="h-4 w-4" />
            </Toggle>
            <Toggle on={Boolean(picking || loopBars)} label="Takte wiederholen" onClick={tapLoop} className="w-9 shrink-0 px-0">
              <Repeat className="h-4 w-4" />
            </Toggle>
          </div>
        </div>
      </div>
    </div>
  );
}
