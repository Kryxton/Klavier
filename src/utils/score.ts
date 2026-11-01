import type { Duration, Ev, Hand, Piece } from '../types';

export const PPQ = 48; // ticks per quarter note

const LENGTHS: Record<Duration, number> = { w: 192, h: 96, q: 48, '8': 24, '16': 12, '32': 6 };
const LONGEST_FIRST: Duration[] = ['w', 'h', 'q', '8', '16', '32'];

export const eventTicks = (ev: Pick<Ev, 'dur' | 'dotted'>) => LENGTHS[ev.dur] * (ev.dotted ? 1.5 : 1);
export const barTicks = (piece: Pick<Piece, 'beats' | 'beatValue'>) => (piece.beats * 192) / piece.beatValue;
export const handTicks = (events: Ev[]) => events.reduce((sum, ev) => sum + eventTicks(ev), 0);

// Note values that add up to `ticks`, longest first
export function splitTicks(ticks: number) {
  const parts: { dur: Duration; dotted: boolean }[] = [];
  let left = ticks;
  while (left >= LENGTHS['32']) {
    const dur = LONGEST_FIRST.find(d => LENGTHS[d] <= left);
    if (!dur) break;
    const dotted = dur !== '32' && LENGTHS[dur] * 1.5 <= left;
    parts.push({ dur, dotted });
    left -= LENGTHS[dur] * (dotted ? 1.5 : 1);
  }
  return parts;
}

// What an event becomes when it is cut in two: two halves, a dotted one its note and its dot.
// Null for the shortest values, nothing shorter can be written.
export function halves({ dur, dotted }: Pick<Ev, 'dur' | 'dotted'>) {
  const half = LONGEST_FIRST[LONGEST_FIRST.indexOf(dur) + 1];
  if (!half) return null;
  return [{ dur: dotted ? dur : half }, { dur: half }];
}

// One printed note. An event that crosses a barline is printed as several, tied together.
export interface Printed {
  ev: Ev;
  dur: Duration;
  dotted: boolean;
  tie: boolean;
  continued: boolean; // a later part of a split event: already sounding, so no sign of its own
  start: number; // tick from the start of the piece
}

// The events of one hand, bar by bar
export function toBars(events: Ev[], ticksPerBar: number): Printed[][] {
  const bars: Printed[][] = [];
  let tick = 0;
  for (const ev of events) {
    let left = eventTicks(ev);
    let continued = false;
    while (left > 0) {
      const bar = Math.floor(tick / ticksPerBar);
      const room = (bar + 1) * ticksPerBar - tick;
      const here = Math.min(left, room);
      const parts = splitTicks(here);
      for (const [i, part] of parts.entries()) {
        const last = here === left && i === parts.length - 1;
        (bars[bar] ??= []).push({
          ev, ...part, start: tick, continued,
          tie: ev.keys.length > 0 && (last ? Boolean(ev.tie) : true),
        });
        tick += eventTicks(part);
        continued = true;
      }
      left -= here;
    }
  }
  return Array.from({ length: bars.length }, (_, i) => bars[i] ?? []);
}

export const barCount = (piece: Piece) =>
  Math.ceil(Math.max(handTicks(piece.hands.right), handTicks(piece.hands.left)) / barTicks(piece));

// One sounding note for playback and the falling notes; tied notes are joined here
export interface Sound {
  midi: number;
  hand: Hand;
  start: number; // tick
  length: number;
  evId: string;
}

// The sounds reaching into a stretch of ticks, without looking at all the others. `sounds` must be
// sorted by start, `longest` is the length of the longest.
export function soundsBetween(sounds: Sound[], from: number, to: number, longest: number) {
  let low = 0;
  let high = sounds.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sounds[middle].start < from - longest) low = middle + 1;
    else high = middle;
  }
  const found: Sound[] = [];
  for (let i = low; i < sounds.length && sounds[i].start <= to; i++) {
    if (sounds[i].start + sounds[i].length > from) found.push(sounds[i]);
  }
  return found;
}

export function timeline(piece: Piece): Sound[] {
  const sounds: Sound[] = [];
  for (const hand of ['right', 'left'] as const) {
    let tick = 0;
    let held = new Map<number, Sound>();
    for (const ev of piece.hands[hand]) {
      const ticks = eventTicks(ev);
      const next = new Map<number, Sound>();
      for (const midi of ev.keys) {
        let sound = held.get(midi);
        if (sound) sound.length += ticks;
        else {
          sound = { midi, hand, start: tick, length: ticks, evId: ev.id };
          sounds.push(sound);
        }
        if (ev.tie) next.set(midi, sound);
      }
      held = next;
      tick += ticks;
    }
  }
  return sounds.sort((a, b) => a.start - b.start || a.midi - b.midi);
}

// The first event that starts in a bar or behind it
export function eventAtBar(events: Ev[], bar: number, ticksPerBar: number) {
  let tick = 0;
  for (const ev of events) {
    if (tick >= bar * ticksPerBar) return ev;
    tick += eventTicks(ev);
  }
  return null;
}

export function barOfEvent(events: Ev[], id: string, ticksPerBar: number) {
  let tick = 0;
  for (const ev of events) {
    if (ev.id === id) return Math.floor(tick / ticksPerBar);
    tick += eventTicks(ev);
  }
  return 0;
}
