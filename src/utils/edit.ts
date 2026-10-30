import type { Accidental, Duration, Ev, Hand, Piece } from '../types';
import { newId } from './ids';
import { barOfEvent, barTicks, eventsOfBar } from './score';

// Plain functions over a piece: each returns a new piece, so every step can be undone

const withHand = (piece: Piece, hand: Hand, events: Ev[]): Piece => ({
  ...piece, hands: { ...piece.hands, [hand]: events },
});

const mapEvent = (piece: Piece, hand: Hand, id: string, change: (ev: Ev) => Ev) =>
  withHand(piece, hand, piece.hands[hand].map(ev => (ev.id === id ? change(ev) : ev)));

export function newPiece(title = 'Neues Stück'): Piece {
  return {
    id: newId('p'), title, beats: 4, beatValue: 4, key: 0, bpm: 80,
    hands: { right: [], left: [] }, updatedAt: new Date().toISOString(),
  };
}

// Added at the end, or right behind the selected event
export function addEvent(
  piece: Piece, hand: Hand, keys: number[],
  length: { dur: Duration; dotted: boolean; tie?: boolean }, after?: string | null,
) {
  const ev: Ev = { id: newId('e'), keys: [...keys].sort((a, b) => a - b), dur: length.dur };
  if (length.dotted) ev.dotted = true;
  if (length.tie && keys.length) ev.tie = true;
  const events = [...piece.hands[hand]];
  const at = after ? events.findIndex(e => e.id === after) : -1;
  events.splice(at < 0 ? events.length : at + 1, 0, ev);
  return { piece: withHand(piece, hand, events), ev };
}

export const removeEvent = (piece: Piece, hand: Hand, id: string) =>
  withHand(piece, hand, piece.hands[hand].filter(ev => ev.id !== id));

export const removeLast = (piece: Piece, hand: Hand) => withHand(piece, hand, piece.hands[hand].slice(0, -1));

export const setLength = (piece: Piece, hand: Hand, id: string, dur: Duration, dotted: boolean) =>
  mapEvent(piece, hand, id, ev => {
    const { dotted: _old, ...rest } = ev;
    return dotted ? { ...rest, dur, dotted: true } : { ...rest, dur };
  });

export const setTie = (piece: Piece, hand: Hand, id: string, tie: boolean) =>
  mapEvent(piece, hand, id, ev => {
    const { tie: _old, ...rest } = ev;
    return tie && ev.keys.length ? { ...rest, tie: true } : rest;
  });

// A tap on the keyboard while an event is selected: the key joins or leaves the chord. A rest
// becomes a note; the last key stays, deleting is its own button.
export const toggleKey = (piece: Piece, hand: Hand, id: string, midi: number) =>
  mapEvent(piece, hand, id, ev => {
    if (!ev.keys.includes(midi)) return { ...ev, keys: [...ev.keys, midi].sort((a, b) => a - b) };
    if (ev.keys.length === 1) return ev;
    const { [midi]: _gone, ...spell } = ev.spell ?? {};
    return { ...ev, keys: ev.keys.filter(k => k !== midi), spell };
  });

// ♯ ↔ ♭ for the black keys of an event
export const setSpelling = (piece: Piece, hand: Hand, id: string, midi: number, accidental: Accidental) =>
  mapEvent(piece, hand, id, ev => ({ ...ev, spell: { ...ev.spell, [midi]: accidental } }));

// One place left or right
export function moveEvent(piece: Piece, hand: Hand, id: string, step: -1 | 1) {
  const events = [...piece.hands[hand]];
  const at = events.findIndex(ev => ev.id === id);
  const to = at + step;
  if (at < 0 || to < 0 || to >= events.length) return piece;
  [events[at], events[to]] = [events[to], events[at]];
  return withHand(piece, hand, events);
}

export function duplicateEvent(piece: Piece, hand: Hand, id: string) {
  const events = [...piece.hands[hand]];
  const at = events.findIndex(ev => ev.id === id);
  if (at < 0) return { piece, id };
  const copy = { ...events[at], id: newId('e'), keys: [...events[at].keys] };
  events.splice(at + 1, 0, copy);
  return { piece: withHand(piece, hand, events), id: copy.id };
}

// The bar an event is in, once more at the end of this hand. Tutorials repeat a lot.
export function appendBarOf(piece: Piece, hand: Hand, id: string) {
  const ticks = barTicks(piece);
  const bar = barOfEvent(piece.hands[hand], id, ticks);
  return withHand(piece, hand, [...piece.hands[hand], ...eventsOfBar(piece.hands[hand], bar, ticks, () => newId('e'))]);
}
