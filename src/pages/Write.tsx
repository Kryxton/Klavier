import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, Plus, Redo2, Settings2, Trash2, Undo2 } from 'lucide-react';
import { BarTools, useBarTool } from '../components/BarTools';
import { Keyboard } from '../components/Keyboard';
import { Sheet } from '../components/Sheet';
import { DotIcon, NoteIcon, TieIcon } from '../components/NoteIcons';
import { BUTTON, Choice, ICON_BUTTON, INPUT, LABEL, SHEET, TEXT_BUTTON, Toggle } from '../components/ui';
import type { Duration, Hand, Piece } from '../types';
import { playKey } from '../utils/audio';
import { cn } from '../utils/cn';
import {
  addEvent, duplicateEvent, insertBehind, moveEvent, removeEvent, removeLast, setLength, setSpelling, setTie, toggleKey,
} from '../utils/edit';
import { KEY_CHOICES, isBlack, label } from '../utils/notes';
import { barCount, barOfEvent, barTicks, halves } from '../utils/score';

const DURATIONS: { id: Duration; name: string }[] = [
  { id: 'w', name: 'Ganze' },
  { id: 'h', name: 'Halbe' },
  { id: 'q', name: 'Viertel' },
  { id: '8', name: 'Achtel' },
  { id: '16', name: 'Sechzehntel' },
  { id: '32', name: 'Zweiunddreißigstel' },
];
const HANDS: { id: Hand; label: string }[] = [
  { id: 'right', label: 'Rechte Hand' },
  { id: 'left', label: 'Linke Hand' },
];
const BEATS = [2, 3, 4, 5, 6, 7, 9, 12];
const BEAT_VALUES = [2, 4, 8];

const ICON = { strokeWidth: 1.75, className: 'w-5 h-5' };

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
  const barTool = useBarTool(piece, change, setFollow);

  const event = piece.hands[hand].find(ev => ev.id === selected) ?? null;
  // Inside a hand a change must not move what stands behind; at its end there is room
  const inside = Boolean(event) && piece.hands[hand][piece.hands[hand].length - 1]?.id !== event?.id;
  const halved = event && halves(event);

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

  const addBehind = () => {
    if (!event) return;
    let id = '';
    change(current => {
      const added = insertBehind(current, hand, event.id);
      id = added.id;
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

  // A note inside a hand leaves a rest and stays selected, so a key fills it right away
  const remove = () => {
    if (event) change(current => removeEvent(current, hand, event.id));
  };

  const toggleBars = () => {
    if (barTool.on) return barTool.close();
    barTool.open(event ? barOfEvent(piece.hands[hand], event.id, barTicks(piece)) : null);
    setSelected(null);
  };

  const shownDur = event?.dur ?? dur;
  const shownDotted = event ? Boolean(event.dotted) : dotted;
  const shownTie = event ? Boolean(event.tie) : tie;
  const blackKeys = event?.keys.filter(isBlack) ?? [];
  const barToggle = (barTool.on || barCount(piece) > 0) && <Toggle on={barTool.on} onClick={toggleBars} className="px-3">Takte</Toggle>;

  return (
    <div className="h-full flex flex-col">
      <header className="shrink-0 flex items-center gap-1 px-4 py-2 md:px-6 text-[17px] md:text-[20px]">
        <input
          aria-label="Titel"
          value={piece.title}
          onChange={e => change(current => ({ ...current, title: e.target.value }))}
          className="flex-1 min-w-0 bg-transparent font-bold tracking-tight text-text outline-none"
        />
        {tools && (
          <>
            <button type="button" aria-label="Rückgängig" disabled={!canUndo} onClick={undo} className={ICON_BUTTON}><Undo2 {...ICON} /></button>
            <button type="button" aria-label="Wiederholen" disabled={!canRedo} onClick={redo} className={ICON_BUTTON}><Redo2 {...ICON} /></button>
          </>
        )}
        <button type="button" aria-label="Einstellungen des Stücks" aria-expanded={settings} onClick={() => setSettings(!settings)} className={cn(ICON_BUTTON, settings && 'text-accent')}><Settings2 {...ICON} /></button>
        <button type="button" onClick={() => { setTools(!tools); setSelected(null); barTool.close(); }} className={TEXT_BUTTON}>
          {tools ? 'Fertig' : 'Korrigieren'}
        </button>
      </header>

      {settings && (
        <div className="slide-up shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 pb-3 md:px-6">
          <label className={cn(LABEL, 'flex flex-col gap-1')}>Takt
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
          <label className={cn(LABEL, 'flex flex-col gap-1')}>Tempo
            <input
              type="number" min={20} max={300} value={piece.bpm}
              onChange={e => change(p => ({ ...p, bpm: Math.max(1, Number(e.target.value) || 1) }))}
              className={INPUT}
            />
          </label>
          <label className={cn(LABEL, 'flex flex-col gap-1 col-span-2')}>Tonart
            <select value={piece.key} onChange={e => change(p => ({ ...p, key: Number(e.target.value) }))} className={INPUT}>
              {KEY_CHOICES.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </label>
        </div>
      )}

      <div data-testid="sheet-box" className="flex-1 min-h-0 overflow-auto md:px-6 md:pb-4">
        <div className={cn(SHEET, 'appear mx-auto max-w-5xl px-1 py-3 sm:px-6 sm:py-6')}>
          <Sheet piece={piece} selected={selected} follow={follow} onSelect={select} bars={barTool.marked} onBar={barTool.on ? barTool.tap : undefined} />
        </div>
      </div>

      {tools && (
        <div className="slide-up shrink-0">
          <div className="mx-auto w-full max-w-3xl space-y-2 px-3 py-2">
            {barTool.on ? <BarTools tool={barTool}>{barToggle}</BarTools> : (
              <>
                <div className="flex items-center gap-2">
                  <Choice className="flex-1 min-w-0" items={HANDS} value={hand} onChange={h => { setHand(h); setSelected(null); setChord(new Set()); }} />
                  {barToggle}
                </div>
                <div className="flex items-center gap-2">
                  <Choice
                    className="flex-1 min-w-0"
                    items={DURATIONS.map(d => ({ id: d.id, name: d.name, label: <NoteIcon duration={d.id} /> }))}
                    value={shownDur}
                    onChange={d => pickLength(d, shownDotted)}
                  />
                  <Toggle on={shownDotted} label="Punktiert" onClick={() => pickLength(shownDur, !shownDotted)} className="w-9 px-0"><DotIcon /></Toggle>
                  <Toggle on={shownTie} label="Mit nächster Note verbinden" onClick={pickTie} className="w-9 px-0"><TieIcon /></Toggle>
                </div>
              </>
            )}

            {barTool.on ? null : event ? (
              <>
                <div className="flex items-center gap-3 min-h-7">
                  <span className="flex-1 min-w-0 text-[13px] text-dim break-words">
                    {event.keys.length
                      ? `${event.keys.map(k => label(k, piece.key, event.spell?.[k])).join(' · ')} – Tasten ändern den Akkord`
                      : inside ? 'Pause – „+“ und Löschen verschieben alles dahinter' : 'Pause – Tasten machen eine Note daraus'}
                  </span>
                  {blackKeys.map(k => {
                    const flat = label(k, 0, 'b');
                    const sharp = label(k, 0, '#');
                    const isFlat = label(k, piece.key, event.spell?.[k]) === flat;
                    return (
                      <button
                        key={k} type="button"
                        onClick={() => change(current => setSpelling(current, hand, event.id, k, isFlat ? '#' : 'b'))}
                        className="shrink-0 min-h-7 text-[13px] font-medium text-accent"
                      >
                        {isFlat ? flat : sharp} ändern
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-6">
                  <button type="button" aria-label="Nach links" onClick={() => change(c => moveEvent(c, hand, event.id, -1))} className={ICON_BUTTON}><ArrowLeft {...ICON} /></button>
                  <button type="button" aria-label="Nach rechts" onClick={() => change(c => moveEvent(c, hand, event.id, 1))} className={ICON_BUTTON}><ArrowRight {...ICON} /></button>
                  <button type="button" aria-label={inside ? 'Teilen' : 'Kopieren'} disabled={inside && !halved} onClick={copyEvent} className={ICON_BUTTON}>
                    {inside ? (halved ?? [event]).map((part, i) => <NoteIcon key={i} duration={part.dur} />) : <Copy {...ICON} />}
                  </button>
                  <button type="button" aria-label="Note dahinter einfügen" disabled={inside && event.keys.length > 0 && !halved} onClick={addBehind} className={ICON_BUTTON}><Plus {...ICON} /></button>
                  <button type="button" aria-label="Löschen" onClick={remove} className={cn(ICON_BUTTON, 'text-danger')}><Trash2 {...ICON} /></button>
                  <button type="button" aria-label="Auswahl beenden" onClick={() => setSelected(null)} className={ICON_BUTTON}><Check {...ICON} /></button>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
                <button type="button" disabled={!chord.size} onClick={() => write([...chord])} className={cn(BUTTON, 'min-h-10 px-2 text-sm')}>
                  {chord.size > 1 ? `Akkord (${chord.size}) eintragen` : 'Eintragen'}
                </button>
                <Toggle on={instant} onClick={() => { setInstant(!instant); setChord(new Set()); }} className="min-h-10">Sofort</Toggle>
                <button type="button" onClick={() => write([])} className="min-h-10 rounded-[11px] bg-track px-3 text-[13px] font-medium text-dim">Pause</button>
                <button type="button" aria-label="Letzte Note entfernen" disabled={!piece.hands[hand].length} onClick={() => change(c => removeLast(c, hand))} className={ICON_BUTTON}>
                  <Trash2 {...ICON} />
                </button>
              </div>
            )}
          </div>

          {!barTool.on && <Keyboard marked={event ? new Set(event.keys) : chord} reveal={event?.keys[0]} keySig={piece.key} onKey={tapKey} className="h-24 sm:h-32" />}
        </div>
      )}
    </div>
  );
}
