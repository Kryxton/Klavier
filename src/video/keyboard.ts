import { HIGHEST, LOWEST, isBlack, keyPosition } from '../utils/notes';

// A picture or a slice of one, RGBA like ImageData
export interface Frame {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

// Where the keys are in the video
export interface KeyMap {
  keyTop: number; // first pixel row of the keys
  scanY: number; // the row just above them, where the falling bars are read
  keyRow: number; // a row through the black keys
  unit: number; // width of a white key in pixels
  keys: { midi: number; x: number }[];
  fullKeyboard: boolean; // 88 keys: the octave is certain, otherwise it is a good guess
}

const luma = (frame: Frame, x: number, y: number) => {
  const i = (y * frame.width + x) * 4;
  return 0.3 * frame.data[i] + 0.59 * frame.data[i + 1] + 0.11 * frame.data[i + 2];
};

// Centres of the dark stretches of one pixel row
function darkCentres(frame: Frame, y: number) {
  let low = 255;
  let high = 0;
  const row: number[] = [];
  for (let x = 0; x < frame.width; x++) {
    const value = luma(frame, x, y);
    row.push(value);
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  if (high - low < 80) return [];
  const middle = (low + high) / 2;
  const runs: { centre: number; width: number }[] = [];
  let start = -1;
  for (let x = 0; x <= frame.width; x++) {
    const dark = x < frame.width && row[x] < middle;
    if (dark && start < 0) start = x;
    if (!dark && start >= 0) {
      // A stretch touching the edge of the picture isn't a key
      if (start > 0 && x < frame.width) runs.push({ centre: (start + x - 1) / 2, width: x - start });
      start = -1;
    }
  }
  if (runs.length < 5) return [];
  const widths = runs.map(r => r.width).sort((a, b) => a - b);
  const typical = widths[widths.length >> 1];
  if (typical < 2) return [];
  return runs.filter(r => r.width > typical * 0.6 && r.width < typical * 1.6).map(r => r.centre);
}

interface Pattern {
  centres: number[];
  pitchClasses: number[]; // of each black key, C♯ = 1
}

// Black keys come in groups of two and three: the only pattern that names the keys. Returns the
// longest stretch of a row that follows it.
function readPattern(centres: number[]): Pattern | null {
  if (centres.length < 7) return null;
  const gaps = centres.slice(1).map((c, i) => c - centres[i]);
  const smallest = Math.min(...gaps);
  const near = gaps.filter(g => g < smallest * 1.5).sort((a, b) => a - b);
  const unit = near[near.length >> 1];

  // Keep the longest run of gaps that are one or two white keys wide
  let best = { from: 0, to: 0 };
  let from = 0;
  gaps.forEach((gap, i) => {
    const ratio = gap / unit;
    if (ratio < 0.7 || ratio > 2.6) from = i + 1;
    else if (i + 1 - from > best.to - best.from) best = { from, to: i + 1 };
  });
  const kept = centres.slice(best.from, best.to + 1);
  if (kept.length < 7) return null;

  const groups: number[][] = [[]];
  kept.forEach((_, i) => {
    groups[groups.length - 1].push(i);
    if (i < kept.length - 1 && kept[i + 1] - kept[i] > unit * 1.5) groups.push([]);
  });
  if (groups.length < 3) return null;

  // Groups between the outermost two are complete and have to alternate 2, 3, 2, 3 …
  const inner = groups.slice(1, -1);
  if (inner.some(g => g.length !== 2 && g.length !== 3)) return null;
  if (inner.some((g, i) => i > 0 && g.length === inner[i - 1].length)) return null;

  const pitchClasses = new Array<number>(kept.length);
  const reference = inner[0];
  const start = reference.length === 2 ? 1 : 6;
  const order = [1, 3, 6, 8, 10]; // C♯ D♯ F♯ G♯ A♯
  const at = order.indexOf(start);
  reference.forEach((index, i) => { pitchClasses[index] = order[at + i]; });
  for (let i = reference[0] - 1, step = at - 1; i >= 0; i--, step--) pitchClasses[i] = order[((step % 5) + 5) % 5];
  const last = reference[reference.length - 1];
  for (let i = last + 1, step = at + reference.length; i < kept.length; i++, step++) pitchClasses[i] = order[step % 5];
  return { centres: kept, pitchClasses };
}

// Octaves of the black keys, by walking up from a first octave
function assignMidi(pattern: Pattern, base: number) {
  let midi = base + pattern.pitchClasses[0];
  return pattern.pitchClasses.map((pc, i) => {
    if (i > 0) {
      const step = (pc - pattern.pitchClasses[i - 1] + 12) % 12;
      midi += step;
    }
    return midi;
  });
}

function fitLine(points: { u: number; x: number }[]) {
  const n = points.length;
  const su = points.reduce((s, p) => s + p.u, 0);
  const sx = points.reduce((s, p) => s + p.x, 0);
  const suu = points.reduce((s, p) => s + p.u * p.u, 0);
  const sux = points.reduce((s, p) => s + p.u * p.x, 0);
  const slope = (n * sux - su * sx) / (n * suu - su * su);
  return { slope, offset: (sx - slope * su) / n };
}

// Finds the keyboard in one picture, or null. Searches the lower part of the picture.
export function findKeyboard(frame: Frame): KeyMap | null {
  let bestRow = -1;
  let best: Pattern | null = null;
  for (let y = frame.height - 1; y >= Math.floor(frame.height * 0.3); y--) {
    const pattern = readPattern(darkCentres(frame, y));
    if (pattern && (!best || pattern.centres.length > best.centres.length)) {
      best = pattern;
      bestRow = y;
    }
  }
  if (!best) return null;

  // Straight up to where the black keys start. Their tops are free: hands only hide the lower
  // part of the keys, where the search above often ends up.
  const reach = (best.centres[best.centres.length - 1] - best.centres[0]) / best.centres.length / 2;
  const blackHere = (y: number) => {
    const dark = best.centres.filter(x => {
      const beside = Math.max(luma(frame, Math.round(Math.max(0, x - reach)), y), luma(frame, Math.round(Math.min(frame.width - 1, x + reach)), y));
      return luma(frame, Math.round(x), y) < beside * 0.7;
    });
    return dark.length >= best.centres.length * 0.6;
  };
  let keyTop = bestRow;
  while (keyTop > 0 && blackHere(keyTop - 1)) keyTop--;

  // The octave: certain with all 36 black keys, otherwise the keyboard is taken to sit around the
  // middle of the piano
  const full = best.centres.length === 36;
  const first = full ? 12 : 0;
  let black = assignMidi(best, first);
  if (!full) {
    const shift = Math.round(((black[0] + black[black.length - 1]) / 2 - 63) / 12) * 12;
    black = black.map(m => m - shift);
  }
  if (black[0] < LOWEST || black[black.length - 1] > HIGHEST) return null;

  const { slope, offset } = fitLine(black.map((midi, i) => ({ u: keyPosition(midi), x: best.centres[i] })));
  // Black keys don't sit where an even keyboard would put them, and bars are drawn over the keys:
  // where one was seen, that place counts
  const seen = new Map(black.map((midi, i) => [midi, best.centres[i]]));
  const keys: KeyMap['keys'] = [];
  for (let midi = LOWEST; midi <= HIGHEST; midi++) {
    const x = seen.get(midi) ?? offset + slope * (keyPosition(midi) + (isBlack(midi) ? 0 : 0.5));
    if (x >= 0 && x < frame.width) keys.push({ midi, x });
  }
  // Three key widths above the keys: bars look the same everywhere, but landing notes flash and
  // glow right over the keys. Only when the note starts is shifted, by the same amount for all.
  return {
    keyTop, scanY: Math.max(0, keyTop - Math.max(2, Math.round(slope * 3))), keyRow: Math.min(frame.height - 1, keyTop + Math.round(slope)),
    unit: slope, keys, fullKeyboard: full,
  };
}
