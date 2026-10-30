import { describe, expect, it } from 'vitest';
import { addEvent, appendBarOf, duplicateEvent, moveEvent, newPiece, setLength, setSpelling, setTie, toggleKey } from './edit';

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
const keysOf = (piece: ReturnType<typeof newPiece>) => piece.hands.right.map(ev => ev.keys[0]);

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

  it('duplicates with a new id', () => {
    const { piece, ids } = three();
    const copy = duplicateEvent(piece, 'right', ids[1]);
    expect(keysOf(copy.piece)).toEqual([60, 62, 62, 64]);
    expect(copy.id).not.toBe(ids[1]);
  });

  it('appends the whole bar of an event', () => {
    let { piece, ids } = three();
    const last = addEvent(piece, 'right', [65], quarter);
    piece = last.piece;
    const copied = appendBarOf(piece, 'right', ids[1]);
    expect(keysOf(copied)).toEqual([60, 62, 64, 65, 60, 62, 64, 65]);
    expect(new Set(copied.hands.right.map(ev => ev.id)).size).toBe(8);
  });
});
