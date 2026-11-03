import type { Frame } from './keyboard';

// Many tutorials draw a faint line across the falling notes at every bar. Where those lines cross the
// reading row says where each bar starts: nothing about bars or tempo has to be guessed from the notes.

const LIFT = 6; // brightness (0-255) a line rises above the usual dark of its picture
const NOTE_LEVEL = 60; // brighter than this is a note, not a line
const THICKEST = 0.015; // share of the picture's height a line may be thick
const ENOUGH_LINES = 4;
const STEADY = 0.12; // how far the time between two lines may differ from a whole number of the usual one

const brightness = (frame: Frame, x: number, y: number) => {
  const at = (y * frame.width + x) * 4;
  return (frame.data[at] + frame.data[at + 1] + frame.data[at + 2]) / 3;
};

// The middle of each line in one picture, looked for in the columns `xs`. Notes cross a few of them
// at most, so the median of a row is what lies behind them.
export function linesIn(frame: Frame, xs: number[]): number[] {
  const level = new Float32Array(frame.height);
  const values = new Array<number>(xs.length);
  for (let y = 0; y < frame.height; y++) {
    xs.forEach((x, i) => { values[i] = brightness(frame, x, y); });
    values.sort((a, b) => a - b);
    level[y] = values[values.length >> 1];
  }
  const usual = [...level].sort((a, b) => a - b)[frame.height >> 1];
  const lifted = (y: number) => level[y] - usual >= LIFT / 2 && level[y] < NOTE_LEVEL;
  const thickest = Math.max(2, Math.round(THICKEST * frame.height));
  const lines: number[] = [];
  let y = 0;
  while (y < frame.height) {
    if (!lifted(y)) {
      y++;
      continue;
    }
    const from = y;
    while (y < frame.height && lifted(y)) y++;
    let weight = 0;
    let sum = 0;
    let peak = 0;
    for (let row = from; row < y; row++) {
      const w = level[row] - usual;
      weight += w;
      sum += w * row;
      peak = Math.max(peak, w);
    }
    // Cut off at the top or the bottom, a line's middle can't be told
    if (y - from <= thickest && peak >= LIFT && from > 0 && y < frame.height) lines.push(sum / weight);
  }
  return lines;
}

// Bar lines come at a steady pace, though the tempo may drift and a bar may be short. A line missed
// in between is put back; times without such a pace are no bar lines.
export function steadyBars(crossings: number[]): number[] | null {
  if (crossings.length < ENOUGH_LINES) return null;
  const gaps = crossings.slice(1).map((t, i) => t - crossings[i]);
  const usual = [...gaps].sort((a, b) => a - b)[gaps.length >> 1];
  const whole = (g: number) => Math.abs(g / usual - Math.round(g / usual)) <= STEADY && Math.round(g / usual) >= 1;
  if (gaps.filter(whole).length < 0.9 * gaps.length) return null;
  const bars = [crossings[0]];
  for (const t of crossings.slice(1)) {
    const last = bars[bars.length - 1];
    const count = Math.round((t - last) / usual);
    for (let k = 1; k < count; k++) bars.push(last + ((t - last) * k) / count);
    bars.push(t);
  }
  return bars;
}
