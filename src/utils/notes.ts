import type { Accidental } from '../types';

export const LOWEST = 21; // A0
export const HIGHEST = 108; // C8
export const MIDDLE_C = 60;

const SHARP_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
const FLAT_NAMES = ['c', 'db', 'd', 'eb', 'e', 'f', 'gb', 'g', 'ab', 'a', 'bb', 'b'];

export const isBlack = (midi: number) => SHARP_NAMES[midi % 12].length > 1;

// Keys with six or seven accidentals also need these spellings for white keys
const WHITE_IN_KEY: Record<number, Record<number, string>> = {
  6: { 5: 'e#' },
  7: { 5: 'e#', 0: 'b#' },
  [-6]: { 11: 'cb' },
  [-7]: { 11: 'cb', 4: 'fb' },
};

export interface Spelled {
  letter: string; // c … b
  accidental: '' | Accidental;
  octave: number;
}

// How a key is written: the event's own choice first, otherwise what fits the key signature
export function spell(midi: number, key: number, own?: Accidental): Spelled {
  const pitchClass = midi % 12;
  const name = own
    ? (own === 'b' ? FLAT_NAMES : SHARP_NAMES)[pitchClass]
    : WHITE_IN_KEY[key]?.[pitchClass] ?? (key < 0 ? FLAT_NAMES : SHARP_NAMES)[pitchClass];
  const letter = name[0];
  let octave = Math.floor(midi / 12) - 1;
  if (name === 'b#') octave -= 1;
  if (name === 'cb') octave += 1;
  return { letter, accidental: (name[1] ?? '') as Spelled['accidental'], octave };
}

// German note names: the white key B is H, and the flat one on that line is just B
export function label(midi: number, key = 0, own?: Accidental) {
  const { letter, accidental, octave } = spell(midi, key, own);
  if (letter === 'b' && accidental === 'b') return `B${octave}`;
  const base = letter === 'b' ? 'H' : letter.toUpperCase();
  return `${base}${accidental === '#' ? '♯' : accidental === 'b' ? '♭' : ''}${octave}`;
}

const SHARP_ORDER = 'fcgdaeb';
const FLAT_ORDER = 'beadgcf';

// letter → the accidental the key signature gives it
export function keySignature(key: number): Record<string, Accidental> {
  const out: Record<string, Accidental> = {};
  if (key > 0) for (const letter of SHARP_ORDER.slice(0, key)) out[letter] = '#';
  if (key < 0) for (const letter of FLAT_ORDER.slice(0, -key)) out[letter] = 'b';
  return out;
}

// The sign to print, given what the key signature and earlier notes of this bar already say.
// `bar` remembers the current sign per line and octave; start it empty for every bar.
export function signFor(note: Spelled, signature: Record<string, Accidental>, bar: Map<string, string>) {
  const line = note.letter + note.octave;
  const current = bar.get(line) ?? signature[note.letter] ?? '';
  if (note.accidental === current) return null;
  bar.set(line, note.accidental);
  return note.accidental || 'n';
}

// VexFlow's name for a key signature
const KEY_NAMES: Record<number, string> = {
  0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', 7: 'C#',
  [-1]: 'F', [-2]: 'Bb', [-3]: 'Eb', [-4]: 'Ab', [-5]: 'Db', [-6]: 'Gb', [-7]: 'Cb',
};
export const keyName = (key: number) => KEY_NAMES[key];

export const KEY_CHOICES: { id: number; label: string }[] = [
  { id: 0, label: 'C-Dur / a-Moll' },
  { id: 1, label: 'G-Dur / e-Moll (1♯)' },
  { id: 2, label: 'D-Dur / h-Moll (2♯)' },
  { id: 3, label: 'A-Dur / fis-Moll (3♯)' },
  { id: 4, label: 'E-Dur / cis-Moll (4♯)' },
  { id: 5, label: 'H-Dur / gis-Moll (5♯)' },
  { id: 6, label: 'Fis-Dur / dis-Moll (6♯)' },
  { id: 7, label: 'Cis-Dur / ais-Moll (7♯)' },
  { id: -1, label: 'F-Dur / d-Moll (1♭)' },
  { id: -2, label: 'B-Dur / g-Moll (2♭)' },
  { id: -3, label: 'Es-Dur / c-Moll (3♭)' },
  { id: -4, label: 'As-Dur / f-Moll (4♭)' },
  { id: -5, label: 'Des-Dur / b-Moll (5♭)' },
  { id: -6, label: 'Ges-Dur / es-Moll (6♭)' },
  { id: -7, label: 'Ces-Dur / as-Moll (7♭)' },
];

// Position of a key on a keyboard from `low` to `high`, as a share of its width. Shared by the
// keyboard and the falling notes, so the bars land exactly on their keys.
const whitesBelow = (midi: number) => {
  let count = 0;
  for (let m = LOWEST; m < midi; m++) if (!isBlack(m)) count++;
  return count;
};

export function keyBox(midi: number, low: number, high: number) {
  const whites = whitesBelow(high + 1) - whitesBelow(low);
  const unit = 1 / whites;
  const index = whitesBelow(midi) - whitesBelow(low);
  if (!isBlack(midi)) return { left: index * unit, width: unit };
  const width = unit * 0.62;
  return { left: index * unit - width / 2, width };
}
