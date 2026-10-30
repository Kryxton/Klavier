// Writes a tutorial-style MP4 (H.264) from a known piece, frame by frame, plus the truth as JSON.
// usage: node makevideo.mjs <out-dir> [name] [fps] [bpm] [style]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const ffmpeg = require('ffmpeg-static');

const [OUT, NAME = 'tutorial', FPS_TEXT = '30', BPM_TEXT = '100', STYLE = 'plain'] = process.argv.slice(2);
const FPS = Number(FPS_TEXT);
const BPM = Number(BPM_TEXT);
const W = 1280, H = 720, TOP = 590, SPEED = 260, LEAD = 3.2;

const Q = 48, E = 24, Hf = 96, S = 12;
const right = [], left = [];
const put = (list, tick, keys, length) => { for (const midi of keys) list.push({ midi, tick, length }); };
let t = 0;
for (const [keys, length] of [
  [[76], E], [[74], E], [[72], Q], [[67], Q], [[72], Q],
  [[76, 79], Q], [[74], E], [[72], E], [[74], Hf],
  [[72], S], [[74], S], [[76], E], [[77], Q], [[79], Q], [[81], Q],
  [[79, 84], Hf], [[78], Q], [[79], Q],
  [[76], Q], [[75], Q], [[76], Hf],
  [[72], Q], [[71], E], [[69], E], [[67], Hf],
  [[64], E], [[65], E], [[67], Q], [[72], Hf],
  [[72, 76, 79], Hf + Q], [[], Q],
]) {
  put(right, t, keys, length);
  t += length;
}
t = 0;
for (const keys of [[48], [55, 59], [41], [53, 57], [43], [55, 59], [48], [52, 55], [45], [52, 57], [41], [53, 57], [43], [50, 55], [48, 55], []]) {
  put(left, t, keys, Hf);
  t += Hf;
}
const secondsOf = tick => (tick * 60) / (BPM * 48);
const total = secondsOf(t) + LEAD + 1.5;
const notes = [...right.map(n => ({ ...n, hand: 'r' })), ...left.map(n => ({ ...n, hand: 'l' }))]
  .map(n => ({ ...n, start: LEAD + secondsOf(n.tick), end: LEAD + secondsOf(n.tick + n.length) - 0.04 }));

const black = m => [1, 3, 6, 8, 10].includes(m % 12);
const below = m => { let c = 0; for (let k = 21; k < m; k++) if (!black(k)) c++; return c; };
const unit = W / 52;
const xOf = m => below(m) * unit;

const hex = text => [1, 3, 5].map(i => parseInt(text.slice(i, i + 2), 16));
const frame = Buffer.alloc(W * H * 3);
function rect(x0, y0, w, h, c) {
  const x1 = Math.min(W, Math.round(x0 + w)), y1 = Math.min(H, Math.round(y0 + h));
  for (let y = Math.max(0, Math.round(y0)); y < y1; y++) {
    for (let x = Math.max(0, Math.round(x0)); x < x1; x++) {
      const i = (y * W + x) * 3;
      frame[i] = c[0]; frame[i + 1] = c[1]; frame[i + 2] = c[2];
    }
  }
}
const COLORS = STYLE === 'one'
  ? { r: [hex('#4fe07f'), hex('#2c9a54')], l: [hex('#4fe07f'), hex('#2c9a54')] }
  : { r: [hex('#4fe07f'), hex('#2c9a54')], l: [hex('#5a97f2'), hex('#2a62c0')] };
const WHITE = hex('#f4f3ee'), KEY_BLACK = hex('#111111'), LINE = hex('#7a1f1f');

function draw(time) {
  // A soft background that changes a little, like most tutorials
  for (let y = 0; y < TOP; y++) {
    const shade = Math.round(16 + (y / TOP) * 14);
    const c = [shade, shade + 4, shade + 22];
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      frame[i] = c[0]; frame[i + 1] = c[1]; frame[i + 2] = c[2];
    }
  }
  for (const n of notes) {
    const bottom = TOP - (n.start - time) * SPEED;
    const top = TOP - (n.end - time) * SPEED;
    if (bottom < 0 || top > TOP) continue;
    const b = black(n.midi);
    const c = COLORS[n.hand][b ? 1 : 0];
    const y0 = Math.max(0, top), y1 = Math.min(TOP, bottom);
    rect(b ? xOf(n.midi) - unit * 0.3 : xOf(n.midi) + 1, y0, b ? unit * 0.6 : unit - 2, y1 - y0, c);
  }
  rect(0, TOP - 3, W, 3, LINE);
  const lit = notes.filter(n => time >= n.start && time < n.end);
  for (let m = 21; m <= 108; m++) {
    if (black(m)) continue;
    const on = lit.find(n => n.midi === m);
    rect(xOf(m), TOP, unit - 1, H - TOP, on ? COLORS[on.hand][0] : WHITE);
  }
  for (let m = 21; m <= 108; m++) {
    if (!black(m)) continue;
    const on = lit.find(n => n.midi === m);
    rect(xOf(m) - unit * 0.3, TOP, unit * 0.6, (H - TOP) * 0.62, on ? COLORS[on.hand][1] : KEY_BLACK);
  }
  if (STYLE === 'sparks') {
    // Little sparks where notes land
    for (const n of lit) {
      for (let i = 0; i < 6; i++) {
        const seed = Math.sin(n.midi * 13 + i * 7 + time * 40) * 43758.5;
        const r = seed - Math.floor(seed);
        rect(xOf(n.midi) + r * unit, TOP - 8 - r * 60, 3, 3, [255, 240, 180]);
      }
    }
  }
}

const file = join(OUT, `${NAME}.mp4`);
const encoder = spawn(ffmpeg, [
  '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file,
], { stdio: ['pipe', 'inherit', 'inherit'] });
const frames = Math.round(total * FPS);
for (let f = 0; f < frames; f++) {
  draw(f / FPS);
  if (!encoder.stdin.write(Buffer.from(frame))) await new Promise(r => encoder.stdin.once('drain', r));
}
encoder.stdin.end();
await new Promise(r => encoder.on('close', r));
writeFileSync(join(OUT, `${NAME}.json`), JSON.stringify({ right, left, bpm: BPM }));
console.log('fertig', file, frames, 'Bilder');
