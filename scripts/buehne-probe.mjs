// The stage reading on a video file without a browser: ffmpeg delivers the pictures at the size the
// page reads them, a few times a second. Only for trying things quickly; what counts is real Chrome.
//   node scripts/buehne-probe.mjs <video> <name in .messung, for its keyboard> [looks a second]
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const [VIDEO, NAME, RATE = '8.33'] = process.argv.slice(2);
const info = JSON.parse(readFileSync(join(ROOT, '.messung', NAME, 'info.json'), 'utf8'));
const entry = join(ROOT, '.messung', 'buehne-eintrag.ts');
const bundle = join(ROOT, '.messung', 'buehne.mjs');
writeFileSync(entry, ['stage', 'keyboard'].map(name => `export * from '${join(ROOT, 'src/video', name).replaceAll('\\', '/')}';`).join('\n'));
execFileSync(process.execPath, [join(ROOT, 'node_modules/esbuild/bin/esbuild'), entry, '--bundle', '--platform=node', '--format=esm', `--outfile=${bundle}`, '--log-level=warning'], { stdio: 'inherit' });
const { StageReader, findKeyboard } = await import(pathToFileURL(bundle).href);

const W = info.width;
const ffmpeg = join(ROOT, 'node_modules/ffmpeg-static/ffmpeg.exe'); // npm i --no-save ffmpeg-static
// The keyboard as the page finds it now, from one whole picture
const whole = execFileSync(ffmpeg, ['-loglevel', 'error', '-ss', '20', '-i', VIDEO, '-frames:v', '1', '-vf', `scale=${W}:-2`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1e8 });
const keys = findKeyboard({ data: whole, width: W, height: whole.length / 4 / W }) ?? info.keys;
const H = keys.scanY;
const proc = spawn(ffmpeg, ['-loglevel', 'error', '-i', VIDEO, '-vf', `fps=${RATE},scale=${W}:-2,crop=${W}:${H}:0:0`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-']);
const stage = new StageReader(keys);
const size = W * H * 4;
let buffer = Buffer.alloc(0);
let n = 0;
const began = Date.now();
let spent = 0;
for await (const chunk of proc.stdout) {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= size) {
    const t0 = performance.now();
    stage.add({ data: buffer.subarray(0, size), width: W, height: H }, n / Number(RATE));
    spent += performance.now() - t0;
    buffer = buffer.subarray(size);
    n++;
  }
}
const result = stage.finish();
console.log(`${n} Blicke, ${(spent / n).toFixed(1)} ms je Blick, ${((Date.now() - began) / 1000).toFixed(0)} s`);
if (!result) {
  console.log('keine Taktlinien');
  process.exit(0);
}
const { notes, bars } = result;
console.log(`${bars.length} Takte, ${notes.length} Noten, Takt ${(bars[1] - bars[0]).toFixed(4)} s`);
writeFileSync(join(ROOT, '.messung', NAME, 'buehne.json'), JSON.stringify(result));
