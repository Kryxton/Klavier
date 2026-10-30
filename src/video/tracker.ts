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
const MIN_FRAMES = 2; // shorter flickers aren't notes

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
};

// The colour a place has most of the time: the background. Not the median, because a key that is
// held a lot is under a bar in half of the pictures, in one colour or another. Colours are counted
// in coarse bins, on two shifted grids: a background right on a bin border would otherwise split
// in two and lose against a bar.
function usualColour(frames: Uint8Array[], probe: number) {
  let best = [0, 0, 0];
  let bestCount = 0;
  for (const shift of [0, 8]) {
    const counts = new Map<number, number>();
    for (const frame of frames) {
      const bin = (c: number) => (Math.min(255, frame[probe * 3 + c] + shift)) >> 4;
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

// Reads the row above the keys, picture by picture, and turns what passes there into notes: a bar
// reaching the row is a note starting, its end passing the row is the note ending.
export class Tracker {
  private keys: KeyMap;
  private probes: { key: number; x: number }[] = [];
  private frames: Uint8Array[] = [];
  private times: number[] = [];

  constructor(keys: KeyMap) {
    this.keys = keys;
    // A wide bar on a white key reaches the middle of the black key next to it. So a black key is
    // read at two places left and right of its middle: only a bar of its own covers both.
    keys.keys.forEach((key, index) => {
      if (isBlack(key.midi)) {
        this.probes.push({ key: index, x: key.x - keys.unit * 0.17 }, { key: index, x: key.x + keys.unit * 0.17 });
      } else this.probes.push({ key: index, x: key.x });
    });
  }

  // `row` holds the pixels of the scan row
  add(row: Frame, time: number) {
    const reach = Math.max(1, Math.floor(this.keys.unit * 0.06));
    const colours = new Uint8Array(this.probes.length * 3);
    this.probes.forEach((probe, p) => {
      const sum = [0, 0, 0];
      let count = 0;
      const middle = Math.round(probe.x);
      for (let x = middle - reach; x <= middle + reach; x++) {
        if (x < 0 || x >= row.width) continue;
        const i = x * 4;
        sum[0] += row.data[i];
        sum[1] += row.data[i + 1];
        sum[2] += row.data[i + 2];
        count++;
      }
      for (let c = 0; c < 3; c++) colours[p * 3 + c] = count ? sum[c] / count : 0;
    });
    this.frames.push(colours);
    this.times.push(time);
  }

  // Per frame: is this probe off its usual colour?
  private litProbes() {
    return this.probes.map((_, p) => {
      const usual = usualColour(this.frames, p);
      return this.frames.map(f =>
        Math.abs(f[p * 3] - usual[0]) + Math.abs(f[p * 3 + 1] - usual[1]) + Math.abs(f[p * 3 + 2] - usual[2]) > CHANGE);
    });
  }

  finish(): Detected[] {
    // Pictures read later to fill holes arrive out of order
    const order = this.times.map((_, i) => i).sort((a, b) => this.times[a] - this.times[b]);
    this.frames = order.map(i => this.frames[i]);
    this.times = order.map(i => this.times[i]);

    const lit = this.litProbes();
    const probesOf = (key: number) => this.probes.flatMap((probe, p) => (probe.key === key ? [p] : []));
    const whiteAt = (key: number) => probesOf(key)[0];
    const count = this.keys.keys.length;
    const litKey = this.keys.keys.map((key, k) => {
      const probes = probesOf(k);
      if (!isBlack(key.midi)) return lit[probes[0]];
      // Both white neighbours lit from two bars side by side looks the same as a black bar
      const left = k > 0 ? lit[whiteAt(k - 1)] : null;
      const right = k < count - 1 ? lit[whiteAt(k + 1)] : null;
      return this.frames.map((_, f) => lit[probes[0]][f] && lit[probes[1]][f] && !(left?.[f] && right?.[f]));
    });

    const notes: (Omit<Detected, 'hand'> & { hue: number | null })[] = [];
    this.keys.keys.forEach((key, k) => {
      const probe = probesOf(k)[0];
      let start = -1;
      for (let f = 0; f <= this.frames.length; f++) {
        const on = f < this.frames.length && litKey[k][f];
        if (on && start < 0) start = f;
        if (!on && start >= 0) {
          if (f - start >= MIN_FRAMES) {
            const span = this.frames.slice(start, f);
            const colour = [0, 1, 2].map(c => median(span.map(s => s[probe * 3 + c])));
            notes.push({ midi: key.midi, start: this.times[start], end: this.times[f - 1], hue: hueOf(colour) });
          }
          start = -1;
        }
      }
    });
    return assignHands(notes).sort((a, b) => a.start - b.start || a.midi - b.midi);
  }
}
