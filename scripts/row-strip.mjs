// Stacks one pixel row of every picture into a single image: time runs downwards.
// usage: node strip.mjs <video> <row> <from-s> <to-s> <out.png>
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const ffmpeg = require('ffmpeg-static');
const [VIDEO, ROW, FROM, TO, OUT] = process.argv.slice(2);
const W = 960;
const rows = await new Promise(resolve => {
  const p = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', FROM, '-to', TO, '-i', VIDEO, '-r', '30', '-vf', `scale=${W}:-2,crop=${W}:1:0:${ROW}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  const parts = [];
  p.stdout.on('data', d => parts.push(d));
  p.on('close', () => resolve(Buffer.concat(parts)));
});
const height = Math.floor(rows.length / (W * 3));
const raw = OUT + '.rgb';
writeFileSync(raw, rows);
spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${height}`, '-i', raw, '-frames:v', '1', '-vf', 'scale=960:iw*ih/iw*1.6:flags=neighbor', OUT]);
console.log('Zeilen', height);
