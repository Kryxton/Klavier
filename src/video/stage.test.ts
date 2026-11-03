import { describe, expect, it } from 'vitest';
import { eventTicks } from '../utils/score';
import { isBlack, keyPosition } from '../utils/notes';
import { steadyBars } from './barLines';
import type { KeyMap } from './keyboard';
import { writeDown } from './rhythm';
import { StageReader } from './stage';
import type { Detected } from './tracker';

const WIDTH = 420;
const SCAN = 200;
const UNIT = 16;
const LOW = 48;
const SPEED = 100; // rows a second
type Color = [number, number, number];

const xOf = (midi: number) => (keyPosition(midi) - keyPosition(LOW)) * UNIT + (isBlack(midi) ? 0 : UNIT / 2) + 10;
const map: KeyMap = {
  keyTop: SCAN + 30, scanY: SCAN, keyRow: SCAN + 40, unit: UNIT, fullKeyboard: false,
  keys: Array.from({ length: 25 }, (_, i) => ({ midi: LOW + i, x: xOf(LOW + i) })),
};

interface Bar { midi: number; start: number; end: number; color?: Color; letter?: boolean }

// The stage of a tutorial at `time`: bar lines at `lines` (seconds at the reading row) and bars
function stageAt(time: number, bars: Bar[], lines: number[], joined = false) {
  const data = new Uint8ClampedArray(WIDTH * SCAN * 4);
  const paint = (x0: number, y0: number, w: number, h: number, color: Color) => {
    for (let y = Math.max(0, Math.round(y0)); y < Math.min(SCAN, Math.round(y0 + h)); y++) {
      for (let x = Math.max(0, Math.round(x0)); x < Math.min(WIDTH, Math.round(x0 + w)); x++) {
        const i = (y * WIDTH + x) * 4;
        [data[i], data[i + 1], data[i + 2]] = color;
        data[i + 3] = 255;
      }
    }
  };
  paint(0, 0, WIDTH, SCAN, [6, 8, 10]);
  for (const line of lines) paint(0, SCAN - SPEED * (line - time) - 1, WIDTH, 3, [24, 26, 28]);
  for (const bar of bars) {
    const top = SCAN - SPEED * (bar.end - time);
    const bottom = SCAN - SPEED * (bar.start - time);
    const width = isBlack(bar.midi) ? UNIT * 0.6 : UNIT;
    const x = xOf(bar.midi) - width / 2;
    // A short dark gap between two notes on one key; some pictures blur it away
    paint(x, top, width, bottom - top - (joined ? 0 : 2), bar.color ?? [220, 200, 40]);
    // A letter darkens the bar across its edges, but never all of it
    if (bar.letter) paint(x + 1, bottom - 10, width - 3, 5, [40, 40, 20]);
  }
  return { data, width: WIDTH, height: SCAN };
}

function read(bars: Bar[], lines: number[], times: number[], joinedAt?: number) {
  const stage = new StageReader(map);
  for (const time of times) stage.add(stageAt(time, bars, lines, time === joinedAt), time);
  return stage.finish();
}

const looks = (every: number, until: number, jitter = 0) =>
  Array.from({ length: Math.floor(until / every) }, (_, i) => i * every + (i % 3 === 1 ? jitter : 0));
const barLines = (count: number, length: number, from = 1) => Array.from({ length: count }, (_, i) => from + i * length);

describe('StageReader', () => {
  it('measures bar lines and note starts exactly from a few looks a second', () => {
    const lines = barLines(8, 2);
    const bars: Bar[] = [
      { midi: 60, start: 1, end: 1.45 }, { midi: 64, start: 1.5, end: 1.95 },
      { midi: 67, start: 2.25, end: 2.7 }, { midi: 61, start: 3, end: 3.9 },
    ];
    const result = read(bars, lines, looks(0.3, 12, 0.01));
    expect(result).not.toBeNull();
    result?.bars.slice(0, 4).forEach((t, i) => expect(t).toBeCloseTo(lines[i], 1));
    const found = result?.notes ?? [];
    expect(found.map(n => n.midi)).toEqual([60, 64, 67, 61]);
    found.forEach((n, i) => {
      expect(Math.abs(n.start - bars[i].start)).toBeLessThan(0.03);
      expect(Math.abs(n.end - bars[i].end)).toBeLessThan(0.05);
    });
  });

  it('leaves a video without bar lines to the row', () => {
    expect(read([{ midi: 60, start: 1, end: 1.5 }], [], looks(0.12, 6))).toBeNull();
  });

  it('keeps two notes on one key apart when one picture shows them joined', () => {
    const bars: Bar[] = [{ midi: 60, start: 2, end: 2.25 }, { midi: 60, start: 2.25, end: 2.5 }];
    const result = read(bars, barLines(6, 2), looks(0.12, 10), looks(0.12, 10)[5]);
    expect(result?.notes.filter(n => n.midi === 60).map(n => Number(n.start.toFixed(1)))).toEqual([2, 2.3]);
  });

  it('reads a dim bar cut by a dark letter as one note', () => {
    const bars: Bar[] = [{ midi: 66, start: 2, end: 2.6, color: [110, 120, 10], letter: true }];
    const result = read(bars, barLines(6, 2), looks(0.12, 10));
    expect(result?.notes.map(n => n.midi)).toEqual([66]);
  });

  it('tells the hands apart by colour', () => {
    const bars: Bar[] = [
      { midi: 50, start: 1, end: 1.4, color: [220, 200, 40] }, { midi: 52, start: 1.5, end: 1.9, color: [220, 200, 40] },
      { midi: 67, start: 1, end: 1.4, color: [250, 40, 200] }, { midi: 69, start: 1.5, end: 1.9, color: [250, 40, 200] },
    ];
    const notes = read(bars, barLines(6, 2), looks(0.12, 10))?.notes ?? [];
    expect(notes.filter(n => n.hand === 'right').map(n => n.midi).sort()).toEqual([67, 69]);
  });
});

describe('steadyBars', () => {
  it('puts back a line that was missed', () => {
    expect(steadyBars([1, 3, 5, 9, 11, 13])).toEqual([1, 3, 5, 7, 9, 11, 13]);
  });

  it('takes no uneven lines for bar lines', () => {
    expect(steadyBars([1, 1.7, 4.1, 4.5, 7.9, 8.2])).toBeNull();
  });
});

describe('writeDown with bar lines', () => {
  const note = (midi: number, start: number, length: number, hand: Detected['hand'] = 'right'): Detected => ({ midi, start, end: start + length * 0.9, hand });
  const ticksOf = (events: ReturnType<typeof writeDown>['piece']['hands']['right']) => events.reduce((sum, e) => sum + eventTicks(e), 0);

  it('places running eighths into bars of 6/8 by the lines alone', () => {
    const eighth = 0.25;
    const lines = barLines(4, 6 * eighth);
    const notes = Array.from({ length: 18 }, (_, i) => note(60 + (i % 3), 1 + i * eighth + (i % 2 ? 0.02 : -0.02), eighth));
    const reading = writeDown(notes, { bars: lines });
    expect(`${reading.piece.beats}/${reading.piece.beatValue}`).toBe('6/8');
    expect(reading.bpm).toBeCloseTo(120, 0);
    expect(reading.piece.hands.right.every(e => e.dur === '8' && e.keys.length === 1)).toBe(true);
  });

  it('writes 4/4 when the notes fit four beats to the bar', () => {
    const quarter = 0.5;
    const notes = Array.from({ length: 16 }, (_, i) => note(60 + (i % 4), 1 + i * quarter, quarter));
    const reading = writeDown(notes, { bars: barLines(5, 4 * quarter) });
    expect(`${reading.piece.beats}/${reading.piece.beatValue}`).toBe('4/4');
    expect(reading.placed.map(p => p.tick)).toEqual(notes.map((_, i) => i * 48));
  });

  const bar = 144; // ticks in a bar of 6/8

  it('follows the tempo from bar to bar', () => {
    // Bars of 1.5 s, then slower ones of 1.8 s: the half bar lies elsewhere in each
    const lines = [1, 2.5, 4, 5.8, 7.6, 9.4];
    const notes = [note(60, 1, 0.25), note(62, 1.75, 0.25), note(64, 4, 0.3), note(65, 4.9, 0.3), note(67, 5.8 + 1.5, 0.3)];
    const reading = writeDown(notes, { bars: lines });
    expect(reading.placed.map(p => p.tick)).toEqual([0, 72, 2 * bar, 2 * bar + 72, 3 * bar + 120]);
  });

  it('fills a bar half as long as the others with a rest', () => {
    const lines = [1, 2.5, 4, 4.75, 6.25, 7.75];
    const notes = [note(60, 1, 0.25), note(62, 2.5, 0.25), note(64, 4, 0.25), note(65, 4.5, 0.25), note(67, 4.75, 0.25)];
    const reading = writeDown(notes, { bars: lines });
    expect(reading.placed.map(p => p.tick)).toEqual([0, bar, 2 * bar, 2 * bar + 48, 3 * bar]);
    expect(ticksOf(reading.piece.hands.right)).toBeGreaterThan(3 * bar);
  });
});
