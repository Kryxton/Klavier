// The yardstick: real recordings through the real reading, in seconds instead of minutes.
// Every change to src/video has to hold up here on ALL recordings: a fix for one video has already
// made another one worse without anybody noticing.
//
// `.messung/<name>/` holds what real Chrome saw (rows.bin, info.json, from scripts/messlatte-aufnahme.mjs)
// and the sound (rec11.f32, mono 11025 Hz). It comes from the user's recordings, so it stays out of git.
// `.messung/<name>/wahrheit.json` says what is known about the piece:
//   step, offset: the grid of a machine-made piece, seconds per eighth and where it starts
//   from, to: the stretch where it runs on that grid
//   pattern: eighths after which it repeats, which lets holes be counted without an original
//   bar: sixteenths per bar, for how well the bar lines meet the changes of the bass
// `.messung/grenzen.json` holds the limits; `node scripts/messlatte.mjs --merken` writes today's values.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const DATA = join(ROOT, '.messung');
const bundle = join(DATA, 'lesen.mjs');
const entry = join(DATA, 'lesen-eintrag.ts');
writeFileSync(entry, ['tracker', 'sound', 'rhythm'].map(name => `export * from '${join(ROOT, 'src/video', name).replaceAll('\\', '/')}';`).join('\n'));
execFileSync(process.execPath, [join(ROOT, 'node_modules/esbuild/bin/esbuild'), entry, '--bundle', '--platform=node', '--format=esm', `--outfile=${bundle}`, '--log-level=warning'], { stdio: 'inherit' });
const { Tracker, judge, writeDown, findKey } = await import(`${pathToFileURL(bundle).href}?${Date.now()}`);

const LEN = { w: 192, h: 96, q: 48, 8: 24, 16: 12, 32: 6 };
const ticksOf = e => LEN[e.dur] * (e.dotted ? 1.5 : 1);
const nm = m => 'C Cis D Dis E F Fis G Gis A B H'.split(' ')[m % 12] + (Math.floor(m / 12) - 1);

function replay(dir) {
  const info = JSON.parse(readFileSync(join(dir, 'info.json'), 'utf8'));
  const rows = readFileSync(join(dir, 'rows.bin'));
  const W = info.width;
  const tracker = new Tracker(info.keys);
  info.times.forEach((time, f) => {
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
  // Is there anything at all in this key's lane around this time? Without that a hole is no hole:
  // the piece simply plays something else there.
  const barSeen = (midi, time) => {
    const key = info.keys.keys.find(k => k.midi === midi);
    if (!key) return false;
    const middle = Math.round(key.x);
    return info.times.some((t, f) => {
      if (Math.abs(t - time) > 0.1) return false;
      let sum = 0;
      for (let x = middle - 3; x <= middle + 3; x++) {
        const at = (f * W + x) * 3;
        sum += rows[at] + rows[at + 1] + rows[at + 2];
      }
      return sum / 7 > 120;
    });
  };
  return { notes: tracker.finish(), doubtful: tracker.doubtful, fullKeyboard: info.keys.fullKeyboard, barSeen };
}

// A hole: the keys played one pattern before and one after agree, and here there is nothing
function holes(notes, { step, offset, from, to, pattern }, barSeen) {
  const slotOf = t => Math.round((t - offset) / step);
  const timeOf = s => offset + s * step;
  const found = { expected: 0, there: 0, missing: 0, merged: 0, list: [] };
  for (const hand of ['right', 'left']) {
    const inHand = notes.filter(n => n.hand === hand);
    const at = new Map();
    for (const n of inHand) {
      const s = slotOf(n.start);
      if (Math.abs(n.start - timeOf(s)) > step / 3) continue;
      if (!at.has(s)) at.set(s, new Set());
      at.get(s).add(n.midi);
    }
    for (let s = slotOf(from); s <= slotOf(to); s++) {
      const before = at.get(s - pattern);
      const after = at.get(s + pattern);
      if (!before || !after) continue;
      for (const midi of before) {
        if (!after.has(midi)) continue;
        found.expected++;
        if (at.get(s)?.has(midi)) {
          found.there++;
          continue;
        }
        const time = timeOf(s);
        const other = notes.find(n => n.hand !== hand && n.midi === midi && Math.abs(n.start - time) < step / 2);
        if (other || !barSeen(midi, time)) continue;
        const held = inHand.find(n => n.midi === midi && n.start < time - .06 && n.end > time - .03);
        if (held) found.merged++;
        else found.missing++;
        found.list.push(`${time.toFixed(2)} ${nm(midi)} ${hand[0]}${held ? ' (verschmolzen)' : ''}`);
      }
    }
  }
  return found;
}

// Written place against the true grid: the difference has to stay the same through the whole piece
function slips(reading, { step, offset, from, to }) {
  const perEighth = reading.bpm > 100 ? 24 : 12;
  const placed = reading.placed.filter(p => p.start >= from && p.start < to).sort((a, b) => a.start - b.start);
  const values = placed.map(p => ({ t: p.start, slip: Math.round(p.tick / perEighth - (p.start - offset) / step) }));
  const counts = new Map();
  for (const { slip } of values) counts.set(slip, (counts.get(slip) ?? 0) + 1);
  const usual = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  return { off: values.filter(v => v.slip !== usual).length, of: values.length, levels: [...counts].filter(c => c[1] >= 5).length };
}

// Where the bass changes, against the bar lines: harmony mostly changes on the one
function barFit(reading, bar) {
  const left = new Map();
  let tick = 0;
  let tied = false;
  for (const e of reading.piece.hands.left) {
    if (e.keys.length && !tied) left.set(Math.round(tick / 12), Math.min(...e.keys));
    tied = Boolean(e.tie);
    tick += ticksOf(e);
  }
  const steps = [...left.keys()].sort((a, b) => a - b);
  let on = 0;
  let all = 0;
  for (const s of steps) {
    // The bass of the beat stretch before: a clear step away from it is a new chord
    const earlier = steps.filter(o => o < s && o >= s - bar / 2).map(o => left.get(o));
    if (!earlier.length || earlier.every(v => v > left.get(s) + 4)) {
      all++;
      if (s % bar === 0) on++;
    }
  }
  return { on, all };
}

const results = {};
const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
for (const name of readdirSync(DATA, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)) {
  if (only.length && !only.includes(name)) continue;
  const dir = join(DATA, name);
  if (!existsSync(join(dir, 'rows.bin'))) continue;
  const truth = existsSync(join(dir, 'wahrheit.json')) ? JSON.parse(readFileSync(join(dir, 'wahrheit.json'), 'utf8')) : {};
  const began = Date.now();
  const { notes, doubtful, barSeen } = replay(dir);
  const raw = readFileSync(join(dir, 'rec11.f32'));
  const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const checked = await judge(notes, doubtful, samples);
  const final = checked?.notes ?? notes;
  const key = findKey(final);
  const scale = [0, 2, 4, 5, 7, 9, 11].map(s => ((key * 7 + s) % 12 + 12) % 12);
  const reading = writeDown(final);
  const result = {
    noten: final.length,
    bildNoten: notes.length,
    bestaetigt: checked ? Math.round((100 * checked.hearing.heard) / notes.length) : null,
    fremd: final.filter(n => !scale.includes(n.midi % 12)).length,
    tempo: Number(reading.bpm.toFixed(1)),
    exakt: reading.sure,
    takte: `${reading.piece.beats}/${reading.piece.beatValue}`,
  };
  if (truth.step) {
    const hole = holes(final, truth, barSeen);
    const slip = slips(reading, truth);
    Object.assign(result, {
      loecher: hole.missing,
      verschmolzen: hole.merged,
      gefunden: Number(((100 * hole.there) / Math.max(1, hole.expected)).toFixed(1)),
      daneben: slip.off,
      rasterstufen: slip.levels,
    });
    if (process.argv.includes('--liste')) console.log('  Löcher:', hole.list.join(', '));
  }
  if (truth.bar) {
    const fit = barFit(reading, truth.bar);
    result.basswechselAufDerEins = fit.all ? Math.round((100 * fit.on) / fit.all) : null;
  }
  results[name] = result;
  console.log(name.padEnd(12), `${((Date.now() - began) / 1000).toFixed(1)} s`, JSON.stringify(result));
}

const limitsFile = join(DATA, 'grenzen.json');
if (process.argv.includes('--merken')) {
  writeFileSync(limitsFile, JSON.stringify(results, null, 1));
  console.log('Als Grenze gemerkt.');
} else if (existsSync(limitsFile)) {
  const limits = JSON.parse(readFileSync(limitsFile, 'utf8'));
  // What may only go down, and what may only go up
  const worseIfHigher = ['fremd', 'loecher', 'verschmolzen', 'daneben', 'rasterstufen'];
  const worseIfLower = ['bestaetigt', 'gefunden', 'basswechselAufDerEins'];
  const problems = [];
  for (const [name, result] of Object.entries(results)) {
    const limit = limits[name];
    if (!limit) continue;
    for (const field of worseIfHigher) if (result[field] > limit[field]) problems.push(`${name}: ${field} ${limit[field]} wurde zu ${result[field]}`);
    for (const field of worseIfLower) if (result[field] < limit[field]) problems.push(`${name}: ${field} ${limit[field]} wurde zu ${result[field]}`);
    if (Math.abs(result.noten - limit.noten) > limit.noten * 0.03) problems.push(`${name}: noten ${limit.noten} wurde zu ${result.noten}`);
  }
  console.log(problems.length ? `SCHLECHTER:\n  ${problems.join('\n  ')}` : 'Nichts schlechter als die Grenzen.');
  if (problems.length) process.exitCode = 1;
}
