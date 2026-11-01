import type { Ev, Hand, Piece } from '../types';
import { newId } from '../utils/ids';
import { PPQ, splitTicks } from '../utils/score';
import type { Detected } from './tracker';

const GRID = PPQ / 4; // everything lands on sixteenths
const MIN_BPM = 45;
const MAX_BPM = 200;
const FIT = 0.16; // mean distance from the grid, in grid steps; a random note lands at 0.25
const EXACT = 0.02; // seconds: machine-made tutorials hit the beat this closely, people don't
const FOLLOW = 0.08; // how fast the counted tempo follows the music
const DRIFT = 0.15; // how far it may wander
const CHORD = 0.06; // seconds; notes this close were meant together
const BIN = 0.01; // seconds, for following played music
const BEAT_STIFFNESS = 250; // how strongly a beat keeps to the length of the one before
const START_STIFFNESS = 10; // and the first one to the pulse
const SHORTEST_BEAT = 0.7; // in pulses
const LONGEST_BEAT = 1.4;
const SPAN_CHANGE = 4; // the most a beat may differ from the one before, in steps of BIN
const NO_BEAT = 127;
const ON_THE_ONE = 3; // what a new bass note is worth on the one, in notes on a beat
const OFF_THE_ONE = 1; // and what it costs anywhere else
const GRID_SEARCH = 0.07; // how far off the first idea of the tempo may be
const GRID_TRIES = 800;
const GRID_ORDER = 0.75; // how tightly note starts have to sit on a grid: 1 is perfect, played music gets far below
const RETUNE = 6; // notes in a row off the grid on one side: the tempo has changed on purpose
const UNEVEN_TIMES = 2.5; // off the grid means this many times further than notes usually are
const TEMPO_WINDOW = 16; // beats over which the tempo is read
const PULSE_MIN = 0.3; // seconds between beats
const PULSE_MAX = 2;
const THREE_BAR = 12; // sixteenths in a bar of 3/4 or 6/8
const FOUR_BAR = 16;
const CLEAR_BASS = 4; // times more often than by chance: the bass really marks the bars
const CLEARER = 1.5; // how much clearer three has to be than four
const ENOUGH_BARS = 8; // shorter pieces don't show their bars
const SIX_EIGHT_FROM = 110; // quarters a minute; running eighths this fast feel like two beats, not three

// Follows the music through its note starts the way a musician counts along: each note says where
// the beat really is, and the tempo drifts with it. A fixed grid can't work on played music, where
// a beat takes 0.93 seconds here and 1.0 there.
function follow(onsets: number[], bpm: number) {
  const base = 60 / bpm / 4;
  let step = base;
  let at = onsets[0];
  let index = 0;
  let error = 0;
  let off = 0;
  let missed = 0;
  const steps = [0];
  for (const time of onsets.slice(1)) {
    const gap = time - at;
    const count = Math.max(1, Math.round(gap / step));
    const miss = gap - count * step;
    const share = Math.abs(miss) / step;
    error += share;
    off += Math.abs(miss);
    if (share > 0.3) missed++;
    index += count;
    steps.push(index);
    step = Math.min(base * (1 + DRIFT), Math.max(base * (1 - DRIFT), step + (FOLLOW * miss) / count));
    at = time;
  }
  const notes = Math.max(1, onsets.length - 1);
  // The tempo actually counted, which may have drifted away from the one started with
  const tempo = index ? (60 * index) / (4 * (onsets[onsets.length - 1] - onsets[0])) : bpm;
  return { steps, tempo, error: error / notes, off: off / notes, missed: missed / notes };
}

// Note starts as a curve over time, chords weighing more than single notes
function startCurve(onsets: number[], weights: number[]) {
  const length = Math.ceil((onsets[onsets.length - 1] - onsets[0]) / BIN) + 1;
  const curve = new Float64Array(length);
  onsets.forEach((time, i) => {
    const at = Math.round((time - onsets[0]) / BIN);
    for (let d = -6; d <= 6; d++) {
      if (at + d >= 0 && at + d < length) curve[at + d] += weights[i] * Math.exp(-(d * d) / 18);
    }
  });
  return curve;
}

// The pulse of played music: the distance at which note starts keep coming back
function findPulse(curve: Float64Array) {
  let best = 1;
  let bestScore = -1;
  for (let lag = Math.round(PULSE_MIN / BIN); lag <= Math.round(PULSE_MAX / BIN); lag++) {
    let sum = 0;
    for (let i = 0; i + lag < curve.length; i++) sum += curve[i] * curve[i + lag];
    const score = sum / (curve.length - lag);
    if (score > bestScore) {
      bestScore = score;
      best = lag;
    }
  }
  let bpm = 60 / (best * BIN);
  while (bpm > 130) bpm /= 2;
  while (bpm < 50) bpm *= 2;
  return bpm;
}

// Where a new bass note comes in, as a curve like `startCurve`: harmony mostly changes on the one
function bassCurve(notes: Detected[], origin: number, length: number, reach: number) {
  const curve = new Float64Array(length);
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  const lowest = (from: number, to: number) => {
    let low = Infinity;
    for (const { start, midi } of sorted) if (start >= from && start < to && midi < low) low = midi;
    return low;
  };
  let last: number | null = null; // key of the note before the chord this one is in
  let chordStart = -Infinity;
  let current: number | null = null;
  for (const { start, midi } of sorted) {
    if (start - chordStart > CHORD) {
      last = current;
      chordStart = start;
    }
    current = midi;
    // In a thin passage the note before may lie a long way back
    const near = lowest(start - reach, start - CHORD);
    const before = near === Infinity ? last : near;
    if (before === null || midi !== lowest(start - CHORD, start + reach) || before % 12 === midi % 12) continue;
    const at = Math.round((start - origin) / BIN);
    for (let d = -6; d <= 6; d++) {
      if (at + d >= 0 && at + d < length) curve[at + d] = Math.max(curve[at + d], Math.exp(-(d * d) / 18));
    }
  }
  return curve;
}

// The best chain of beats through the whole piece, counted the way a musician counts: each beat
// wants to sit on note starts and to last about as long as the one before. The tempo may wander far
// over a piece, just not from one beat to the next, so a thin passage goes on at the tempo it is in.
// With `bars` the chain also knows its place in the bar and expects new bass notes on the one: a
// chain that only looks at beats comes out of a slow passage a beat off, and every bar with it.
function trackBeats(curve: Float64Array, bpm: number, bars?: { bass: Float64Array; beats: number }) {
  const period = 60 / bpm / BIN;
  const shortest = Math.max(2, Math.round(period * SHORTEST_BEAT));
  const longest = Math.round(period * LONGEST_BEAT);
  const spans = longest - shortest + 1;
  const places = bars?.beats ?? 1;
  const rowLength = spans * places;
  const index = (t: number, s: number, place: number) => t * rowLength + s * places + place;
  // The best chain with a beat at t, reached by a beat s + shortest long, on this place in the bar
  const score = new Float32Array(curve.length * spans * places);
  const previous = new Int8Array(score.length);
  const startCosts = Float32Array.from({ length: spans }, (_, s) => START_STIFFNESS * Math.log((s + shortest) / period) ** 2);
  const changeCosts = Float32Array.from({ length: spans * (2 * SPAN_CHANGE + 1) }, (_, i) => {
    const s = Math.floor(i / (2 * SPAN_CHANGE + 1));
    const was = s + (i % (2 * SPAN_CHANGE + 1)) - SPAN_CHANGE;
    return BEAT_STIFFNESS * Math.log((s + shortest) / (was + shortest || 1)) ** 2;
  });
  const costsPerSpan = 2 * SPAN_CHANGE + 1;
  for (let t = 0; t < curve.length; t++) {
    const onset = curve[t]; // one for each note starting here
    const bass = bars ? bars.bass[t] : 0;
    const row = t * rowLength;
    for (let s = 0; s < spans; s++) {
      const before = t - s - shortest;
      const earlier = before * rowLength;
      const costs = s * costsPerSpan + SPAN_CHANGE;
      const firstChange = Math.max(-SPAN_CHANGE, -s);
      const lastChange = Math.min(SPAN_CHANGE, spans - 1 - s);
      for (let place = 0; place < places; place++) {
        let best = -startCosts[s];
        let from = NO_BEAT;
        if (before >= 0) {
          const last = place ? place - 1 : places - 1;
          for (let d = firstChange; d <= lastChange; d++) {
            const value = score[earlier + (s + d) * places + last] - changeCosts[costs + d];
            if (value > best) {
              best = value;
              from = d;
            }
          }
        }
        const here = row + s * places + place;
        score[here] = onset + bass * (place ? -OFF_THE_ONE : ON_THE_ONE) + best;
        previous[here] = from;
      }
    }
  }
  let end = 0;
  for (let i = 0; i < score.length; i++) if (score[i] > score[end]) end = i;
  let place = end % places;
  let span = Math.floor(end / places) % spans;
  let at = Math.floor(end / rowLength);
  const beats = [at * BIN];
  while (previous[index(at, span, place)] !== NO_BEAT) {
    const d = previous[index(at, span, place)];
    at -= span + shortest;
    span += d;
    place = (place + places - 1) % places;
    beats.unshift(at * BIN);
  }
  return beats;
}

// Each note start as a step of sixteenths: four to every beat, whatever a beat really took. Notes
// before the first beat count back from it.
function stepsAlong(onsets: number[], beats: number[], period: number) {
  const first = onsets[0];
  const steps = onsets.map(time => {
    const at = time - first;
    let beat = beats.findIndex((_, i) => at < (beats[i + 1] ?? Infinity));
    if (beat < 0) beat = 0;
    const from = beats[beat] ?? 0;
    const span = at < from ? period : (beats[beat + 1] ?? from + period) - from;
    return beat * 4 + Math.round((4 * (at - from)) / span);
  });
  return steps.map(step => step - steps[0]);
}

// How tightly note starts sit on a grid of `step` seconds: 1 is perfect, 0 no relation at all.
// Each start counts as a direction on a circle one step around; on a grid they all point alike.
function gridFit(onsets: number[], step: number) {
  let x = 0;
  let y = 0;
  for (const time of onsets) {
    const angle = (2 * Math.PI * time) / step;
    x += Math.cos(angle);
    y += Math.sin(angle);
  }
  return { order: Math.hypot(x, y) / onsets.length, offset: (Math.atan2(y, x) / (2 * Math.PI)) * step };
}

// The exact length of a sixteenth, near `around`
function fineStep(onsets: number[], around: number) {
  let best = { step: around, order: 0 };
  for (let i = -GRID_TRIES; i <= GRID_TRIES; i++) {
    const step = around * (1 + (GRID_SEARCH * i) / GRID_TRIES);
    const { order } = gridFit(onsets, step);
    if (order > best.order) best = { step, order };
  }
  return best;
}

// A machine-made piece on one grid for all of it: each note finds its step by itself, so one note a
// few milliseconds off costs nothing, while counting from note to note it can cost an eighth and
// every bar line after it. Only when notes keep missing on one side has the tempo really changed.
function stepsOnGrid(onsets: number[], sixteenth: number) {
  // All notes say where the grid lies: the first one alone may be off itself
  const { offset } = gridFit(onsets, sixteenth);
  const start = offset + Math.round((onsets[0] - offset) / sixteenth) * sixteenth;
  // Fewer pictures make note starts more uneven, and that alone is no change of tempo
  const uneven = onsets.reduce((sum, time) => {
    const place = (time - start) / sixteenth;
    return sum + Math.abs(place - Math.round(place)) * sixteenth;
  }, 0) / onsets.length;
  const offGrid = Math.max(sixteenth / 4, UNEVEN_TIMES * uneven);
  let step = sixteenth;
  let anchor = start;
  let base = 0;
  let missing: { time: number; count: number; miss: number }[] = [];
  return onsets.map(time => {
    const count = base + Math.round((time - anchor) / step);
    const miss = time - anchor - (count - base) * step;
    if (Math.abs(miss) > offGrid && (!missing.length || miss * missing[0].miss > 0)) missing.push({ time, count, miss });
    else missing = [];
    if (missing.length >= RETUNE) {
      const first = missing[0];
      if (count > first.count) step = (time - first.time) / (count - first.count);
      anchor = time;
      base = count;
      missing = [];
    }
    return count;
  });
}

// The grid of a machine-made piece, or null. `bpm` may be a good way off or at half or double the
// tempo: the plainest note values decide.
function findGrid(onsets: number[], bpm: number) {
  const fits: { step: number; steps: number[]; plain: number }[] = [];
  for (const factor of [0.5, 1, 2]) {
    // Uneven pictures blur a fine grid sooner than a coarse one, and half of a grid that holds is one
    const coarser = fits[fits.length - 1];
    const fit = coarser ? { step: coarser.step / 2, order: 1 } : fineStep(onsets, 15 / (bpm * factor));
    if (fit.order < GRID_ORDER) continue;
    const steps = stepsOnGrid(onsets, fit.step);
    // How plain the note values are is read from the coarse grid: the fine one is more easily
    // thrown by uneven pictures, and notes on the coarse grid are at home on the fine one
    const tempo = 15 / fit.step;
    const plain = plainness(coarser ? coarser.steps.map(s => s * 2) : steps) - 0.15 * Math.abs(Math.log2(tempo / 100));
    fits.push({ step: fit.step, steps, plain });
  }
  return fits.length ? fits.reduce((a, b) => (b.plain > a.plain ? b : a)) : null;
}

// The usual tempo along the beats: an ending that slows down isn't the tempo of the piece
function tempoAlong(beats: number[]) {
  const reach = Math.min(TEMPO_WINDOW, beats.length - 1);
  const spans = beats.slice(reach).map((beat, i) => (beat - beats[i]) / reach).sort((a, b) => a - b);
  return 60 / spans[spans.length >> 1];
}

// Many tempos fit mathematically; the right one writes the notes as plain values. Even spacing at
// 90 instead of 120 would be all dotted eighths.
function plainness(steps: number[]) {
  const value = (count: number) => {
    if (count === 2 || count === 4) return 1;
    if (count === 1 || count === 8) return 0.9;
    if (count === 3 || count === 6 || count === 12 || count === 16) return 0.5;
    return 0.3;
  };
  return steps.slice(1).reduce((sum, s, i) => sum + value(s - steps[i]), 0) / Math.max(1, steps.length - 1);
}

// The tempo near 100 that keeps the notes on the grid, in plain note values. Halving it would look
// tidy but squeeze fast notes together, so notes that miss the grid weigh heavily.
export function findTempo(onsets: number[]) {
  if (onsets.length < 2) return { bpm: 100, start: 100, sure: false };
  const tried: { bpm: number; tempo: number; error: number; off: number; score: number }[] = [];
  for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm += 0.5) {
    const { steps, tempo, error, off, missed } = follow(onsets, bpm);
    tried.push({ bpm, tempo, error, off, score: plainness(steps) - 0.15 * Math.abs(Math.log2(tempo / 100)) - 3 * missed });
  }
  const good = tried.filter(t => t.error < FIT && t.off < EXACT);
  const pool = good.length ? good : tried.filter(t => t.bpm >= 60 && t.bpm <= 130);
  const best = pool.reduce((a, b) => (b.score > a.score ? b : a));
  return { bpm: best.tempo, start: best.bpm, sure: good.length > 0 };
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

// The bass marks the bars, in block chords as in broken ones: the lowest note of a stretch one bar
// long keeps falling on the same place, the one. Which place, and how clearly: 1 is pure chance.
function bassPlace(lowest: Map<number, number>, last: number, bar: number) {
  const votes = new Array<number>(bar).fill(0);
  for (let from = 0; from + bar <= last + 1; from++) {
    let low = Infinity;
    let at = -1;
    for (let step = from; step < from + bar; step++) {
      const key = lowest.get(step);
      if (key !== undefined && key < low) {
        low = key;
        at = step;
      }
    }
    if (at >= 0) votes[at % bar]++;
  }
  const total = votes.reduce((sum, vote) => sum + vote, 0);
  const place = votes.indexOf(Math.max(...votes));
  return { place, clearness: total ? (votes[place] * bar) / total : 0 };
}

export type Meter = '4/4' | '3/4' | '6/8';

const meterOf = (meter: Meter) => {
  const [beats, beatValue] = meter.split('/').map(Number);
  return { beats, beatValue, ticksPerBar: (beats * 192) / beatValue };
};

const lowestByStep = (notes: { tick: number; midi: number }[]) => {
  const lowest = new Map<number, number>();
  for (const { tick, midi } of notes) {
    const step = Math.round(tick / GRID);
    lowest.set(step, Math.min(midi, lowest.get(step) ?? Infinity));
  }
  return lowest;
};

// The bars of a piece, from where its bass goes
function findBars(notes: { tick: number; midi: number }[], bpm: number) {
  const lowest = lowestByStep(notes);
  const last = Math.max(0, ...lowest.keys());
  const four = bassPlace(lowest, last, FOUR_BAR);
  const three = bassPlace(lowest, last, THREE_BAR);
  if (last >= ENOUGH_BARS * THREE_BAR && three.clearness >= CLEAR_BASS && three.clearness >= CLEARER * four.clearness) {
    return { meter: (bpm >= SIX_EIGHT_FROM ? '6/8' : '3/4') as Meter, place: three.place * GRID };
  }
  const clear = last >= ENOUGH_BARS * FOUR_BAR && four.clearness >= CLEAR_BASS;
  return { meter: '4/4' as Meter, place: clear ? four.place * GRID : null };
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

// Which of the sorted `times` is closest to `time`
function nearestIndex(times: number[], time: number) {
  let low = 0;
  let high = times.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (times[middle] <= time) low = middle;
    else high = middle;
  }
  return Math.abs(times[high] - time) < Math.abs(times[low] - time) ? high : low;
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
function handEvents(notes: { tick: number; length: number; midi: number; unsure?: boolean }[], hold: number, unsure: string[]) {
  const starts = [...new Set(notes.map(n => n.tick))].sort((a, b) => a - b);
  const events: Ev[] = [];
  let now = 0;
  starts.forEach((tick, i) => {
    const chord = notes.filter(n => n.tick === tick);
    if (tick > now) emit(events, [], tick - now);
    const next = starts[i + 1] ?? Infinity;
    const held = Math.max(...chord.map(n => n.length));
    // Bars stop just short of the next one: a gap that small is no rest
    const length = next - tick - held <= hold ? next - tick : held;
    const first = events.length;
    emit(events, [...new Set(chord.map(n => n.midi))].sort((a, b) => a - b), length);
    if (chord.some(n => n.unsure)) unsure.push(events[first].id);
    now = tick + length;
  });
  return events;
}

export interface Reading {
  bpm: number;
  sure: boolean; // the notes fit a steady beat
  piece: Pick<Piece, 'beats' | 'beatValue' | 'key' | 'bpm' | 'hands' | 'source'>;
  placed: { midi: number; hand: Hand; tick: number; start: number }[]; // each note, written and heard
}

// Where each note start lies in the piece. The slow part, and the same for all ways of writing it
// down, so the choices on the import page don't have to wait for it.
function countNotes(notes: Detected[]) {
  const times = [...new Set(notes.map(n => n.start))].sort((a, b) => a - b);
  // A chord: every note of it takes the time of its first
  const together = (span: number) => times.filter((t, i) => i === 0 || t - times[i - 1] > span);
  const exact = together(CHORD);
  const steady = findTempo(exact);
  const curve = exact.length < 8 ? null : startCurve(
    exact, exact.map((t, i) => notes.filter(n => n.start >= t && n.start < (exact[i + 1] ?? Infinity)).length),
  );
  const firstPulse = curve ? findPulse(curve) : null;
  const grid = firstPulse ? findGrid(exact, steady.bpm) ?? findGrid(exact, firstPulse) : null;
  const pulse = grid ? null : firstPulse;
  // Played chords are often rolled: what is closer than half a sixteenth belongs together
  const onsets = pulse ? together((0.45 * 15) / pulse) : exact;
  // A first count shows the bars, and knowing the bars makes the count hold
  const firstBeats = curve && pulse ? trackBeats(curve, pulse) : [];
  const firstSteps = firstBeats.length ? stepsAlong(onsets, firstBeats, 60 / (pulse as number)) : [];
  const beatsInBar = firstSteps.length ? findBars(notes.map(n => ({ tick: firstSteps[nearestIndex(onsets, n.start)] * GRID, midi: n.midi })), pulse as number) : null;
  const beatTimes = curve && pulse && beatsInBar?.place !== null && beatsInBar
    ? trackBeats(curve, pulse, { beats: beatsInBar.meter === '4/4' ? 4 : 3, bass: bassCurve(notes, onsets[0], curve.length, 120 / pulse) })
    : firstBeats;
  const counted = grid ? 15 / grid.step : beatTimes.length > 1 ? tempoAlong(beatTimes) : pulse;
  const tempo = counted ? { ...steady, bpm: counted, sure: Boolean(grid) || (exact.length < 8 && steady.sure) } : steady;
  const anchors = !onsets.length ? [] : grid ? grid.steps : curve ? stepsAlong(onsets, beatTimes, 60 / tempo.bpm) : follow(onsets, steady.start).steps;
  return { onsets, anchors, tempo, played: Boolean(pulse) };
}

const counts = new WeakMap<Detected[], ReturnType<typeof countNotes>>();

// From detected notes to a written piece. `octave` and `tempoFactor` are the corrections from the
// import page: an octave for short keyboards, and half or double when the beat was misjudged.
export function writeDown(notes: Detected[], { octave = 0, tempoFactor = 1, meter, lag = 0 }: { octave?: number; tempoFactor?: number; meter?: Meter; lag?: number } = {}): Reading {
  const count = counts.get(notes) ?? countNotes(notes);
  counts.set(notes, count);
  const { onsets, anchors, tempo, played } = count;
  const bpm = tempo.bpm * tempoFactor;
  const scale = tempoFactor; // half the tempo: every note takes half as many steps

  // Seconds to ticks along the followed beat, between the note starts
  const tickAt = (seconds: number) => {
    let i = onsets.findIndex(t => t > seconds);
    if (i < 0) i = onsets.length - 1;
    i = Math.max(1, i);
    if (onsets.length < 2) return ((seconds - (onsets[0] ?? 0)) * bpm * PPQ) / 60;
    const from = onsets[i - 1];
    const count = anchors[i] - anchors[i - 1];
    if (!count) return anchors[i] * GRID * scale;
    return (anchors[i - 1] + ((seconds - from) * count) / (onsets[i] - from)) * GRID * scale;
  };
  const snap = (ticks: number) => Math.round(ticks / GRID) * GRID;

  const placed = notes.map(note => {
    const tick = snap(anchors[nearestIndex(onsets, note.start)] * GRID * scale);
    return {
      midi: note.midi + octave * 12,
      hand: note.hand,
      start: note.start,
      unsure: note.unsure,
      tick,
      // A bar looks a little shorter than the note it stands for, so its end is rounded up
      length: Math.max(GRID, snap(tickAt(note.end) + 0.3 * GRID) - tick),
    };
  });

  const bars = findBars(placed, bpm);
  const { beats, beatValue, ticksPerBar } = meterOf(meter ?? bars.meter);
  const moments = [...new Set(placed.map(n => `${n.tick}|${n.hand}`))].map(id => {
    const [tick, hand] = id.split('|');
    return {
      tick: Number(tick), hand: hand as Hand,
      size: placed.filter(n => n.tick === Number(tick) && n.hand === hand).length,
    };
  });
  const sameLength = meterOf(bars.meter).ticksPerBar === ticksPerBar;
  const phase = sameLength && bars.place !== null ? bars.place : barPhase(moments, ticksPerBar);
  const pickup = (ticksPerBar - phase) % ticksPerBar;
  const moved = placed.map(n => ({ ...n, tick: n.tick + pickup }));
  const key = findKey(notes);
  // Played music is mostly held with the pedal: a chord lasts until the next one
  const hold = played ? GRID * 3 : GRID;

  const unsure: string[] = [];
  const hands = {
    right: handEvents(moved.filter(n => n.hand === 'right'), hold, unsure),
    left: handEvents(moved.filter(n => n.hand === 'left'), hold, unsure),
  };
  // Bars pass the row before they sound, so the moments are `lag` later in the recording
  const heardAt = new Map<number, number>();
  for (const { tick, start } of [...moved].sort((a, b) => a.start - b.start)) {
    if (!heardAt.has(tick)) heardAt.set(tick, Number((start + lag).toFixed(2)));
  }
  const inOrder = [...heardAt].sort((a, b) => a[0] - b[0]);
  const hearing = inOrder.filter(([, seconds], i) => inOrder.slice(Math.max(0, i - 8), i).every(before => before[1] < seconds));

  return {
    bpm,
    sure: tempo.sure,
    placed: moved.map(({ midi, hand, tick, start }) => ({ midi, hand, tick, start })),
    piece: {
      beats, beatValue, key, bpm: Math.round(bpm), hands,
      source: { moments: hearing, unsure },
    },
  };
}
