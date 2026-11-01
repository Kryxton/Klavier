import { describe, expect, it } from 'vitest';
import { isBlack, keyPosition } from '../utils/notes';
import { eventTicks } from '../utils/score';
import { findKeyboard, type Frame } from './keyboard';
import { findKey, findTempo, writeDown } from './rhythm';
import { Tracker, type Detected } from './tracker';

const WIDTH = 1040;
const HEIGHT = 300;
const TOP = 220;
type Color = [number, number, number];

function blank(width: number, height: number, color: Color = [10, 10, 16]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
    data[i + 3] = 255;
  }
  return { data, width, height };
}

function rect(frame: ReturnType<typeof blank>, x0: number, y0: number, w: number, h: number, color: Color) {
  for (let y = Math.max(0, Math.round(y0)); y < Math.min(frame.height, y0 + h); y++) {
    for (let x = Math.max(0, Math.round(x0)); x < Math.min(frame.width, x0 + w); x++) {
      const i = (y * frame.width + x) * 4;
      [frame.data[i], frame.data[i + 1], frame.data[i + 2]] = color;
    }
  }
}

// A drawn keyboard from `low` to `high`, with a few bars falling above it
function picture(low: number, high: number, bars: { midi: number; color: Color }[] = []) {
  const frame = blank(WIDTH, HEIGHT);
  const whites = keyPosition(high + 1) - keyPosition(low);
  const unit = WIDTH / whites;
  const xOf = (midi: number) => (keyPosition(midi) - keyPosition(low)) * unit;
  for (let midi = low; midi <= high; midi++) {
    if (!isBlack(midi)) rect(frame, xOf(midi) + 1, TOP, unit - 2, HEIGHT - TOP, [240, 240, 235]);
  }
  for (let midi = low; midi <= high; midi++) {
    if (isBlack(midi)) rect(frame, xOf(midi) - unit * 0.3, TOP, unit * 0.6, 50, [5, 5, 5]);
  }
  for (const bar of bars) {
    const x = isBlack(bar.midi) ? xOf(bar.midi) - unit * 0.3 : xOf(bar.midi) + 1;
    rect(frame, x, 0, isBlack(bar.midi) ? unit * 0.6 : unit - 2, TOP, bar.color);
  }
  return frame;
}

const rowOf = (frame: Frame, y: number): Frame => ({
  data: (frame.data as Uint8ClampedArray).subarray(y * frame.width * 4, (y + 1) * frame.width * 4),
  width: frame.width,
  height: 1,
});

describe('findKeyboard', () => {
  it('reads all 88 keys and knows the octave', () => {
    const map = findKeyboard(picture(21, 108));
    expect(map?.fullKeyboard).toBe(true);
    expect(map?.keys).toHaveLength(88);
    expect(map?.keyTop).toBe(TOP);
    const unit = WIDTH / 52;
    const middleC = map?.keys.find(k => k.midi === 60);
    expect(middleC?.x).toBeCloseTo((keyPosition(60) + 0.5) * unit, -1);
  });

  it('reads a shorter keyboard and places it around the middle', () => {
    const map = findKeyboard(picture(36, 96));
    expect(map?.fullKeyboard).toBe(false);
    const c = map?.keys.find(k => k.midi === 60);
    expect(c?.x).toBeCloseTo((keyPosition(60) - keyPosition(36) + 0.5) * (WIDTH / 36), -1);
  });

  it('finds the top edge even when hands cover the lower part of the keys', () => {
    const frame = picture(21, 108);
    rect(frame, 300, TOP + 22, 240, HEIGHT - TOP - 22, [190, 140, 120]);
    expect(findKeyboard(frame)?.keyTop).toBe(TOP);
  });

  it('still finds the keys with bars falling onto them', () => {
    const map = findKeyboard(picture(21, 108, [{ midi: 60, color: [80, 200, 90] }, { midi: 67, color: [80, 200, 90] }]));
    expect(map?.keys).toHaveLength(88);
  });

  it('finds nothing in a picture without a keyboard', () => {
    expect(findKeyboard(blank(WIDTH, HEIGHT))).toBeNull();
    const bars = blank(WIDTH, HEIGHT);
    for (let i = 0; i < 20; i++) rect(bars, i * 50 + 10, 0, 20, HEIGHT, [240, 240, 240]);
    expect(findKeyboard(bars)).toBeNull();
  });
});

const GREEN: Color = [70, 200, 90];
const BLUE: Color = [70, 120, 230];
const DARK_GREEN: Color = [30, 110, 50];

// Bars pass the scan row while their note lasts: a tiny video
function trackerOver(notes: { midi: number; start: number; end: number; color: Color }[], seconds: number, low = 21, high = 108) {
  const map = findKeyboard(picture(low, high));
  if (!map) throw new Error('keine Tastatur');
  const tracker = new Tracker(map);
  for (let f = 0; f < seconds * 30; f++) {
    const time = f / 30;
    const bars = notes.filter(n => time >= n.start && time < n.end);
    tracker.add(rowOf(picture(low, high, bars), map.scanY), time);
  }
  return tracker;
}

const track = (...args: Parameters<typeof trackerOver>) => trackerOver(...args).finish();

describe('Tracker', () => {
  it('finds start, end and key of each bar', () => {
    const notes = track([
      { midi: 60, start: 0.5, end: 1, color: GREEN },
      { midi: 64, start: 1, end: 2, color: GREEN },
      { midi: 61, start: 2, end: 2.5, color: GREEN },
    ], 3);
    expect(notes.map(n => n.midi)).toEqual([60, 64, 61]);
    expect(notes[1].start).toBeCloseTo(1, 1);
    expect(notes[1].end).toBeCloseTo(2, 1);
  });

  it('accepts pictures in any order, as filled holes arrive late', () => {
    const map = findKeyboard(picture(21, 108));
    if (!map) throw new Error('keine Tastatur');
    const tracker = new Tracker(map);
    const times = Array.from({ length: 60 }, (_, f) => f / 30);
    for (const time of [...times.slice(0, 20), ...times.slice(40), ...times.slice(20, 40)]) {
      const bars = time >= 0.5 && time < 1 ? [{ midi: 60, color: GREEN }] : [];
      tracker.add(rowOf(picture(21, 108, bars), map.scanY), time);
    }
    const notes = tracker.finish();
    expect(notes).toHaveLength(1);
    expect(notes[0].start).toBeCloseTo(0.5, 1);
    expect(notes[0].end).toBeCloseTo(0.97, 1);
  });

  it('keeps a repeated key apart by the gap between its bars', () => {
    const notes = track([
      { midi: 60, start: 0.5, end: 0.9, color: GREEN },
      { midi: 60, start: 1, end: 1.4, color: GREEN },
    ], 2);
    expect(notes).toHaveLength(2);
  });

  it('tells the hands apart by colour', () => {
    const notes = track([
      { midi: 72, start: 0.5, end: 1, color: GREEN },
      { midi: 48, start: 0.5, end: 1, color: BLUE },
      { midi: 62, start: 1.5, end: 2, color: BLUE },
      { midi: 65, start: 1.5, end: 2, color: GREEN },
    ], 3);
    const hand = (midi: number) => notes.find(n => n.midi === midi)?.hand;
    expect(hand(72)).toBe('right');
    expect(hand(65)).toBe('right');
    expect(hand(48)).toBe('left');
    expect(hand(62)).toBe('left');
  });

  it('drops a piece of a long bar that broke off', () => {
    const notes = track([
      { midi: 48, start: 0.2, end: 1.2, color: BLUE },
      { midi: 48, start: 1.3, end: 1.4, color: BLUE },
    ], 2);
    expect(notes.length).toBeGreaterThan(0);
    const inside: Detected[] = [note(48, 0.2, 2), note(48, 1, 1.1)];
    expect(writeDown(inside).piece.hands.right.length).toBeGreaterThan(0);
  });

  it('treats a lighter and darker shade as one hand', () => {
    const notes = track([
      { midi: 72, start: 0.5, end: 1, color: GREEN },
      { midi: 73, start: 1, end: 1.5, color: DARK_GREEN },
      { midi: 48, start: 0.5, end: 1, color: BLUE },
    ], 2);
    expect(notes.find(n => n.midi === 73)?.hand).toBe('right');
  });

  it('keeps two bars apart when sparks join them, and leaves the sparks to the sound', () => {
    const SPARK: Color = [75, 60, 45];
    const solid = [0.2, 0.7, 2.2].map(start => ({ midi: 72, start, end: start + 0.4, color: GREEN }));
    const tracker = trackerOver([
      ...solid,
      { midi: 81, start: 1, end: 1.1, color: GREEN },
      { midi: 82, start: 1.1, end: 1.3, color: SPARK },
      { midi: 83, start: 1.3, end: 1.6, color: GREEN },
    ], 3);
    const notes = tracker.finish();
    expect(notes.filter(n => n.midi > 72).map(n => n.midi)).toEqual([81, 83]);
    expect(tracker.doubtful.map(n => n.midi)).toContain(82);
  });

  it('keeps darker bars on black keys, even with few of them to judge by', () => {
    const light = [0.2, 0.7, 1.2, 1.7].map(start => ({ midi: 72, start, end: start + 0.4, color: GREEN }));
    const notes = track([
      ...light,
      { midi: 73, start: 2.2, end: 2.6, color: DARK_GREEN },
      { midi: 75, start: 2.7, end: 3.1, color: DARK_GREEN },
    ], 4);
    expect(notes.filter(n => n.midi !== 72).map(n => n.midi)).toEqual([73, 75]);
  });

  it('reads a bar with a letter in it as one note', () => {
    const map = findKeyboard(picture(21, 108));
    if (!map) throw new Error('keine Tastatur');
    const tracker = new Tracker(map);
    const x = map.keys.find(k => k.midi === 72)?.x ?? 0;
    for (let f = 0; f < 60; f++) {
      const time = f / 30;
      const frame = picture(21, 108, time >= 0.5 && time < 1.5 ? [{ midi: 72, color: GREEN }] : []);
      // A dark outline down the middle, and for a moment a lighter shape across the whole bar
      if (time >= 0.5 && time < 1.5) rect(frame, x - 1, 0, 2, TOP, [0, 0, 0]);
      if (time >= 0.9 && time < 0.95) rect(frame, x - 8, 0, 16, TOP, [40, 90, 50]);
      tracker.add(rowOf(frame, map.scanY), time);
    }
    const notes = tracker.finish();
    expect(notes.map(n => n.midi)).toEqual([72]);
    expect(notes[0].end - notes[0].start).toBeGreaterThan(0.9);
    expect(notes[0].hand).toBe('right');
  });

  it('still keeps a repeated key apart when a bar is darkened by nothing', () => {
    const notes = track([
      { midi: 72, start: 0.5, end: 0.8, color: GREEN },
      { midi: 72, start: 0.87, end: 1.2, color: GREEN },
    ], 2);
    expect(notes).toHaveLength(2);
  });

  it('takes a dark shade that always looks the same for real bars', () => {
    const OLIVE: Color = [80, 90, 10];
    const times = Array.from({ length: 10 }, (_, i) => 0.2 + i * 0.6);
    const bright = times.map(start => ({ midi: 61, start, end: start + 0.2, color: GREEN }));
    const dark = times.map(start => ({ midi: 54, start, end: start + 0.2, color: OLIVE }));
    const notes = track([...bright, ...dark], 7);
    expect(notes.filter(n => n.midi === 54)).toHaveLength(10);
  });

  it('does not take uneven glimmer for such a shade', () => {
    const times = Array.from({ length: 12 }, (_, i) => 0.2 + i * 0.6);
    const bright = times.map(start => ({ midi: 61, start, end: start + 0.2, color: GREEN }));
    const glimmer = times.map((start, i) => ({ midi: 54, start, end: start + 0.2, color: [60 + (i % 9) * 11, 20, 5] as Color }));
    const notes = track([...bright, ...glimmer], 8);
    expect(notes.filter(n => n.midi === 54)).toHaveLength(0);
  });

  it('reads the start of a bar the same with a sharp or a blurred edge', () => {
    const map = findKeyboard(picture(21, 108));
    if (!map) throw new Error('keine Tastatur');
    const tracker = new Tracker(map);
    const faded = (colour: Color, share: number) => colour.map(c => 10 + (c - 10) * share) as Color;
    for (let f = 0; f < 60; f++) {
      const bars = [];
      if (f >= 15 && f < 30) bars.push({ midi: 72, color: GREEN }); // sharp
      if (f === 14) bars.push({ midi: 84, color: faded(GREEN, 0.3) }); // blurred, the same moment
      if (f >= 15 && f < 30) bars.push({ midi: 84, color: GREEN });
      tracker.add(rowOf(picture(21, 108, bars), map.scanY), f / 30);
    }
    const notes = tracker.finish();
    const start = (midi: number) => notes.find(n => n.midi === midi)?.start ?? 0;
    expect(Math.abs(start(72) - start(84))).toBeLessThan(0.3 / 30);
  });

  it('splits at middle C when the video has one colour', () => {
    const notes = track([
      { midi: 72, start: 0.5, end: 1, color: GREEN },
      { midi: 48, start: 0.5, end: 1, color: GREEN },
    ], 2);
    expect(notes.find(n => n.midi === 48)?.hand).toBe('left');
    expect(notes.find(n => n.midi === 72)?.hand).toBe('right');
  });
});

const note = (midi: number, start: number, end: number, hand: Detected['hand'] = 'right'): Detected => ({ midi, start, end, hand });

describe('findTempo', () => {
  it('finds a steady beat', () => {
    const onsets = Array.from({ length: 40 }, (_, i) => 1.3 + i * 0.5); // eighths at 60, or quarters at 120
    const { bpm, sure } = findTempo(onsets);
    expect(sure).toBe(true);
    expect([60, 120]).toContainEqual(Math.round(bpm));
  });

  it('does not halve the tempo when a few fast notes would be lost', () => {
    const beat = 60 / 140;
    const onsets = Array.from({ length: 48 }, (_, i) => i * beat);
    onsets.push(3.25 * beat, 3.5 * beat, 3.75 * beat, 9.25 * beat, 9.5 * beat, 9.75 * beat);
    onsets.sort((a, b) => a - b);
    expect(Math.round(findTempo(onsets).bpm)).toBe(140);
  });

  it('copes with notes a frame off', () => {
    const onsets = Array.from({ length: 40 }, (_, i) => i * 0.375 + (i % 3 ? 0.008 : -0.008));
    expect(findTempo(onsets).sure).toBe(true);
  });

  it('follows a player who speeds up and slows down', () => {
    const onsets: number[] = [];
    let t = 0;
    for (let i = 0; i < 64; i++) {
      onsets.push(t);
      t += 0.5 + 0.05 * Math.sin(i / 5);
    }
    const notes = onsets.map((start, i) => note(60 + (i % 5), start, start + 0.4));
    const { piece } = writeDown(notes);
    const lengths = piece.hands.right.map(eventTicks);
    const usual = Math.max(...lengths.map(ticks => lengths.filter(t => t === ticks).length));
    expect(usual / lengths.length).toBeGreaterThan(0.6);
  });

  it('admits when there is no steady beat', () => {
    const times: number[] = [];
    let t = 0;
    for (let i = 0; i < 120; i++) {
      t += 0.17 + ((i * 7919) % 97) / 311;
      times.push(t);
    }
    expect(findTempo(times).sure).toBe(false);
  });
});

describe('findKey', () => {
  it('names the key from the notes used', () => {
    const scale = (notes: number[]) => notes.map((m, i) => note(m, i, i + 1));
    expect(findKey(scale([60, 62, 64, 65, 67, 69, 71]))).toBe(0);
    expect(findKey(scale([67, 69, 71, 72, 74, 76, 78]))).toBe(1);
    expect(findKey(scale([65, 67, 69, 70, 72, 74, 76]))).toBe(-1);
  });
});

describe('writeDown', () => {
  it('turns a steady melody into exact notes', () => {
    const q = 0.5;
    const melody = [60, 62, 64, 65, 67, 65, 64, 62].map((m, i) => note(m, 2 + i * q, 2 + (i + 1) * q - 0.03));
    const { piece, sure } = writeDown(melody);
    expect(sure).toBe(true);
    expect(piece.hands.right.flatMap(e => e.keys)).toEqual([60, 62, 64, 65, 67, 65, 64, 62]);
    expect(new Set(piece.hands.right.map(eventTicks)).size).toBe(1);
  });

  it('keeps both hands in time, with a chord and a rest', () => {
    const q = 0.5;
    const notes = [
      note(72, 0, q), note(76, 0, q), note(74, q * 2, q * 3), note(72, q * 3, q * 4),
      note(48, 0, q * 2, 'left'), note(55, q * 2, q * 4, 'left'),
    ];
    const { piece } = writeDown(notes);
    expect(piece.hands.right[0].keys).toEqual([72, 76]);
    expect(piece.hands.right[1].keys).toEqual([]);
    const total = (hand: 'right' | 'left') => piece.hands[hand].reduce((sum, e) => sum + eventTicks(e), 0);
    expect(total('right')).toBe(total('left'));
  });

  it('reads bars that stop just short of the next as held notes', () => {
    const q = 0.6;
    const notes = [0, 1, 2, 3].map(i => note(60 + i, i * q, (i + 1) * q - 0.07));
    const { piece } = writeDown(notes);
    expect(piece.hands.right.map(eventTicks)).toEqual([48, 48, 48, 48]);
    expect(piece.hands.right.some(ev => !ev.keys.length)).toBe(false);
  });

  it('keeps a real rest', () => {
    const q = 0.6;
    const { piece } = writeDown([note(60, 0, q), note(62, q * 2, q * 3), note(64, q * 3, q * 4)]);
    expect(piece.hands.right.map(ev => ev.keys.length)).toEqual([1, 0, 1, 1]);
  });

  it('shifts by an octave and halves the tempo on request', () => {
    const notes = [60, 62, 64, 65].map((m, i) => note(m, i * 0.5, (i + 1) * 0.5));
    const plain = writeDown(notes);
    const changed = writeDown(notes, { octave: 1, tempoFactor: 0.5 });
    expect(changed.piece.hands.right[0].keys).toEqual([72]);
    expect(changed.bpm).toBeCloseTo(plain.bpm / 2);
  });

  it('does not lose count in a long exact piece with uneven note starts', () => {
    let seed = 11;
    const jitter = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed / 2147483647 - 0.5) * 0.03;
    };
    const eighth = 60 / 130 / 2;
    const notes = Array.from({ length: 700 }, (_, i) => {
      const start = 2 + i * eighth + jitter();
      return note(60 + [0, 4, 7, 12, 7, 4][i % 6], start, start + eighth * 0.85);
    });
    const { placed, sure, bpm } = writeDown(notes);
    expect(sure).toBe(true);
    expect(bpm).toBeCloseTo(130, 0);
    const first = [...placed].sort((a, b) => a.start - b.start);
    first.forEach((p, i) => expect(p.tick - first[0].tick).toBe(i * 24));
  });

  it('survives an empty list', () => {
    expect(writeDown([]).piece.hands.right).toEqual([]);
  });
});
