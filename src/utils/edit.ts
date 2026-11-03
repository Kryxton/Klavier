import type { Accidental, Duration, Ev, Hand, Hands, Piece } from '../types';
import { newId } from './ids';
import { barCount, barTicks, eventTicks, halves, handTicks, splitTicks } from './score';

// Plain functions over a piece: each returns a new piece, so every step can be undone.
// Changing a note keeps the time: what stands behind it stays in its place, and with it the bars
// and the other hand. Only the end of a hand grows and shrinks freely.

const HANDS: Hand[] = ['right', 'left'];

const withHand = (piece: Piece, hand: Hand, events: Ev[]): Piece => ({
  ...piece, hands: { ...piece.hands, [hand]: events },
});

const mapEvent = (piece: Piece, hand: Hand, id: string, change: (ev: Ev) => Ev) =>
  withHand(piece, hand, piece.hands[hand].map(ev => (ev.id === id ? change(ev) : ev)));

const lengthOf = ({ dur, dotted }: { dur: Duration; dotted?: boolean }) => (dotted ? { dur, dotted } : { dur });

const restsFor = (ticks: number): Ev[] => splitTicks(ticks).map(part => ({ id: newId('e'), keys: [], ...lengthOf(part) }));

const asRest = ({ id, dur, dotted }: Ev): Ev => ({ id, keys: [], ...lengthOf({ dur, dotted }) });

// An event made to last `ticks`, in tied parts where one note value can't say it
function lasting({ dur: _dur, dotted: _dotted, tie, ...ev }: Ev, ticks: number): Ev[] {
  const parts = splitTicks(ticks);
  return parts.map((part, i) => {
    const tied = ev.keys.length > 0 && (i < parts.length - 1 || tie);
    return { ...ev, id: i ? newId('e') : ev.id, keys: [...ev.keys], ...lengthOf(part), ...(tied ? { tie: true } : {}) };
  });
}

export function newPiece(title?: string): Piece {
  return {
    id: newId('p'), title: title || 'Neues Stück', beats: 4, beatValue: 4, key: 0, bpm: 80,
    hands: { right: [], left: [] }, updatedAt: new Date().toISOString(),
  };
}

export const titleOf = (piece: Pick<Piece, 'title'>) => piece.title || 'Ohne Titel';

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

// A note inside a hand leaves a rest. A rest goes for good and what stands behind moves up: that
// is how a gap in one hand is closed.
export function removeEvent(piece: Piece, hand: Hand, id: string) {
  const events = piece.hands[hand];
  const at = events.findIndex(ev => ev.id === id);
  if (at >= 0 && at < events.length - 1 && events[at].keys.length) return mapEvent(piece, hand, id, asRest);
  return withHand(piece, hand, events.filter(ev => ev.id !== id));
}

export const removeLast = (piece: Piece, hand: Hand) => withHand(piece, hand, piece.hands[hand].slice(0, -1));

// What follows a note that grew by `ticks`: it gets covered from the front, and a note covered only
// in part sounds on for the time it has left
function covered(events: Ev[], ticks: number) {
  let left = ticks;
  for (const [i, ev] of events.entries()) {
    const own = eventTicks(ev);
    if (own > left) return [...lasting(ev, own - left), ...events.slice(i + 1)];
    left -= own;
  }
  return [];
}

// A shorter note leaves a rest behind it, a longer one takes its time from what follows
export function setLength(piece: Piece, hand: Hand, id: string, dur: Duration, dotted: boolean) {
  const events = piece.hands[hand];
  const at = events.findIndex(ev => ev.id === id);
  if (at < 0) return piece;
  const { dotted: _old, ...rest } = events[at];
  const next: Ev = { ...rest, ...lengthOf({ dur, dotted }) };
  const behind = events.slice(at + 1);
  const grown = eventTicks(next) - eventTicks(events[at]);
  if (!behind.length || !grown) return withHand(piece, hand, [...events.slice(0, at), next, ...behind]);
  return withHand(piece, hand, [...events.slice(0, at), next, ...(grown < 0 ? [...restsFor(-grown), ...behind] : covered(behind, grown))]);
}

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

// Two notes in the time of one; `id` is the new, second one
export function splitEvent(piece: Piece, hand: Hand, id: string) {
  const events = [...piece.hands[hand]];
  const at = events.findIndex(ev => ev.id === id);
  const parts = at < 0 ? null : halves(events[at]);
  if (!parts) return { piece, id };
  const { dotted: _dotted, tie, ...ev } = events[at];
  const second: Ev = { ...ev, id: newId('e'), keys: [...ev.keys], ...lengthOf(parts[1]), ...(tie ? { tie } : {}) };
  events.splice(at, 1, { ...ev, ...lengthOf(parts[0]) }, second);
  return { piece: withHand(piece, hand, events), id: second.id };
}

// The same event once more: in full at the end of a hand, where there is room; inside a hand it
// shares the time of the event
export function duplicateEvent(piece: Piece, hand: Hand, id: string) {
  const events = [...piece.hands[hand]];
  const at = events.findIndex(ev => ev.id === id);
  if (at < 0) return { piece, id };
  if (at < events.length - 1) return splitEvent(piece, hand, id);
  const copy = { ...events[at], id: newId('e'), keys: [...events[at].keys] };
  events.push(copy);
  return { piece: withHand(piece, hand, events), id: copy.id };
}

// Room behind an event, as a rest to fill. Behind a note inside a hand it comes out of that note,
// so nothing moves. Behind a rest inside a hand it is new time: that is how a hand is moved on.
export function insertBehind(piece: Piece, hand: Hand, id: string) {
  const events = piece.hands[hand];
  const at = events.findIndex(ev => ev.id === id);
  if (at < 0) return { piece, id };
  if (at < events.length - 1 && events[at].keys.length) {
    const split = splitEvent(piece, hand, id);
    return split.piece === piece ? split : { piece: mapEvent(split.piece, hand, split.id, asRest), id: split.id };
  }
  const added = addEvent(piece, hand, [], { dur: events[at].dur, dotted: Boolean(events[at].dotted) }, id);
  return { piece: added.piece, id: added.ev.id };
}

// Whole bars, `to` is the last one
export interface Bars { from: number; to: number; hands: Hands }

const chosen = (hands: Hands) => (hands === 'both' ? HANDS : [hands]);

const silentBars = (count: number, ticks: number) => Array.from({ length: count }, () => restsFor(ticks)).flat();

const untied = (events: Ev[]) => events.map((ev, i) => {
  if (i < events.length - 1 || !ev.tie) return ev;
  const { tie: _tie, ...rest } = ev;
  return rest;
});

// A hand in two at a tick. A note across the cut becomes two, a hand too short is filled up with
// rests, and nothing stays tied across the cut.
function cutAt(events: Ev[], tick: number): [Ev[], Ev[]] {
  let start = 0;
  for (const [i, ev] of events.entries()) {
    const end = start + eventTicks(ev);
    if (end > tick) {
      if (start === tick) return [untied(events.slice(0, i)), events.slice(i)];
      return [
        untied([...events.slice(0, i), ...lasting(ev, tick - start)]),
        [...lasting({ ...ev, id: newId('e') }, end - tick), ...events.slice(i + 1)],
      ];
    }
    start = end;
  }
  return [[...untied(events), ...restsFor(tick - start)], []];
}

const spliced = (events: Ev[], from: number, to: number, inside: Ev[]) =>
  [...cutAt(events, from)[0], ...inside, ...cutAt(events, to)[1]];

// A stretch of a hand as new events, always exactly that long
const copyOf = (events: Ev[], from: number, to: number) =>
  cutAt(cutAt(events, from)[1], to - from)[0].map(ev => ({ ...ev, id: newId('e'), keys: [...ev.keys] }));

// A copy of the bars begins at bar `at` and everything from there on moves back, in both hands, so
// they stay together. A hand that isn't copied gets rests there.
export function insertBars(piece: Piece, { from, to, hands }: Bars, at: number) {
  const ticks = barTicks(piece);
  const start = at * ticks;
  return HANDS.reduce((next, hand) => {
    const events = piece.hands[hand];
    if (chosen(hands).includes(hand)) return withHand(next, hand, spliced(events, start, start, copyOf(events, from * ticks, (to + 1) * ticks)));
    if (handTicks(events) <= start) return next;
    return withHand(next, hand, spliced(events, start, start, silentBars(to - from + 1, ticks)));
  }, piece);
}

// A copy of the bars is written over what stands from bar `at` on, nothing else moves
export function replaceBars(piece: Piece, { from, to, hands }: Bars, at: number) {
  const ticks = barTicks(piece);
  const start = at * ticks;
  return chosen(hands).reduce((next, hand) => {
    const events = piece.hands[hand];
    return withHand(next, hand, spliced(events, start, start + (to - from + 1) * ticks, copyOf(events, from * ticks, (to + 1) * ticks)));
  }, piece);
}

// Where bars added at the end begin: behind the longer hand when both are copied, so they stay
// together, otherwise behind the hand itself
export const endBar = (piece: Piece, hands: Hands) =>
  (hands === 'both' ? barCount(piece) : Math.ceil(handTicks(piece.hands[hands]) / barTicks(piece)));

// Both hands: the bars go and what stands behind moves up. One hand alone falls silent there,
// moving up would pull it away from the other.
export function removeBars(piece: Piece, { from, to, hands }: Bars) {
  const ticks = barTicks(piece);
  const start = from * ticks;
  const end = (to + 1) * ticks;
  return chosen(hands).reduce((next, hand) => {
    const events = piece.hands[hand];
    if (handTicks(events) <= start) return next;
    const silence = hands === 'both' || handTicks(events) <= end ? [] : silentBars(to - from + 1, ticks);
    return withHand(next, hand, spliced(events, start, end, silence));
  }, piece);
}
