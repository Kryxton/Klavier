import { useState, type ReactNode } from 'react';
import type { Piece } from '../types';
import { endBar, insertBars, removeBars, replaceBars, type Bars, type Hands } from '../utils/edit';
import { barTicks, eventAtBar } from '../utils/score';
import { BUTTON, BUTTON_SOFT, Choice } from './ui';

type Way = 'insert' | 'replace';

const HANDS: { id: Hands; label: string }[] = [
  { id: 'both', label: 'Beide' },
  { id: 'right', label: 'Rechts' },
  { id: 'left', label: 'Links' },
];
const WAYS: { id: Way; label: string }[] = [
  { id: 'insert', label: 'Einfügen' },
  { id: 'replace', label: 'Ersetzen' },
];

// Marking a run of bars and copying it. `show` scrolls to where the copy landed.
export function useBarTool(piece: Piece, change: (next: (piece: Piece) => Piece) => void, show: (id: string) => void) {
  const [on, setOn] = useState(false);
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [hands, setHands] = useState<Hands>('both');
  const [way, setWay] = useState<Way>('insert');
  const [placing, setPlacing] = useState(false);

  const open = (bar: number | null) => {
    setOn(true);
    setRange(bar === null ? null : { from: bar, to: bar });
    setPlacing(false);
  };

  // One hand alone can't move away from the other, so it is written over what stands there
  const pickHands = (next: Hands) => {
    setHands(next);
    setWay(next === 'both' ? 'insert' : 'replace');
  };

  const place = (at: number, write: (current: Piece, bars: Bars, at: number) => Piece) => {
    if (!range) return;
    let first: string | undefined;
    change(current => {
      const next = write(current, { ...range, hands }, at);
      first = eventAtBar(next.hands[hands === 'left' ? 'left' : 'right'], at, barTicks(next))?.id;
      return next;
    });
    setRange({ from: at, to: at + range.to - range.from });
    setPlacing(false);
    if (first) show(first);
  };

  // First tap: one bar. Second tap: the run up to there. The next one starts over.
  const tap = (bar: number) => {
    if (placing) return place(bar, way === 'insert' ? insertBars : replaceBars);
    setRange(old => {
      if (!old || old.from !== old.to) return { from: bar, to: bar };
      if (old.from === bar) return null;
      return { from: Math.min(old.from, bar), to: Math.max(old.from, bar) };
    });
  };

  const remove = () => {
    if (!range) return;
    change(current => removeBars(current, { ...range, hands }));
    if (hands === 'both') setRange(null);
  };

  return {
    on, range, hands, way, placing, open, tap, remove, pickHands, setWay, setPlacing,
    close: () => setOn(false),
    toEnd: () => place(endBar(piece, hands), replaceBars),
    marked: on && range ? { ...range, hands } : null,
  };
}

export function BarTools({ tool, children }: { tool: ReturnType<typeof useBarTool>; children: ReactNode }) {
  const { range, hands, way, placing } = tool;
  const named = range && (range.from === range.to ? `Takt ${range.from + 1} – für mehrere den letzten antippen` : `Takt ${range.from + 1} bis ${range.to + 1}`);

  if (placing) {
    return (
      <>
        <div className="flex items-center gap-2">
          <Choice className="flex-1 min-w-0" items={WAYS} value={way} onChange={tool.setWay} />
          {children}
        </div>
        <p className="min-h-7 text-[13px] text-dim">
          {way === 'insert' ? 'Tippe den Takt, vor dem die Kopie stehen soll. Alles ab dort rückt nach hinten.' : 'Tippe den Takt, ab dem die Kopie überschreibt. Nichts rückt nach.'}
        </p>
        <div className="grid grid-cols-2 gap-2 pb-2">
          <button type="button" onClick={tool.toEnd} className={BUTTON}>Ans Ende</button>
          <button type="button" onClick={() => tool.setPlacing(false)} className={BUTTON_SOFT}>Abbrechen</button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Choice className="flex-1 min-w-0" items={HANDS} value={hands} onChange={tool.pickHands} />
        {children}
      </div>
      <p className="min-h-7 text-[13px] text-dim">{named ?? 'Tippe den ersten und dann den letzten Takt.'}</p>
      <div className="grid grid-cols-2 gap-2 pb-2">
        <button type="button" disabled={!range} onClick={() => tool.setPlacing(true)} className={BUTTON}>Kopieren</button>
        <button type="button" disabled={!range} onClick={tool.remove} className={BUTTON_SOFT}>{hands === 'both' ? 'Löschen' : 'Leeren'}</button>
      </div>
    </>
  );
}
