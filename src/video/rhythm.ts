import type { Ev, Hand, Piece } from '../types';
import { newId } from '../utils/ids';
import { PPQ, splitTicks } from '../utils/score';
import type { Detected } from './tracker';

const GRID = PPQ / 4; // everything lands on sixteenths
const MIN_BPM = 45;
const MAX_BPM = 200;
const FIT = 0.16; // mean distance from the grid, in grid steps; a random note lands at 0.29

// How well onsets fit a grid of sixteenths, as a share of one step
function gridError(onsets: number[], bpm: number) {
  const step = 60 / bpm / 4;
  let sum = 0;
  for (const t of onsets) {
    const position = (t - onsets[0]) / step;
    sum += Math.abs(position - Math.round(position));
  }
  return sum / onsets.length;
}

// The beat: the tempo around 100 that still puts every note on the grid. Slower ones would make
// the sixteenths too coarse, doubled ones just look busy.
export function findTempo(onsets: number[]) {
  if (onsets.length < 2) return { bpm: 100, sure: false };
  const candidates: { bpm: number; error: number }[] = [];
  for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm += 0.1) candidates.push({ bpm, error: gridError(onsets, bpm) });

  const good = candidates.filter(c => c.error < FIT);
  if (!good.length) {
    const fallback = candidates.filter(c => c.bpm >= 60 && c.bpm <= 130).reduce((a, b) => (b.error < a.error ? b : a));
    return { bpm: fallback.bpm, sure: false };
  }
  const fits = candidates.filter((c, i) =>
    c.error < FIT && c.error <= (candidates[i - 1]?.error ?? 1) && c.error <= (candidates[i + 1]?.error ?? 1));
  const score = (c: { bpm: number }) =>
    plainness(onsets, c.bpm) - 0.15 * Math.abs(Math.log2(c.bpm / 100)) - 3 * offGrid(onsets, c.bpm);
  return { bpm: fits.reduce((a, b) => (score(b) > score(a) ? b : a)).bpm, sure: true };
}

// The share of notes that clearly miss the grid. One fast run in a slow piece hardly moves the mean
// error, but halving the tempo would still squeeze those notes together.
function offGrid(onsets: number[], bpm: number) {
  const step = 60 / bpm / 4;
  const missed = onsets.filter(t => {
    const position = (t - onsets[0]) / step;
    return Math.abs(position - Math.round(position)) > 0.3;
  });
  return missed.length / onsets.length;
}

// Many tempos fit mathematically; the right one writes the notes as plain values. Even spacing at
// 90 instead of 120 would be all dotted eighths.
function plainness(onsets: number[], bpm: number) {
  const step = 60 / bpm / 4;
  const value = (steps: number) => {
    if (steps === 2 || steps === 4) return 1;
    if (steps === 1 || steps === 8) return 0.9;
    if (steps === 3 || steps === 6 || steps === 12 || steps === 16) return 0.5;
    return 0.3;
  };
  const gaps = onsets.slice(1).map((t, i) => Math.round((t - onsets[i]) / step));
  return gaps.reduce((sum, steps) => sum + value(steps), 0) / gaps.length;
}

// The key signature with the fewest notes outside of it
export function findKey(notes: Detected[]) {
  const weight = new Array<number>(12).fill(0);
  for (const note of notes) weight[note.midi % 12] += Math.max(0.1, note.end - note.start);
  const major = [0, 2, 4, 5, 7, 9, 11];
  let best = 0;
  let bestScore = -Infinity;
  for (let key = -6; key <= 6; key++) {
    const tonic = ((key * 7) % 12 + 12) % 12;
    const inside = major.reduce((sum, step) => sum + weight[(tonic + step) % 12], 0);
    const score = inside - Math.abs(key) * 1e-6;
    if (score > bestScore) {
      best = key;
      bestScore = score;
    }
  }
  return best;
}

// Where bar 1 starts: the place where strong notes come round every bar
function barPhase(items: { tick: number; hand: Hand; size: number }[], ticksPerBar: number) {
  let best = 0;
  let bestScore = -1;
  for (let phase = 0; phase < ticksPerBar; phase += GRID) {
    let score = phase === 0 ? 0.5 : 0;
    for (const item of items) {
      if ((item.tick - phase) % ticksPerBar === 0) score += item.size + (item.hand === 'left' ? 2 : 0);
    }
    if (score > bestScore) {
      best = phase;
      bestScore = score;
    }
  }
  return best;
}

const emit = (events: Ev[], keys: number[], ticks: number) => {
  const parts = splitTicks(ticks);
  parts.forEach((part, i) => {
    const ev: Ev = { id: newId('e'), keys, dur: part.dur };
    if (part.dotted) ev.dotted = true;
    if (keys.length && i < parts.length - 1) ev.tie = true;
    events.push(ev);
  });
};

// One hand has one voice here: a note held under a faster melody ends where the next note starts
function handEvents(notes: { tick: number; length: number; midi: number }[]) {
  const starts = [...new Set(notes.map(n => n.tick))].sort((a, b) => a - b);
  const events: Ev[] = [];
  let now = 0;
  starts.forEach((tick, i) => {
    const chord = notes.filter(n => n.tick === tick);
    if (tick > now) emit(events, [], tick - now);
    const next = starts[i + 1] ?? Infinity;
    const held = Math.max(...chord.map(n => n.length));
    // Bars stop just short of the next one: a gap that small is no rest
    const length = next - tick - held <= GRID ? next - tick : held;
    emit(events, [...new Set(chord.map(n => n.midi))].sort((a, b) => a - b), length);
    now = tick + length;
  });
  return events;
}

export interface Reading {
  bpm: number;
  sure: boolean; // the notes fit a steady beat
  piece: Pick<Piece, 'beats' | 'beatValue' | 'key' | 'bpm' | 'hands'>;
}

// From detected notes to a written piece. `octave` and `tempoFactor` are the corrections from the
// import page: an octave for short keyboards, and half or double when the beat was misjudged.
export function writeDown(notes: Detected[], { octave = 0, tempoFactor = 1 } = {}): Reading {
  const onsets = [...new Set(notes.map(n => Math.round(n.start * 1000) / 1000))].sort((a, b) => a - b);
  const merged = onsets.filter((t, i) => i === 0 || t - onsets[i - 1] > 0.03);
  const tempo = findTempo(merged);
  const bpm = tempo.bpm * tempoFactor;
  const perSecond = (bpm * PPQ) / 60;
  const first = merged[0] ?? 0;
  const snap = (seconds: number) => Math.round((seconds * perSecond) / GRID) * GRID;

  const placed = notes.map(note => ({
    midi: note.midi + octave * 12,
    hand: note.hand,
    tick: snap(note.start - first),
    // A bar looks a little shorter than the note it stands for, so its end is rounded up
    length: Math.max(GRID, snap(note.end - note.start + (0.3 * GRID) / perSecond)),
  }));

  const beats = 4;
  const beatValue = 4;
  const ticksPerBar = (beats * 192) / beatValue;
  const moments = [...new Set(placed.map(n => `${n.tick}|${n.hand}`))].map(id => {
    const [tick, hand] = id.split('|');
    return {
      tick: Number(tick), hand: hand as Hand,
      size: placed.filter(n => n.tick === Number(tick) && n.hand === hand).length,
    };
  });
  const phase = barPhase(moments, ticksPerBar);
  const pickup = (ticksPerBar - phase) % ticksPerBar;
  const moved = placed.map(n => ({ ...n, tick: n.tick + pickup }));
  const key = findKey(notes);

  return {
    bpm,
    sure: tempo.sure,
    piece: {
      beats, beatValue, key, bpm: Math.round(bpm),
      hands: {
        right: handEvents(moved.filter(n => n.hand === 'right')),
        left: handEvents(moved.filter(n => n.hand === 'left')),
      },
    },
  };
}
