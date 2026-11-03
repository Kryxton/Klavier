// The reading against the truth, note by note: pitch, place in the bar and written length.
// The truth comes from every frame of the recording (scripts/wahrheit-aus-video.py), placed between
// the bar lines the video draws. It lies in `.messung/<name>/noten.json`, gitignored like the rest.
//   node scripts/wahrheit.mjs [name] [--liste]
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const DATA = join(ROOT, '.messung');
const bundle = join(DATA, 'lesen.mjs');
const entry = join(DATA, 'lesen-eintrag.ts');
writeFileSync(entry, ['tracker', 'sound', 'rhythm', 'hands', 'stage'].map(name => `export * from '${join(ROOT, 'src/video', name).replaceAll('\\', '/')}';`).join('\n'));
execFileSync(process.execPath, [join(ROOT, 'node_modules/esbuild/bin/esbuild'), entry, '--bundle', '--platform=node', '--format=esm', `--outfile=${bundle}`, '--log-level=warning'], { stdio: 'inherit' });
const { Tracker, StageReader, STAGE_EVERY, judge, writeDown } = await import(`${pathToFileURL(bundle).href}?${Date.now()}`);

// The page looks at the stage in the pictures it gets, at most every STAGE_EVERY seconds: with only
// every n-th picture, each picture that comes late enough takes the saved look nearest to it
const stageLooks = (looks, times, every) => {
  const chosen = new Set();
  let last = -Infinity;
  let i = 0;
  for (const time of times.filter((_, f) => f % every === 0).sort((a, b) => a - b)) {
    if (time - last < STAGE_EVERY) continue;
    while (i + 1 < looks.length && Math.abs(looks[i + 1].time - time) <= Math.abs(looks[i].time - time)) i++;
    if (Math.abs(looks[i].time - time) > 0.1) continue;
    chosen.add(i);
    last = time;
  }
  return looks.filter((_, k) => chosen.has(k));
};

const LEN = { w: 192, h: 96, q: 48, 8: 24, 16: 12, 32: 6 };
const ticksOf = e => LEN[e.dur] * (e.dotted ? 1.5 : 1);
const nm = m => 'C Cis D Dis E F Fis G Gis A B H'.split(' ')[m % 12] + (Math.floor(m / 12) - 1);
const EIGHTH = 24;

const name = process.argv.slice(2).find(a => !a.startsWith('--')) ?? 'grossformat';
const dir = join(DATA, name);
const truthFile = join(dir, 'noten.json');
if (!existsSync(truthFile)) throw new Error(`${truthFile} fehlt`);
const truth = JSON.parse(readFileSync(truthFile, 'utf8'));

const info = JSON.parse(readFileSync(join(dir, 'info.json'), 'utf8'));
const rows = readFileSync(join(dir, 'rows.bin'));
const W = info.width;
const tracker = new Tracker(info.keys);
const every = Number(process.argv.find(a => a.startsWith('--jedes='))?.slice(8) ?? 1);
info.times.forEach((time, f) => {
  if (f % every) return;
  const data = new Uint8ClampedArray(W * 4);
  for (let x = 0; x < W; x++) {
    const at = (f * W + x) * 3;
    data[x * 4] = rows[at];
    data[x * 4 + 1] = rows[at + 1];
    data[x * 4 + 2] = rows[at + 2];
    data[x * 4 + 3] = 255;
  }
  tracker.add({ data, width: W, height: 1 }, time);
});
// --buehne: the stage reading saved by scripts/buehne-probe.mjs instead of the row
// otherwise, as in the page, what the stage reading saw in Chrome where there is such a capture,
// and --zeile for the row alone
const stageFrom = () => {
  if (process.argv.includes('--buehne')) return JSON.parse(readFileSync(join(dir, 'buehne.json'), 'utf8'));
  if (process.argv.includes('--zeile') || !existsSync(join(dir, 'stage.json'))) return null;
  const stage = new StageReader(info.keys);
  stage.looks = stageLooks(JSON.parse(readFileSync(join(dir, 'stage.json'), 'utf8')), info.times, every);
  return stage.finish();
};
const staged = stageFrom();
const notes = staged?.notes ?? tracker.finish();
const raw = readFileSync(join(dir, 'rec11.f32'));
const checked = process.argv.includes('--ohne-ton') ? null : await judge(notes, staged ? [] : tracker.doubtful, new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4));
const reading = writeDown(checked?.notes ?? notes, { bars: staged?.bars });

// Every written note with its start and its length in ticks (ties joined)
const written = [];
for (const hand of ['right', 'left']) {
  let tick = 0;
  let tied = new Map(); // midi -> note still held over a tie
  for (const e of reading.piece.hands[hand]) {
    const next = new Map();
    for (const midi of e.keys) {
      const n = tied.get(midi) ?? { midi, hand, tick, end: tick };
      if (!tied.has(midi)) written.push(n);
      n.end = tick + ticksOf(e);
      if (e.tie) next.set(midi, n);
    }
    tied = next;
    tick += ticksOf(e);
  }
}

// The truth in ticks of eighths from the first bar line
// Bars drawn in the video stop a little short of the next note: a length of 0.9 eighths is an eighth
const want = truth.notes.map(n => ({
  ...n,
  // Every bar whole, as the page writes them: a short bar ends in a rest
  tick: Math.round((((n.bar - 1) * truth.eighthsPerBar + n.eighth) * EIGHTH) / 12) * 12,
  ticks: Math.max(12, Math.round(((n.len ?? 1) / 0.95) * 2) * 12),
}));

// The reading may start its count elsewhere: the shift most notes agree on
const shifts = new Map();
for (const w of written) for (const t of want) if (t.midi === w.midi && Math.abs(w.tick - t.tick) < 192 * 4) {
  const s = w.tick - t.tick;
  shifts.set(s, (shifts.get(s) ?? 0) + 1);
}
const shift = [...shifts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;

const used = new Set();
const res = { genau: 0, sechzehntelDaneben: 0, weiterDaneben: 0, fehlt: 0, laengeRichtig: 0, laengeFalsch: 0 };
const list = [];
const byKey = new Map();
written.forEach((w, i) => {
  if (!byKey.has(w.midi)) byKey.set(w.midi, []);
  byKey.get(w.midi).push(i);
});
for (const t of want) {
  const target = t.tick + shift;
  const candidates = (byKey.get(t.midi) ?? []).filter(i => !used.has(i));
  let best = -1;
  for (const i of candidates) if (best < 0 || Math.abs(written[i].tick - target) < Math.abs(written[best].tick - target)) best = i;
  const d = best < 0 ? Infinity : Math.abs(written[best].tick - target);
  const where = `T${t.bar} ${(t.eighth + 1).toFixed(1)}. Achtel ${nm(t.midi)}`;
  if (d > EIGHTH * 1.5) {
    res.fehlt++;
    list.push(`${where}: fehlt`);
    continue;
  }
  used.add(best);
  const w = written[best];
  if (d === 0) res.genau++;
  else if (d <= 12) res.sechzehntelDaneben++;
  else res.weiterDaneben++;
  if (d) list.push(`${where}: ${d > 0 ? (w.tick > target ? 'spät' : 'früh') : ''} um ${d / 12} Sechzehntel`);
  if (w.end - w.tick === t.ticks) res.laengeRichtig++;
  else {
    res.laengeFalsch++;
    if (!d) list.push(`${where}: Länge ${(w.end - w.tick) / 12} statt ${t.ticks / 12} Sechzehntel`);
  }
}
res.zuviel = written.length - used.size;
const rests = hand => reading.piece.hands[hand].filter(e => !e.keys.length).length;
console.log(`${name}: ${want.length} Noten in der Wahrheit (${truth.meter}), gelesen ${written.length} in ${reading.piece.beats}/${reading.piece.beatValue} bei ${reading.bpm.toFixed(1)} BPM, verschoben um ${shift / 12} Sechzehntel`);
console.log(JSON.stringify({ ...res, pausenRechts: rests('right'), pausenLinks: rests('left'), pausenWahrheit: truth.rests ?? null }));
if (process.argv.includes('--liste')) console.log(list.slice(0, 200).join('\n'));
