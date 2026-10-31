import type { Hand } from '../types';
import { isBlack } from '../utils/notes';
import type { Frame, KeyMap } from './keyboard';

export interface Detected {
  midi: number;
  start: number; // seconds
  end: number;
  hand: Hand;
}

const CHANGE = 90; // sum of the colour channels: how far from the usual picture counts as a bar
const MIN_SECONDS = 0.03; // shorter flickers aren't notes
const LONG_SECONDS = 0.2; // bars this long are surely real
const NEARBY = 8; // seconds
const FAINT = 0.65; // share of a real bar's brightness below which something isn't a bar

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
};

// The colour a place has most of the time: the background. Not the median, because a key that is
// held a lot is under a bar in half of the pictures, in one colour or another. Colours are counted
// in coarse bins, on two shifted grids: a background right on a bin border would otherwise split
// in two and lose against a bar.
function usualColour(frames: Uint8Array[], place: number) {
  let best = [0, 0, 0];
  let bestCount = 0;
  for (const shift of [0, 8]) {
    const counts = new Map<number, number>();
    for (const frame of frames) {
      const bin = (c: number) => (Math.min(255, frame[place * 3 + c] + shift)) >> 4;
      const id = bin(0) << 8 | bin(1) << 4 | bin(2);
      const count = (counts.get(id) ?? 0) + 1;
      counts.set(id, count);
      if (count > bestCount) {
        bestCount = count;
        best = [(id >> 8) & 15, (id >> 4) & 15, id & 15].map(b => b * 16 + 8 - shift);
      }
    }
  }
  return best;
}

// Hue as an angle, null for colours too grey to have one
function hueOf([r, g, b]: number[]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 40) return null;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

// Two groups of hues. Only the hue counts: many tutorials use a lighter and a darker shade of one
// colour for white and black keys.
function twoHues(hues: number[]) {
  let a = hues[0];
  let b = hues.reduce((far, h) => (hueGap(h, a) > hueGap(far, a) ? h : far), a);
  for (let round = 0; round < 8; round++) {
    const mean = (group: number[], old: number) => {
      if (!group.length) return old;
      const x = group.reduce((s, h) => s + Math.cos((h * Math.PI) / 180), 0);
      const y = group.reduce((s, h) => s + Math.sin((h * Math.PI) / 180), 0);
      return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    };
    a = mean(hues.filter(h => hueGap(h, a) <= hueGap(h, b)), a);
    b = mean(hues.filter(h => hueGap(h, a) > hueGap(h, b)), b);
  }
  return { a, b };
}

// Which hand a note belongs to: by colour where the video has two, else by height
function assignHands(notes: (Omit<Detected, 'hand'> & { hue: number | null })[]): Detected[] {
  const bySplit = (midi: number): Hand => (midi >= 60 ? 'right' : 'left');
  const hues = notes.flatMap(n => (n.hue === null ? [] : [n.hue]));
  if (hues.length < 2) return notes.map(({ hue: _, ...n }) => ({ ...n, hand: bySplit(n.midi) }));

  const { a, b } = twoHues(hues);
  if (hueGap(a, b) < 25) return notes.map(({ hue: _, ...n }) => ({ ...n, hand: bySplit(n.midi) }));

  const inA = (hue: number) => hueGap(hue, a) <= hueGap(hue, b);
  const pitch = (group: typeof notes) => group.reduce((s, n) => s + n.midi, 0) / Math.max(1, group.length);
  const coloured = notes.filter(n => n.hue !== null);
  const aIsRight = pitch(coloured.filter(n => inA(n.hue as number))) >= pitch(coloured.filter(n => !inA(n.hue as number)));
  return notes.map(({ hue, ...n }) => ({
    ...n,
    hand: hue === null ? bySplit(n.midi) : inA(hue) === aIsRight ? 'right' : 'left',
  }));
}

interface Run {
  from: number;
  to: number;
}

// One falling bar, followed from picture to picture while it passes the row
interface Bar {
  run: Run;
  first: number; // frame
  last: number;
  centres: number[];
  colours: number[][];
}

// Reads the row above the keys, picture by picture. Bars are followed as whole objects: the key is
// decided once a bar has passed, from its usual place and width. Reading single pictures can't work,
// because a wide bar on a white key reaches over the black key next to it and its rounded ends look
// like narrow bars for a moment.
export class Tracker {
  private keys: KeyMap;
  private rows: Uint8Array[] = [];
  private times: number[] = [];
  private shown: boolean[] = [];
  private width = 0;

  constructor(keys: KeyMap) {
    this.keys = keys;
  }

  // Are the black keys where they should be? Transitions, ads and the end of a video have no
  // keyboard; what passes the row then isn't music. Hands hide some keys, so a majority is enough.
  private keyboardShown(row: Frame) {
    const luma = (x: number) => {
      const i = Math.max(0, Math.min(row.width - 1, Math.round(x))) * 4;
      return 0.3 * row.data[i] + 0.59 * row.data[i + 1] + 0.11 * row.data[i + 2];
    };
    const { keys, unit } = this.keys;
    const blacks = keys.filter(key => isBlack(key.midi));
    const dark = blacks.filter(key => luma(key.x) < 0.75 * Math.max(luma(key.x - unit * 0.5), luma(key.x + unit * 0.5)));
    return dark.length >= blacks.length * 0.5;
  }

  // `row` holds the pixels of the scan row, `keyRow` a row through the black keys
  add(row: Frame, time: number, keyRow?: Frame) {
    this.width = row.width;
    const rgb = new Uint8Array(row.width * 3);
    for (let x = 0; x < row.width; x++) {
      rgb[x * 3] = row.data[x * 4];
      rgb[x * 3 + 1] = row.data[x * 4 + 1];
      rgb[x * 3 + 2] = row.data[x * 4 + 2];
    }
    this.rows.push(rgb);
    this.times.push(time);
    this.shown.push(keyRow ? this.keyboardShown(keyRow) : true);
  }

  // The stretches of one row that differ from the usual picture; a wide one is several bars side by side
  private runsOf(row: Uint8Array, usual: number[][]) {
    const { unit } = this.keys;
    const runs: Run[] = [];
    let from = -1;
    for (let x = 0; x <= this.width; x++) {
      const lit = x < this.width
        && Math.abs(row[x * 3] - usual[x][0]) + Math.abs(row[x * 3 + 1] - usual[x][1]) + Math.abs(row[x * 3 + 2] - usual[x][2]) > CHANGE;
      if (lit && from < 0) from = x;
      if (!lit && from >= 0) {
        const width = x - from;
        if (width >= unit * 0.3) {
          const parts = width >= unit * 1.6 ? Math.round(width / unit) : 1;
          for (let p = 0; p < parts; p++) {
            runs.push({ from: from + (p * width) / parts, to: from + ((p + 1) * width) / parts - 1 });
          }
        }
        from = -1;
      }
    }
    return runs;
  }

  private followBars(usual: number[][]) {
    const done: Bar[] = [];
    let open: Bar[] = [];
    this.rows.forEach((row, f) => {
      const runs = this.shown[f] ? this.runsOf(row, usual) : [];
      const next: Bar[] = [];
      for (const run of runs) {
        const bar = open.find(b => {
          const overlap = Math.min(b.run.to, run.to) - Math.max(b.run.from, run.from);
          return overlap >= 0.5 * Math.min(b.run.to - b.run.from, run.to - run.from);
        });
        const centre = (run.from + run.to) / 2;
        const i = Math.round(centre) * 3;
        const colour = [row[i], row[i + 1], row[i + 2]];
        if (bar) {
          open = open.filter(b => b !== bar);
          bar.run = run;
          bar.last = f;
          bar.centres.push(centre);
          bar.colours.push(colour);
          next.push(bar);
        } else {
          next.push({ run, first: f, last: f, centres: [centre], colours: [colour] });
        }
      }
      done.push(...open);
      open = next;
    });
    done.push(...open);
    return done.filter(bar => bar.last > bar.first && this.times[bar.last] - this.times[bar.first] >= MIN_SECONDS);
  }

  // Which key a bar stands for: the nearest one. The middle of a bar is steady to a pixel or two,
  // much better than its width, which changes with glow and rounded ends.
  private keyOf(centre: number) {
    const { keys, unit } = this.keys;
    let best = keys[0];
    for (const key of keys) {
      if (Math.abs(key.x - centre) < Math.abs(best.x - centre)) best = key;
    }
    return Math.abs(best.x - centre) < unit * 0.6 ? best : null;
  }

  finish(): Detected[] {
    // Pictures read later to fill holes arrive out of order
    const order = this.times.map((_, i) => i).sort((a, b) => this.times[a] - this.times[b]);
    this.rows = order.map(i => this.rows[i]);
    this.times = order.map(i => this.times[i]);
    this.shown = order.map(i => this.shown[i]);

    const usual = Array.from({ length: this.width }, (_, x) => usualColour(this.rows, x));
    const bars = this.followBars(usual);

    const found = bars.flatMap(bar => {
      const key = this.keyOf(median(bar.centres));
      if (!key) return [];
      const colour = [0, 1, 2].map(c => median(bar.colours.map(s => s[c])));
      const place = Math.round(median(bar.centres));
      // The brightest moment counts: short bars are blurred for most of their way
      const changes = bar.colours.map(c => c.reduce((sum, value, i) => sum + Math.abs(value - usual[place][i]), 0)).sort((a, b) => a - b);
      const strength = changes[Math.floor(changes.length * 0.8)];
      return [{ key, bar, strength, hue: hueOf(colour) }];
    });

    // Sparks and dust behind the bars are much fainter than the bars. Long bars show how bright a
    // real one is, for black and white keys apart, because many videos draw them in two shades.
    // Nearby ones count first, because intros often fade in.
    const long = found.filter(f => this.times[f.bar.last] - this.times[f.bar.first] >= LONG_SECONDS);
    const reference = (f: (typeof found)[number]) => {
      const same = long.filter(l => isBlack(l.key.midi) === isBlack(f.key.midi));
      const near = same.filter(l => Math.abs(this.times[l.bar.first] - this.times[f.bar.first]) < NEARBY);
      const pool = near.length >= 3 ? near : same;
      return pool.length >= 3 ? median(pool.map(l => l.strength)) : 0;
    };
    const notes = found
      .filter(f => f.strength >= FAINT * reference(f))
      .map(f => ({ midi: f.key.midi, start: this.times[f.bar.first], end: this.times[f.bar.last], hue: f.hue }));
    // Where the bars have a colour, something white or grey is no bar: the player's pause symbol,
    // text faded in over the video
    const coloured = notes.filter(note => note.hue !== null);
    const kept = coloured.length >= notes.length * 0.7 ? coloured : notes;
    // A long bar sometimes breaks up around its edge; pieces inside it aren't notes of their own
    const whole = kept.filter(note => !kept.some(other =>
      other !== note && other.midi === note.midi && other.start <= note.start && other.end >= note.end
      && other.end - other.start > note.end - note.start));
    return assignHands(whole).sort((a, b) => a.start - b.start || a.midi - b.midi);
  }
}
