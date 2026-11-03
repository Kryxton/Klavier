import { isBlack } from '../utils/notes';
import { linesIn, steadyBars } from './barLines';
import type { Frame, KeyMap } from './keyboard';
import { assignHands, hueOf, type Coloured, type Detected } from './tracker';

// The whole stage above the keys, a few times a second, instead of one row in every picture. Every
// bar is seen in many pictures and lies between the bar lines the video draws, so where a note starts
// comes out to a few milliseconds however few pictures the device delivers. Used where a video draws
// bar lines; everything else goes by the row.

export const STAGE_EVERY = 0.12; // seconds of video between looks at the stage
const LIT = 60; // brightest channel of a bar on the dark stage
const BODY = 40; // a letter darkens a bar, but never down to the stage
const EDGE = { white: 0.3, black: 0.19 }; // key widths from the middle where a bar's edges are tried
const MIDDLE = { white: 0.24, black: 0.14 }; // key widths around the middle, the letter's place
const LETTER_GAP = 0.42; // key widths a letter may cut a bar for
const TOP_FADE = 0.015; // share of the height at the top where pictures fade in
const GLOW = 0.5; // key widths above the bottom where landing notes glow and two notes on one key meet
const SAME_LINE = 0.01; // share of the height within which a line seen in two pictures is the same
const SEEN = 0.3; // seconds something has to be seen for to be a note or a line
const NO_LINES = 3; // seconds without a bar line after which bars aren't looked for
const COLUMNS = 9; // columns the bar lines are looked for in
const NEXT_NOTE = 0.02; // share of the height: bottoms further apart than this are two notes

interface Run { midi: number; top: number; bottom: number; colour: number[] }
interface Look { time: number; lines: number[]; runs: Run[] }

const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1];

export class StageReader {
  private looks: Look[] = [];
  private lanes: { midi: number; x: number; black: boolean; left: number; right: number }[];
  private columns: number[];
  private lastLine = 0; // when a bar line was last seen

  constructor(private map: KeyMap) {
    const index = new Map(map.keys.map((k, i) => [k.midi, i]));
    this.lanes = map.keys.map(k => ({
      ...k, black: isBlack(k.midi), left: index.get(k.midi - 1) ?? -1, right: index.get(k.midi + 1) ?? -1,
    }));
    const first = map.keys[0].x;
    const last = map.keys[map.keys.length - 1].x;
    this.columns = Array.from({ length: COLUMNS }, (_, i) => Math.round(first + ((last - first) * (i + 0.5)) / COLUMNS));
  }

  // `frame`: the stage from the top of the picture down to the reading row, at the map's scale
  add(frame: Frame, time: number) {
    const { width, height, data } = frame;
    const lines = linesIn(frame, this.columns);
    if (lines.length) this.lastLine = time;
    // A video without bar lines goes by the row: looking for bars here would only cost time
    if (time - this.lastLine > NO_LINES) {
      this.looks.push({ time, lines, runs: [] });
      return;
    }
    const brightest = (x: number, y: number) => {
      const at = (y * width + Math.min(width - 1, Math.max(0, Math.round(x)))) * 4;
      return Math.max(data[at], data[at + 1], data[at + 2]);
    };
    const unit = this.map.unit;
    const lanes = this.lanes;
    const full = lanes.map(lane => {
      const kind = lane.black ? 'black' : 'white';
      const edge = EDGE[kind] * unit;
      const middle = MIDDLE[kind] * unit;
      const rows = new Uint8Array(height);
      for (let y = 0; y < height; y++) {
        if (brightest(lane.x - edge, y) <= LIT || brightest(lane.x + edge, y) <= LIT) continue;
        for (let x = Math.round(lane.x - middle); x <= lane.x + middle; x++) {
          if (brightest(x, y) > LIT) {
            rows[y] = 1;
            break;
          }
        }
      }
      return rows;
    });
    // A black key's lane lies over the edges of both white neighbours: both lit is a second, not it
    lanes.forEach((lane, i) => {
      if (!lane.black || lane.left < 0 || lane.right < 0) return;
      for (let y = 0; y < height; y++) if (full[lane.left][y] && full[lane.right][y]) full[i][y] = 0;
    });

    const runs: Run[] = [];
    lanes.forEach((lane, i) => {
      const edge = EDGE[lane.black ? 'black' : 'white'] * unit;
      const body = (y: number) => {
        let most = 0;
        for (let x = Math.round(lane.x - edge); x <= lane.x + edge; x++) most = Math.max(most, brightest(x, y));
        return most;
      };
      const found: [number, number][] = [];
      for (let y = 0; y < height; y++) {
        if (!full[i][y]) continue;
        const from = y;
        while (y < height && full[i][y]) y++;
        const last = found[found.length - 1];
        // A dark letter across a dim bar cuts it; between two notes the lane goes dark
        let bridged = Boolean(last) && from - last[1] <= LETTER_GAP * unit;
        for (let gap = last?.[1] ?? 0; bridged && gap < from; gap++) if (body(gap) <= BODY) bridged = false;
        if (bridged) last[1] = y;
        else found.push([from, y]);
      }
      for (const [top, bottom] of found) {
        if (bottom - top < 3) continue;
        // The colour of the bar's edges, where no letter is
        let best = [0, 0, 0];
        for (let y = top; y < bottom; y++) {
          for (const x of [lane.x - edge, lane.x + edge]) {
            const at = (y * width + Math.round(x)) * 4;
            const colour = [data[at], data[at + 1], data[at + 2]];
            const spread = (c: number[]) => Math.max(...c) - Math.min(...c);
            if (spread(colour) > spread(best)) best = colour;
          }
        }
        runs.push({ midi: lane.midi, top, bottom, colour: best });
      }
    });
    this.looks.push({ time, lines, runs });
  }

  // Notes with their times at the reading row, and when each bar starts there. Null if the video
  // draws no bar lines: then the row decides.
  finish(): { notes: Detected[]; bars: number[] } | null {
    const height = this.map.scanY;
    // Holes in the video are read again at the end, out of order
    this.looks.sort((a, b) => a.time - b.time);
    const first = this.speed();
    if (!first) return null;
    // From one look to the next a line moves only a few rows: over all the time it is seen, its
    // path gives the speed far more exactly
    const slopes = this.lineGroups(first).flatMap(group => {
      const times = group.map(p => p.time);
      if (Math.max(...times) - Math.min(...times) < 1) return [];
      const mt = times.reduce((s, t) => s + t, 0) / times.length;
      const my = group.reduce((s, p) => s + p.y, 0) / group.length;
      const tt = group.reduce((s, p) => s + (p.time - mt) ** 2, 0);
      return [group.reduce((s, p) => s + (p.time - mt) * (p.y - my), 0) / tt];
    });
    const speed = slopes.length >= 3 ? median(slopes) : first;
    const lineU = this.lineGroups(speed).map(group => median(group.map(p => p.y - speed * p.time)));
    const crossings = lineU.map(u => (height - u) / speed).sort((a, b) => a - b);
    const bars = steadyBars(crossings);
    if (!bars) return null;

    // Recorded pictures carry uneven times: the lines in a picture say where it really is
    const shiftOf = (look: Look) => {
      const shifts = look.lines.flatMap(y => {
        const u = y - speed * look.time;
        const near = lineU.reduce((best, l) => (Math.abs(l - u) < Math.abs(best - u) ? l : best), Infinity);
        return Math.abs(near - u) <= SAME_LINE * height * 2 ? [u - near] : [];
      });
      return shifts.length ? median(shifts) : 0;
    };

    // Each run as the stretch of the tape it covers; where it is cut, its end is unknown
    const glow = height - GLOW * this.map.unit;
    const fade = TOP_FADE * height;
    const pieces = new Map<number, { low: number; bottom: number | null; top: number | null; time: number; colour: number[] }[]>();
    for (const look of this.looks) {
      const shift = shiftOf(look);
      const tape = (y: number) => y - speed * look.time - shift;
      for (const run of look.runs) {
        if (run.top >= glow) continue;
        const bottom = Math.min(run.bottom, glow);
        const piece = {
          low: tape(run.top), time: look.time, colour: run.colour,
          bottom: run.bottom < glow ? tape(bottom) : null, top: run.top > fade ? tape(run.top) : null,
        };
        if (!pieces.has(run.midi)) pieces.set(run.midi, []);
        pieces.get(run.midi)?.push(piece);
      }
    }

    // A note is where bottoms gather. Each top belongs to the nearest bottom below it: a picture in
    // which two notes on one key run together can't join them that way.
    const coloured: Coloured[] = [];
    for (const [midi, list] of pieces) {
      const seen = list.filter(p => p.bottom !== null).sort((a, b) => (a.bottom as number) - (b.bottom as number));
      const notes: (typeof list)[] = [];
      for (const piece of seen) {
        const last = notes[notes.length - 1];
        if (last && (piece.bottom as number) - (last[last.length - 1].bottom as number) <= NEXT_NOTE * height) last.push(piece);
        else notes.push([piece]);
      }
      const bottoms = notes.map(note => median(note.map(p => p.bottom as number)));
      const tops = notes.map((): number[] => []);
      for (const piece of list) {
        if (piece.top === null) continue;
        const owner = bottoms.findIndex(b => b > (piece.top as number));
        if (owner >= 0) tops[owner].push(piece.top);
      }
      notes.forEach((note, i) => {
        const times = note.map(p => p.time);
        if (Math.max(...times) - Math.min(...times) < SEEN) return;
        const top = tops[i].length ? median(tops[i]) : Math.min(...note.map(p => p.low));
        const colour = [0, 1, 2].map(c => median(note.map(p => p.colour[c])));
        coloured.push({ midi, start: (height - bottoms[i]) / speed, end: (height - top) / speed, hue: hueOf(colour) });
      });
    }
    coloured.sort((a, b) => a.start - b.start || a.midi - b.midi);
    return { notes: assignHands(coloured)[0], bars };
  }

  // The sightings of each bar line: the same once the motion is taken out
  private lineGroups(speed: number) {
    const tolerance = SAME_LINE * this.map.scanY;
    const placed = this.looks.flatMap(look => look.lines.map(y => ({ y, time: look.time, u: y - speed * look.time })));
    placed.sort((a, b) => a.u - b.u);
    const groups: (typeof placed)[] = [];
    for (const p of placed) {
      const last = groups[groups.length - 1];
      if (last && p.u - last[last.length - 1].u <= tolerance) last.push(p);
      else groups.push([p]);
    }
    return groups.filter(group => {
      const times = group.map(p => p.time);
      return Math.max(...times) - Math.min(...times) >= SEEN;
    });
  }

  // How fast the picture moves down, in rows a second: each line a little further on in the next look
  private speed() {
    const speeds: number[] = [];
    for (let i = 1; i < this.looks.length; i++) {
      const dt = this.looks[i].time - this.looks[i - 1].time;
      if (dt <= 0) continue;
      for (const y of this.looks[i - 1].lines) {
        let best = Infinity;
        for (const next of this.looks[i].lines) if (next - y >= -0.5 && next - y < best) best = next - y;
        if (best < this.map.scanY / 2) speeds.push(Math.max(0, best) / dt);
      }
    }
    return speeds.length >= 10 ? median(speeds) : null;
  }
}
