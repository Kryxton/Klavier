import { describe, expect, it } from 'vitest';
import { harmonies, harmonyBeat, withPedal } from './pedal';
import type { Sound } from './score';

const BEAT = 48;
const BAR = 192;
const note = (start: number, midi: number, length = BEAT, hand: Sound['hand'] = 'left'): Sound => ({ midi, hand, start, length, evId: `e${start}-${midi}` });
const sorted = (sounds: Sound[]) => sounds.sort((a, b) => a.start - b.start || a.midi - b.midi);

// A broken chord over a bar, one note on each beat
const broken = (bar: number, [a, b, c]: number[]) => [a, c, b, c].map((midi, i) => note(bar * BAR + i * BEAT, midi));
const C = [48, 52, 55];
const F = [53, 57, 60];
const G = [55, 59, 62];

describe('harmonies', () => {
  it('finds where a broken chord changes', () => {
    const sounds = sorted([...broken(0, C), ...broken(1, F), ...broken(2, G), ...broken(3, C)]);
    expect(harmonies(sounds, BEAT).map(h => h.start)).toEqual([0, BAR, 2 * BAR, 3 * BAR]);
  });

  it('joins bars of the same chord', () => {
    const sounds = sorted([...broken(0, C), ...broken(1, C), ...broken(2, F)]);
    expect(harmonies(sounds, BEAT).map(h => h.start)).toEqual([0, 2 * BAR]);
  });

  it('is not moved by a passing note in the melody', () => {
    const melody = [note(0, 72, BEAT, 'right'), note(48, 74, BEAT, 'right'), note(96, 76, BEAT, 'right'), note(144, 79, BEAT, 'right')];
    const sounds = sorted([...broken(0, C), ...melody]);
    expect(harmonies(sounds, BEAT)).toHaveLength(1);
  });

  it('keeps the chord through a rest', () => {
    const sounds = sorted([...broken(0, C), ...broken(2, C)]);
    expect(harmonies(sounds, BEAT)).toHaveLength(1);
  });

  it('knows a chord that lasts one beat', () => {
    const chord = (start: number, keys: number[]) => keys.map(midi => note(start, midi));
    const sounds = sorted([...chord(0, C), ...chord(48, C), ...chord(96, G), ...chord(144, C)]);
    expect(harmonies(sounds, BEAT).map(h => h.start)).toEqual([0, 96, 144]);
  });

  it('has nothing to say about an empty piece', () => {
    expect(harmonies([], BEAT)).toEqual([]);
  });
});

describe('harmonyBeat', () => {
  it('counts quarters, and three eighths in compound time', () => {
    expect(harmonyBeat({ beats: 4, beatValue: 4 })).toBe(48);
    expect(harmonyBeat({ beats: 3, beatValue: 4 })).toBe(48);
    expect(harmonyBeat({ beats: 6, beatValue: 8 })).toBe(72);
    expect(harmonyBeat({ beats: 5, beatValue: 8 })).toBe(24);
  });
});

describe('withPedal', () => {
  const twoChords = [{ start: 0, notes: new Set([0, 4, 7]) }, { start: BAR, notes: new Set([5, 9, 0]) }];

  it('holds notes until the harmony changes', () => {
    const held = withPedal([note(0, 48), note(48, 55), note(BAR, 53)], twoChords);
    expect(held.map(s => s.length)).toEqual([BAR, BAR - 48, 48]);
  });

  it('never makes a note shorter than written', () => {
    expect(withPedal([note(0, 48, 2 * BAR), note(BAR, 53)], twoChords)[0].length).toBe(2 * BAR);
  });

  it('leaves foreign notes alone', () => {
    expect(withPedal([note(0, 50), note(BAR, 53)], twoChords)[0].length).toBe(BEAT);
  });

  it('ends a note where its key is struck again', () => {
    const held = withPedal([note(0, 48), note(96, 48), note(BAR, 53)], twoChords);
    expect(held.map(s => s.length)).toEqual([96, BAR - 96, 48]);
  });

  it('does not reach past the end of the piece', () => {
    const held = withPedal([note(0, 48), note(48, 52)], [twoChords[0]]);
    expect(held.map(s => s.start + s.length)).toEqual([96, 96]);
  });

  it('keeps the order and leaves the written sounds as they are', () => {
    const sounds = [note(0, 48), note(48, 55)];
    const held = withPedal(sounds, [twoChords[0]]);
    expect(held.map(s => s.evId)).toEqual(sounds.map(s => s.evId));
    expect(sounds[0].length).toBe(BEAT);
  });

  it('plays one hand with the harmony of both', () => {
    const left = broken(0, C);
    const right = [note(0, 72, BAR * 2, 'right')];
    const both = sorted([...left, ...broken(1, F), ...right]);
    const held = withPedal(right, harmonies(both, BEAT));
    expect(held[0].length).toBe(BAR * 2);
  });
});
