import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, CopyPlus, Plus, Redo2, Settings2, Trash2, Undo2 } from 'lucide-react';
import { Keyboard } from '../components/Keyboard';
import { Sheet } from '../components/Sheet';
import { BUTTON, Chip, Choice, ICON_BUTTON, INPUT, KICKER, TEXT_BUTTON } from '../components/ui';
import type { Duration, Hand, Piece } from '../types';
import { playKey } from '../utils/audio';
import { cn } from '../utils/cn';
import {
  addEvent, appendBarOf, duplicateEvent, moveEvent, removeEvent, removeLast, setLength, setSpelling, setTie, toggleKey,
} from '../utils/edit';
import { KEY_CHOICES, isBlack, label } from '../utils/notes';

const DURATIONS: { id: Duration; label: string; name: string }[] = [
  { id: 'w', label: '1/1', name: 'Ganze' },
  { id: 'h', label: '1/2', name: 'Halbe' },
  { id: 'q', label: '1/4', name: 'Viertel' },
  { id: '8', label: '1/8', name: 'Achtel' },
  { id: '16', label: '1/16', name: 'Sechzehntel' },
  { id: '32', label: '1/32', name: 'Zweiunddreißigstel' },
];
const HANDS: { id: Hand; label: string }[] = [
  { id: 'right', label: 'Rechte Hand' },
  { id: 'left', label: 'Linke Hand' },
];
const BEATS = [2, 3, 4, 5, 6, 7, 9, 12];
const BEAT_VALUES = [2, 4, 8];

const ICON = { strokeWidth: 1.25, className: 'w-5 h-5' };

export function Write({ piece, change, undo, redo, canUndo, canRedo }: {
  piece: Piece; change: (next: (piece: Piece) => Piece) => void; undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean;
}) {
  const [hand, setHand] = useState<Hand>('right');
  const [dur, setDur] = useState<Duration>('q');
  const [dotted, setDotted] = useState(false);
  const [tie, setTieOn] = useState(false);
  const [instant, setInstant] = useState(false); // every tap writes a note at once: melodies
  const [chord, setChord] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [follow, setFollow] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  // A piece comes out of a video ready, so the tools stay away until something needs correcting
  const [tools, setTools] = useState(!piece.hands.right.length && !piece.hands.left.length);

  const event = piece.hands[hand].find(ev => ev.id === selected) ?? null;

  // Undo can remove the selected event
  useEffect(() => {
    if (selected && !event) setSelected(null);
  }, [selected, event]);

  const write = (keys: number[]) => {
    let id = '';
    change(current => {
      const added = addEvent(current, hand, keys, { dur, dotted, tie });
      id = added.ev.id;
      return added.piece;
    });
    setFollow(id);
    setChord(new Set());
  };

  const tapKey = (midi: number) => {
    playKey(midi);
    if (event) change(current => toggleKey(current, hand, event.id, midi));
    else if (instant) write([midi]);
    else setChord(old => {
      const next = new Set(old);
      if (!next.delete(midi)) next.add(midi);
      return next;
    });
  };

  const pickLength = (nextDur: Duration, nextDotted: boolean) => {
    setDur(nextDur);
    setDotted(nextDotted);
    if (event) change(current => setLength(current, hand, event.id, nextDur, nextDotted));
  };

  const pickTie = () => {
    const next = !(event ? Boolean(event.tie) : tie);
    setTieOn(next);
    if (event) change(current => setTie(current, hand, event.id, next));
  };

  const select = (noteHand: Hand, id: string) => {
    setTools(true);
    if (id === selected) return setSelected(null);
    const ev = piece.hands[noteHand].find(e => e.id === id);
    setHand(noteHand);
    setSelected(id);
    setChord(new Set());
    if (ev) {
      setDur(ev.dur);
      setDotted(Boolean(ev.dotted));
    }
  };

  const insertBehind = () => {
    if (!event) return;
    let id = '';
    change(current => {
      const added = addEvent(current, hand, [], { dur: event.dur, dotted: Boolean(event.dotted) }, event.id);
      id = added.ev.id;
      return added.piece;
    });
    setSelected(id);
    setFollow(id);
  };

  const copyEvent = () => {
    if (!event) return;
    let id = '';
    change(current => {
      const copy = duplicateEvent(current, hand, event.id);
      id = copy.id;
      return copy.piece;
    });
    setSelected(id);
    setFollow(id);
  };

  const remove = () => {
    if (!event) return;
    change(current => removeEvent(current, hand, event.id));
    setSelected(null);
  };

  const shownDur = event?.dur ?? dur;
  const shownDotted = event ? Boolean(event.dotted) : dotted;
  const shownTie = event ? Boolean(event.tie) : tie;
  const blackKeys = event?.keys.filter(isBlack) ?? [];

  return (
    <div className="h-full flex flex-col">
      <header className="shrink-0 flex items-center gap-1 px-4 py-2 border-b border-line text-2xl">
        <input
          aria-label="Titel"
          value={piece.title}
          onChange={e => change(current => ({ ...current, title: e.target.value }))}
          className="flex-1 min-w-0 bg-transparent font-serif text-text outline-none"
        />
        {tools && (
          <>
            <button type="button" aria-label="Rückgängig" disabled={!canUndo} onClick={undo} className={ICON_BUTTON}><Undo2 {...ICON} /></button>
            <button type="button" aria-label="Wiederholen" disabled={!canRedo} onClick={redo} className={ICON_BUTTON}><Redo2 {...ICON} /></button>
          </>
        )}
        <button type="button" aria-label="Einstellungen des Stücks" aria-expanded={settings} onClick={() => setSettings(!settings)} className={cn(ICON_BUTTON, settings && 'text-accent')}><Settings2 {...ICON} /></button>
        <button type="button" onClick={() => { setTools(!tools); setSelected(null); }} className={cn(TEXT_BUTTON, 'text-text')}>
          {tools ? 'Fertig' : 'Korrigieren'}
        </button>
      </header>

      {settings && (
        <div className="shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-4 px-4 py-3 border-b border-line">
          <label className={cn(KICKER, 'flex flex-col gap-1')}>Takt
            <div className="flex items-center gap-1 text-text">
              <select aria-label="Schläge pro Takt" value={piece.beats} onChange={e => change(p => ({ ...p, beats: Number(e.target.value) }))} className={cn(INPUT, 'flex-1')}>
                {BEATS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              /
              <select aria-label="Notenwert" value={piece.beatValue} onChange={e => change(p => ({ ...p, beatValue: Number(e.target.value) }))} className={cn(INPUT, 'flex-1')}>
                {BEAT_VALUES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </label>
          <label className={cn(KICKER, 'flex flex-col gap-1')}>Tempo
            <input
              type="number" min={20} max={300} value={piece.bpm}
              onChange={e => change(p => ({ ...p, bpm: Math.max(1, Number(e.target.value) || 1) }))}
              className={INPUT}
            />
          </label>
          <label className={cn(KICKER, 'flex flex-col gap-1 col-span-2')}>Tonart
            <select value={piece.key} onChange={e => change(p => ({ ...p, key: Number(e.target.value) }))} className={INPUT}>
              {KEY_CHOICES.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </label>
        </div>
      )}

      <div data-testid="sheet-box" className="flex-1 min-h-0 overflow-auto bg-paper">
        <div className="mx-auto max-w-5xl px-1 sm:px-8 py-4 sm:py-8">
          <Sheet piece={piece} selected={selected} follow={follow} onSelect={select} />
        </div>
      </div>

      {tools && (
        <>
          <div className="shrink-0 border-t border-line px-3 pt-1 pb-2 space-y-1">
            <Choice items={HANDS} value={hand} onChange={h => { setHand(h); setSelected(null); setChord(new Set()); }} />
            <div className="grid grid-cols-[repeat(6,minmax(0,1fr))_2rem_2rem] gap-1">
              {DURATIONS.map(d => (
                <Chip key={d.id} on={shownDur === d.id} label={d.name} onClick={() => pickLength(d.id, shownDotted)}>{d.label}</Chip>
              ))}
              <Chip on={shownDotted} label="Punktiert" onClick={() => pickLength(shownDur, !shownDotted)}>•</Chip>
              <Chip on={shownTie} label="Mit nächster Note verbinden" onClick={pickTie}>⌒</Chip>
            </div>

            {event ? (
              <>
                <div className="flex items-center gap-3 min-h-7">
                  <span className="flex-1 min-w-0 text-xs text-dim break-words">
                    {event.keys.length ? event.keys.map(k => label(k, piece.key, event.spell?.[k])).join(' · ') : 'Pause'} – Tasten ändern den Akkord
                  </span>
                  {blackKeys.map(k => {
                    const flat = label(k, 0, 'b');
                    const sharp = label(k, 0, '#');
                    const isFlat = label(k, piece.key, event.spell?.[k]) === flat;
                    return (
                      <button
                        key={k} type="button"
                        onClick={() => change(current => setSpelling(current, hand, event.id, k, isFlat ? '#' : 'b'))}
                        className="shrink-0 min-h-7 text-xs text-text underline decoration-accent underline-offset-4"
                      >
                        {isFlat ? flat : sharp} ändern
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-7">
                  <button type="button" aria-label="Nach links" onClick={() => change(c => moveEvent(c, hand, event.id, -1))} className={ICON_BUTTON}><ArrowLeft {...ICON} /></button>
                  <button type="button" aria-label="Nach rechts" onClick={() => change(c => moveEvent(c, hand, event.id, 1))} className={ICON_BUTTON}><ArrowRight {...ICON} /></button>
                  <button type="button" aria-label="Note dahinter einfügen" onClick={insertBehind} className={ICON_BUTTON}><Plus {...ICON} /></button>
                  <button type="button" aria-label="Kopieren" onClick={copyEvent} className={ICON_BUTTON}><Copy {...ICON} /></button>
                  <button type="button" aria-label="Ganzen Takt ans Ende kopieren" onClick={() => change(c => appendBarOf(c, hand, event.id))} className={ICON_BUTTON}><CopyPlus {...ICON} /></button>
                  <button type="button" aria-label="Löschen" onClick={remove} className={cn(ICON_BUTTON, 'text-danger')}><Trash2 {...ICON} /></button>
                  <button type="button" aria-label="Auswahl beenden" onClick={() => setSelected(null)} className={cn(ICON_BUTTON, 'text-text')}><Check {...ICON} /></button>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3">
                <button type="button" disabled={!chord.size} onClick={() => write([...chord])} className={cn(BUTTON, 'min-h-10 px-2')}>
                  {chord.size > 1 ? `Akkord (${chord.size}) eintragen` : 'Eintragen'}
                </button>
                <Chip on={instant} onClick={() => { setInstant(!instant); setChord(new Set()); }}>Sofort</Chip>
                <button type="button" onClick={() => write([])} className="min-h-10 text-xs tracking-wide text-dim">Pause</button>
                <button type="button" aria-label="Letzte Note entfernen" disabled={!piece.hands[hand].length} onClick={() => change(c => removeLast(c, hand))} className={ICON_BUTTON}>
                  <Trash2 {...ICON} />
                </button>
              </div>
            )}
          </div>

          <Keyboard marked={event ? new Set(event.keys) : chord} reveal={event?.keys[0]} keySig={piece.key} onKey={tapKey} className="h-24 sm:h-32" />
        </>
      )}
    </div>
  );
}
