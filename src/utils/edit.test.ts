import { describe, expect, it } from 'vitest';
import type { Ev, Piece } from '../types';
import {
  addEvent, duplicateEvent, endBar, insertBars, insertBehind, moveEvent, newPiece, removeBars, removeEvent, replaceBars,
  setLength, setSpelling, setTie, splitEvent, toggleKey,
} from './edit';
import { barCount, eventTicks, handTicks, timeline } from './score';

const quarter = { dur: 'q', dotted: false } as const;
const three = () => {
  let piece = newPiece();
  const ids: string[] = [];
  for (const midi of [60, 62, 64]) {
    const added = addEvent(piece, 'right', [midi], quarter);
    piece = added.piece;
    ids.push(added.ev.id);
  }
  return { piece, ids };
};
const keysOf = (piece: Piece) => piece.hands.right.map(ev => ev.keys[0]);

// Written compactly: 'C4:q' style would hide the ticks, so a hand is [midi or 0 for a rest, ticks]
const written = (events: Ev[]) => events.map(ev => [ev.keys[0] ?? 0, eventTicks(ev)]);
const startOf = (events: Ev[], id: string) => {
  let tick = 0;
  for (const ev of events) {
    if (ev.id === id) return tick;
    tick += eventTicks(ev);
  }
  return -1;
};

// Four bars of four quarters; each hand counts upwards from its own first key
const fourBars = (bars = 4) => {
  const piece = newPiece();
  const hand = (first: number) => Array.from({ length: bars * 4 }, (_, i) => ({ id: `${first}-${i}`, keys: [first + i], dur: 'q' as const }));
  return { ...piece, hands: { right: hand(60), left: hand(36) } };
};
const firstKeys = (events: Ev[], bar: number) => events.slice(bar * 4, bar * 4 + 4).map(ev => ev.keys[0] ?? 0);

describe('addEvent', () => {
  it('sorts a chord and appends it', () => {
    const { piece } = addEvent(newPiece(), 'left', [64, 60], quarter);
    expect(piece.hands.left[0].keys).toEqual([60, 64]);
    expect(piece.hands.right).toEqual([]);
  });

  it('inserts behind the selected event', () => {
    const { piece, ids } = three();
    expect(keysOf(addEvent(piece, 'right', [70], quarter, ids[0]).piece)).toEqual([60, 70, 62, 64]);
  });

  it('never ties a rest', () => {
    expect(addEvent(newPiece(), 'right', [], { ...quarter, tie: true }).ev.tie).toBeUndefined();
  });
});

describe('changing an event', () => {
  it('sets and clears dots and ties', () => {
    const { piece, ids } = three();
    const dotted = setLength(piece, 'right', ids[0], 'h', true);
    expect(dotted.hands.right[0]).toMatchObject({ dur: 'h', dotted: true });
    expect(setLength(dotted, 'right', ids[0], 'q', false).hands.right[0].dotted).toBeUndefined();
    expect(setTie(setTie(piece, 'right', ids[0], true), 'right', ids[0], false).hands.right[0].tie).toBeUndefined();
  });

  it('toggles keys of a chord but keeps the last one', () => {
    const { piece, ids } = three();
    const chord = toggleKey(piece, 'right', ids[0], 67);
    expect(chord.hands.right[0].keys).toEqual([60, 67]);
    const back = toggleKey(chord, 'right', ids[0], 67);
    expect(back.hands.right[0].keys).toEqual([60]);
    expect(toggleKey(back, 'right', ids[0], 60).hands.right[0].keys).toEqual([60]);
  });

  it('forgets the spelling of a key that left the chord', () => {
    const { piece, ids } = three();
    let changed = toggleKey(piece, 'right', ids[0], 61);
    changed = setSpelling(changed, 'right', ids[0], 61, 'b');
    expect(changed.hands.right[0].spell).toEqual({ 61: 'b' });
    expect(toggleKey(changed, 'right', ids[0], 61).hands.right[0].spell).toEqual({});
  });
});

describe('moving and copying', () => {
  it('moves an event and stops at the ends', () => {
    const { piece, ids } = three();
    expect(keysOf(moveEvent(piece, 'right', ids[1], -1))).toEqual([62, 60, 64]);
    expect(moveEvent(piece, 'right', ids[0], -1)).toBe(piece);
  });

  it('copies the last note in full, with a new id', () => {
    const { piece, ids } = three();
    const copy = duplicateEvent(piece, 'right', ids[2]);
    expect(written(copy.piece.hands.right)).toEqual([[60, 48], [62, 48], [64, 48], [64, 48]]);
    expect(copy.id).not.toBe(ids[2]);
  });

  it('copies a note inside a hand into its own time', () => {
    const { piece, ids } = three();
    const copy = duplicateEvent(piece, 'right', ids[1]);
    expect(written(copy.piece.hands.right)).toEqual([[60, 48], [62, 24], [62, 24], [64, 48]]);
  });
});

describe('changing a note in the middle', () => {
  const later = ({ hands }: Piece, id: string) => startOf(hands.right, id);

  it('splits a quarter into two eighths and moves nothing', () => {
    const { piece, ids } = three();
    const split = splitEvent(piece, 'right', ids[1]);
    expect(written(split.piece.hands.right)).toEqual([[60, 48], [62, 24], [62, 24], [64, 48]]);
    expect(later(split.piece, ids[2])).toBe(96);
    expect(split.id).not.toBe(ids[1]);
  });

  it('splits a dotted note into the note and its dot', () => {
    const { piece, ids } = three();
    const dotted = setLength(piece, 'right', ids[2], 'q', true);
    const split = splitEvent(dotted, 'right', ids[2]);
    expect(written(split.piece.hands.right)).toEqual([[60, 48], [62, 48], [64, 48], [64, 24]]);
  });

  it('leaves the shortest note whole', () => {
    const { piece, ids } = three();
    const short = setLength(piece, 'right', ids[0], '32', false);
    expect(splitEvent(short, 'right', ids[0]).piece).toBe(short);
    expect(insertBehind(short, 'right', ids[0]).piece).toBe(short);
  });

  it('keeps a tie on the second part only and both parts sound', () => {
    const { piece, ids } = three();
    const tied = setTie(piece, 'right', ids[1], true);
    const { hands } = splitEvent(tied, 'right', ids[1]).piece;
    expect(hands.right[1].tie).toBeUndefined();
    expect(hands.right[2].tie).toBe(true);
    expect(timeline({ ...piece, hands }).filter(s => s.midi === 62)).toHaveLength(2);
  });

  it('fills the gap of a shorter note with a rest', () => {
    const { piece, ids } = three();
    const shorter = setLength(piece, 'right', ids[0], '8', false);
    expect(written(shorter.hands.right)).toEqual([[60, 24], [0, 24], [62, 48], [64, 48]]);
    expect(later(shorter, ids[1])).toBe(48);
  });

  it('gets the rest back when the note grows again', () => {
    const { piece, ids } = three();
    const shorter = setLength(piece, 'right', ids[0], '16', false);
    expect(written(setLength(shorter, 'right', ids[0], 'q', false).hands.right)).toEqual([[60, 48], [62, 48], [64, 48]]);
  });

  it('takes the time of a longer note from what follows', () => {
    const { piece, ids } = three();
    const longer = setLength(piece, 'right', ids[0], 'q', true);
    expect(written(longer.hands.right)).toEqual([[60, 72], [62, 24], [64, 48]]);
    expect(later(longer, ids[2])).toBe(96);
    expect(written(setLength(piece, 'right', ids[0], 'h', false).hands.right)).toEqual([[60, 96], [64, 48]]);
  });

  it('ties a leftover that one note value cannot say', () => {
    const piece = newPiece();
    const hands = { right: [{ id: 'a', keys: [60], dur: 'q' as const }, { id: 'b', keys: [62], dur: 'w' as const }], left: [] };
    const longer = setLength({ ...piece, hands }, 'right', 'a', 'q', true);
    expect(written(longer.hands.right)).toEqual([[60, 72], [62, 144], [62, 24]]);
    expect(longer.hands.right[1].tie).toBe(true);
    expect(longer.hands.right[2].tie).toBeUndefined();
    expect(handTicks(longer.hands.right)).toBe(240);
  });

  it('never moves the end of a hand when a length changes inside it', () => {
    const { piece, ids } = three();
    for (const [dur, dotted] of [['8', false], ['16', true], ['q', true], ['h', false]] as const) {
      expect(handTicks(setLength(piece, 'right', ids[0], dur, dotted).hands.right)).toBe(144);
    }
  });

  it('changes the last note freely', () => {
    const { piece, ids } = three();
    expect(written(setLength(piece, 'right', ids[2], '8', false).hands.right)).toEqual([[60, 48], [62, 48], [64, 24]]);
    expect(written(setLength(piece, 'right', ids[2], 'h', false).hands.right)).toEqual([[60, 48], [62, 48], [64, 96]]);
  });

  it('turns a deleted note into a rest, and deleting the rest closes the gap', () => {
    const { piece, ids } = three();
    const silent = removeEvent(piece, 'right', ids[1]);
    expect(written(silent.hands.right)).toEqual([[60, 48], [0, 48], [64, 48]]);
    expect(later(silent, ids[2])).toBe(96);
    expect(silent.hands.right[1].id).toBe(ids[1]);
    expect(written(removeEvent(silent, 'right', ids[1]).hands.right)).toEqual([[60, 48], [64, 48]]);
  });

  it('removes the last note', () => {
    const { piece, ids } = three();
    expect(written(removeEvent(piece, 'right', ids[2]).hands.right)).toEqual([[60, 48], [62, 48]]);
  });

  it('makes room behind a note out of that note', () => {
    const { piece, ids } = three();
    const room = insertBehind(piece, 'right', ids[0]);
    expect(written(room.piece.hands.right)).toEqual([[60, 24], [0, 24], [62, 48], [64, 48]]);
    expect(room.piece.hands.right[1].id).toBe(room.id);
    expect(toggleKey(room.piece, 'right', room.id, 61).hands.right[1].keys).toEqual([61]);
  });

  it('adds room at the end of a hand', () => {
    const { piece, ids } = three();
    expect(written(insertBehind(piece, 'right', ids[2]).piece.hands.right)).toEqual([[60, 48], [62, 48], [64, 48], [0, 48]]);
  });

  it('moves a hand on behind a rest', () => {
    const { piece, ids } = three();
    const silent = removeEvent(piece, 'right', ids[1]);
    const moved = insertBehind(silent, 'right', ids[1]).piece;
    expect(written(moved.hands.right)).toEqual([[60, 48], [0, 48], [0, 48], [64, 48]]);
  });
});

describe('copying bars', () => {
  it('inserts a run of bars of both hands, and all behind moves back together', () => {
    const piece = fourBars();
    const copied = insertBars(piece, { from: 0, to: 1, hands: 'both' }, 2);
    expect(barCount(copied)).toBe(6);
    expect(firstKeys(copied.hands.right, 2)).toEqual(firstKeys(piece.hands.right, 0));
    expect(firstKeys(copied.hands.left, 3)).toEqual(firstKeys(piece.hands.left, 1));
    expect(firstKeys(copied.hands.right, 4)).toEqual(firstKeys(piece.hands.right, 2));
    expect(firstKeys(copied.hands.left, 5)).toEqual(firstKeys(piece.hands.left, 3));
  });

  it('gives copies new ids', () => {
    const copied = insertBars(fourBars(), { from: 0, to: 3, hands: 'both' }, 4);
    expect(new Set(copied.hands.right.map(ev => ev.id)).size).toBe(32);
  });

  it('inserts one hand and leaves rests in the other, so they stay together', () => {
    const piece = fourBars();
    const copied = insertBars(piece, { from: 0, to: 0, hands: 'left' }, 1);
    expect(firstKeys(copied.hands.left, 1)).toEqual(firstKeys(piece.hands.left, 0));
    expect(written(copied.hands.right.slice(4, 5))).toEqual([[0, 192]]);
    expect(copied.hands.right[5].keys).toEqual(piece.hands.right[4].keys);
    expect(handTicks(copied.hands.right)).toBe(handTicks(copied.hands.left));
  });

  it('writes one hand over bars and the other hand stays', () => {
    const piece = fourBars();
    const copied = replaceBars(piece, { from: 0, to: 1, hands: 'left' }, 2);
    expect(firstKeys(copied.hands.left, 2)).toEqual(firstKeys(piece.hands.left, 0));
    expect(firstKeys(copied.hands.left, 3)).toEqual(firstKeys(piece.hands.left, 1));
    expect(copied.hands.right).toBe(piece.hands.right);
    expect(handTicks(copied.hands.left)).toBe(handTicks(piece.hands.left));
  });

  it('copies over its own bars without a mix-up', () => {
    const piece = fourBars();
    const copied = replaceBars(piece, { from: 0, to: 1, hands: 'right' }, 1);
    expect(firstKeys(copied.hands.right, 0)).toEqual(firstKeys(piece.hands.right, 0));
    expect(firstKeys(copied.hands.right, 1)).toEqual(firstKeys(piece.hands.right, 0));
    expect(firstKeys(copied.hands.right, 2)).toEqual(firstKeys(piece.hands.right, 1));
    expect(firstKeys(copied.hands.right, 3)).toEqual(firstKeys(piece.hands.right, 3));
  });

  it('goes behind the longer hand when both hands are copied to the end', () => {
    const piece = removeBars(fourBars(), { from: 2, to: 3, hands: 'left' });
    expect(handTicks(piece.hands.left)).toBe(384);
    const copied = replaceBars(piece, { from: 0, to: 0, hands: 'both' }, endBar(piece, 'both'));
    expect(barCount(copied)).toBe(5);
    expect(firstKeys(copied.hands.right, 4)).toEqual(firstKeys(piece.hands.right, 0));
    expect(handTicks(copied.hands.left.slice(0, 10))).toBe(768);
    expect(copied.hands.left[10].keys).toEqual([36]);
  });

  it('goes behind its own hand when one hand is copied to the end', () => {
    const piece = removeBars(fourBars(), { from: 2, to: 3, hands: 'left' });
    expect(endBar(piece, 'left')).toBe(2);
    const copied = replaceBars(piece, { from: 0, to: 1, hands: 'left' }, endBar(piece, 'left'));
    expect(firstKeys(copied.hands.left, 2)).toEqual(firstKeys(piece.hands.left, 0));
    expect(handTicks(copied.hands.left)).toBe(handTicks(copied.hands.right));
  });

  it('splits a note that crosses the edge of the bars', () => {
    const base = newPiece();
    const right: Ev[] = [
      { id: 'a', keys: [60], dur: 'h', dotted: true }, { id: 'b', keys: [62], dur: 'h' }, { id: 'c', keys: [64], dur: 'h', dotted: true },
    ];
    const piece = { ...base, hands: { right, left: [] } };
    // Bar 2 starts with the second half of b, and the original stays whole
    const behind = insertBars(piece, { from: 1, to: 1, hands: 'right' }, 2);
    expect(written(behind.hands.right)).toEqual([[60, 144], [62, 96], [64, 144], [62, 48], [64, 144]]);
    // Inserted across b: it comes apart around the copy, which ends silent, not tied into b
    const across = insertBars(piece, { from: 0, to: 0, hands: 'right' }, 1);
    expect(written(across.hands.right)).toEqual([[60, 144], [62, 48], [60, 144], [62, 48], [62, 48], [64, 144]]);
    expect(across.hands.right.every(ev => !ev.tie)).toBe(true);
  });

  it('removes bars of both hands, and all behind moves up', () => {
    const piece = fourBars();
    const removed = removeBars(piece, { from: 1, to: 2, hands: 'both' });
    expect(barCount(removed)).toBe(2);
    expect(firstKeys(removed.hands.left, 1)).toEqual(firstKeys(piece.hands.left, 3));
  });

  it('silences one hand without moving it', () => {
    const piece = fourBars();
    const removed = removeBars(piece, { from: 1, to: 1, hands: 'right' });
    expect(handTicks(removed.hands.right)).toBe(handTicks(piece.hands.right));
    expect(removed.hands.left).toBe(piece.hands.left);
    expect(written(removed.hands.right.slice(4, 5))).toEqual([[0, 192]]);
  });
});
