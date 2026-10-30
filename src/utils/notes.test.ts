import { describe, expect, it } from 'vitest';
import { isBlack, keyBox, keySignature, label, signFor, spell } from './notes';

describe('spell', () => {
  it('follows the key signature for black keys', () => {
    expect(spell(70, 0)).toEqual({ letter: 'a', accidental: '#', octave: 4 }); // no key: sharp
    expect(spell(70, -1)).toEqual({ letter: 'b', accidental: 'b', octave: 4 }); // F major: B flat
    expect(spell(70, 2)).toEqual({ letter: 'a', accidental: '#', octave: 4 });
  });

  it('keeps the choice made for one note', () => {
    expect(spell(70, 0, 'b').letter).toBe('b');
    expect(spell(70, -1, '#').letter).toBe('a');
  });

  it('writes the white keys of the far keys with the right letter and octave', () => {
    expect(spell(65, 6)).toEqual({ letter: 'e', accidental: '#', octave: 4 });
    expect(spell(60, 7)).toEqual({ letter: 'b', accidental: '#', octave: 3 });
    expect(spell(59, -6)).toEqual({ letter: 'c', accidental: 'b', octave: 4 });
    expect(spell(64, -7)).toEqual({ letter: 'f', accidental: 'b', octave: 4 });
  });

  it('gets the ends of the keyboard right', () => {
    expect(spell(21, 0)).toEqual({ letter: 'a', accidental: '', octave: 0 });
    expect(spell(108, 0)).toEqual({ letter: 'c', accidental: '', octave: 8 });
  });
});

describe('label', () => {
  it('uses German names', () => {
    expect(label(71)).toBe('H4');
    expect(label(70, -1)).toBe('B4');
    expect(label(61)).toBe('C♯4');
  });
});

describe('signFor', () => {
  it('prints nothing for what the key signature already gives', () => {
    const g = keySignature(1);
    expect(signFor(spell(66, 1), g, new Map())).toBeNull(); // F sharp in G major
  });

  it('prints a natural against the key signature', () => {
    const g = keySignature(1);
    expect(signFor(spell(65, 1), g, new Map())).toBe('n');
  });

  it('prints a sign once per bar and cancels it again', () => {
    const bar = new Map<string, string>();
    expect(signFor(spell(61, 0), {}, bar)).toBe('#');
    expect(signFor(spell(61, 0), {}, bar)).toBeNull();
    expect(signFor(spell(60, 0), {}, bar)).toBe('n');
    expect(signFor(spell(60, 0), {}, bar)).toBeNull();
  });

  it('treats octaves apart', () => {
    const bar = new Map<string, string>();
    expect(signFor(spell(61, 0), {}, bar)).toBe('#');
    expect(signFor(spell(73, 0), {}, bar)).toBe('#');
  });
});

describe('keyBox', () => {
  it('has 52 white keys on the full keyboard, 36 black ones in the gaps', () => {
    const blacks = Array.from({ length: 88 }, (_, i) => 21 + i).filter(isBlack);
    expect(blacks).toHaveLength(36);
    expect(keyBox(21, 21, 108).width).toBeCloseTo(1 / 52);
    expect(keyBox(108, 21, 108).left).toBeCloseTo(51 / 52);
  });

  it('centres a black key on the line between its white neighbours', () => {
    const black = keyBox(61, 60, 72);
    const next = keyBox(62, 60, 72);
    expect(black.left + black.width / 2).toBeCloseTo(next.left);
  });
});
