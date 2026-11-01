import { describe, expect, it } from 'vitest';
import { RATE, judge } from './sound';
import type { Detected } from './tracker';

const LAG = 0.3;

const note = (midi: number, start: number, end = start + 0.3): Detected => ({ midi, start, end, hand: midi >= 60 ? 'right' : 'left' });

// Something like a piano: overtones that die away. Sounds LAG after the picture shows the note.
function play(notes: Detected[], seconds: number) {
  const samples = new Float32Array(Math.round(seconds * RATE));
  for (const { midi, start } of notes) {
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    const first = Math.round((start + LAG) * RATE);
    for (let i = 0; i < 1.5 * RATE && first + i < samples.length; i++) {
      const time = i / RATE;
      for (let h = 1; h <= 6; h++) {
        if (frequency * h < RATE / 2) samples[first + i] += (Math.sin(2 * Math.PI * frequency * h * time) / h ** 1.5) * Math.exp(-3 * time);
      }
    }
  }
  return samples.map(s => s * 0.1);
}

// A tune long enough to learn the keys from
const SCALE = [60, 62, 64, 65, 67, 69, 71, 72];
const tune = Array.from({ length: 48 }, (_, i) => [
  note(SCALE[(i * 3) % 8], 1 + i * 0.5),
  ...(i % 4 === 0 ? [note(48 + (i % 8 ? 7 : 0), 1 + i * 0.5, 1 + i * 0.5 + 1.5)] : []),
]).flat();
const SECONDS = 27;

describe('judge', () => {
  it('finds the delay between picture and sound and agrees with right notes', async () => {
    const result = await judge(tune, [], play(tune, SECONDS));
    expect(result?.hearing.lag).toBeCloseTo(LAG, 0);
    expect(result?.notes).toHaveLength(tune.length);
    expect(result?.hearing.heard).toBeGreaterThan(tune.length * 0.7);
  }, 30000);

  it('moves a note to the neighbouring key that really sounds', async () => {
    const samples = play(tune, SECONDS);
    const wrong = tune.findIndex((n, i) => i > 20 && n.midi === 69);
    const read = tune.map((n, i) => (i === wrong ? { ...n, midi: 70 } : n));
    const result = await judge(read, [], samples);
    expect(result?.hearing.moved).toBe(1);
    expect(result?.notes.some(n => n.start === tune[wrong].start && n.midi === 69)).toBe(true);
    expect(result?.notes.some(n => n.midi === 70)).toBe(false);
  }, 30000);

  it('leaves a silent note that fits the key: overtones can pose as its neighbour', async () => {
    const samples = play(tune, SECONDS);
    const wrong = tune.findIndex((n, i) => i > 20 && n.midi === 69);
    const read = tune.map((n, i) => (i === wrong ? { ...n, midi: 71 } : n));
    const result = await judge(read, [], samples);
    expect(result?.hearing.moved).toBe(0);
    expect(result?.notes.some(n => n.start === tune[wrong].start && n.midi === 71)).toBe(true);
  }, 30000);

  it('takes a doubtful bar that sounds, and leaves one that does not', async () => {
    const missing = tune[30];
    const read = tune.filter(n => n !== missing);
    const spark = note(83, 12.25, 12.4);
    const result = await judge(read, [missing, spark], play(tune, SECONDS));
    expect(result?.hearing.added).toBe(1);
    expect(result?.notes.some(n => n.start === missing.start && n.midi === missing.midi)).toBe(true);
    expect(result?.notes.some(n => n.midi === 83)).toBe(false);
  }, 30000);

  it('takes away a flicker with nothing behind it', async () => {
    const flicker = note(74, 14.25, 14.3);
    const result = await judge([...tune, flicker], [], play(tune, SECONDS));
    expect(result?.hearing.dropped).toBe(1);
    expect(result?.notes.some(n => n.midi === 74)).toBe(false);
  }, 30000);

  it('keeps a solid bar it cannot hear', async () => {
    const quiet = note(79, 14.25, 14.75);
    const result = await judge([...tune, quiet], [], play(tune, SECONDS));
    expect(result?.notes.some(n => n.start === quiet.start && n.midi === 79)).toBe(true);
  }, 30000);

  it('steps back when the sound has nothing to do with the notes', async () => {
    let seed = 3;
    const noise = new Float32Array(SECONDS * RATE).map(() => {
      seed = (seed * 16807) % 2147483647;
      return (seed / 2147483647 - 0.5) * 0.1;
    });
    expect(await judge(tune, [], noise)).toBeNull();
    expect(await judge(tune, [], new Float32Array(SECONDS * RATE))).toBeNull();
  }, 30000);
});
