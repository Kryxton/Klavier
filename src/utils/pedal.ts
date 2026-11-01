import type { Piece } from '../types';
import type { Sound } from './score';

// Major, minor and the dominant seventh, as steps above the root. Other sevenths would swallow real
// changes: Am7 holds both Am and C.
const SHAPES = [[0, 4, 7], [0, 3, 7], [0, 4, 7, 10]];
const CHORDS = SHAPES.flatMap(shape => Array.from({ length: 12 }, (_, root) => new Set(shape.map(step => (root + step) % 12))));
const LEFT_HAND = 1.5; // the left hand carries the harmony, the right the melody
const CHANGE = 2.5; // what lifting the pedal costs, in beats of one note: a passing note doesn't pay for it

export interface Harmony {
  start: number; // tick
  notes: ReadonlySet<number>; // 0 = C … 11 = H
}

// The beat a harmony can change on; in 6/8 and the like three eighths make one
export const harmonyBeat = ({ beats, beatValue }: Pick<Piece, 'beats' | 'beatValue'>) =>
  (192 / beatValue) * (beatValue === 8 && beats % 3 === 0 ? 3 : 1);

// How long each of the twelve notes sounds in each beat
function notesPerBeat(sounds: Sound[], beat: number) {
  const beats: Float32Array[] = [];
  for (const { midi, hand, start, length } of sounds) {
    for (let i = Math.floor(start / beat); i * beat < start + length; i++) {
      const overlap = Math.min(start + length, (i + 1) * beat) - Math.max(start, i * beat);
      (beats[i] ??= new Float32Array(12))[midi % 12] += (overlap / beat) * (hand === 'left' ? LEFT_HAND : 1);
    }
  }
  return Array.from(beats, notes => notes ?? new Float32Array(12));
}

const fit = (notes: Float32Array, chord: ReadonlySet<number>) =>
  notes.reduce((sum, weight, note) => sum + (chord.has(note) ? weight : -weight), 0);

// The harmonies of a piece: the best way through the chords over all beats at once, with a price on
// every change, so that one odd note or wrong note in the reading doesn't lift the pedal
export function harmonies(sounds: Sound[], beat: number): Harmony[] {
  const beats = notesPerBeat(sounds, beat);
  if (!beats.length) return [];
  let best = CHORDS.map(chord => fit(beats[0], chord));
  const cameFrom = beats.map(() => new Uint8Array(CHORDS.length));
  for (let i = 1; i < beats.length; i++) {
    const top = best.reduce((most, score, c) => (score > best[most] ? c : most), 0);
    best = CHORDS.map((chord, c) => {
      const stays = best[c] >= best[top] - CHANGE;
      cameFrom[i][c] = stays ? c : top;
      return fit(beats[i], chord) + (stays ? best[c] : best[top] - CHANGE);
    });
  }
  let chord = best.reduce((most, score, c) => (score > best[most] ? c : most), 0);
  const found: Harmony[] = [];
  for (let i = beats.length - 1; i >= 0; i--) {
    const before = i ? cameFrom[i][chord] : chord;
    if (!i || before !== chord) found.unshift({ start: i * beat, notes: CHORDS[chord] });
    chord = before;
  }
  return found;
}

// `sounds` as they sound with the pedal down: notes of the harmony ring until it changes, or until
// their key is struck again. Notes foreign to it keep their length, on a real piano they would
// blur everything for the rest of the chord.
export function withPedal(sounds: Sound[], harmony: Harmony[]): Sound[] {
  const end = sounds.reduce((last, s) => Math.max(last, s.start + s.length), 0);
  const nextOnKey = new Map<number, number>();
  const held = [...sounds];
  let index = harmony.length - 1;
  for (let i = sounds.length - 1; i >= 0; i--) {
    const sound = sounds[i];
    while (index > 0 && harmony[index].start > sound.start) index--;
    const here = harmony[index];
    if (here?.notes.has(sound.midi % 12)) {
      const until = Math.min(harmony[index + 1]?.start ?? end, nextOnKey.get(sound.midi) ?? end);
      held[i] = { ...sound, length: Math.max(sound.length, until - sound.start) };
    }
    nextOnKey.set(sound.midi, sound.start);
  }
  return held;
}
