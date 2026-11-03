// Saves what real Chrome sees of a recording, for scripts/messlatte.mjs: the rows of every picture,
// their times, the keyboard and the sound. Takes as long as the video.
// Needs a freshly started dev server (a file changed since would be loaded twice):
//   npx vite --port 5191 --strictPort
//   node scripts/messlatte-aufnahme.mjs <name> <video file>
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [NAME, VIDEO] = process.argv.slice(2);
const URL_ = 'http://localhost:5191/';
const PORT = 9352;
const OUT = join(resolve(import.meta.dirname, '..'), '.messung', NAME);
mkdirSync(OUT, { recursive: true });

const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(OUT, 'profile')}`,
  '--no-first-run', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', 'about:blank',
], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try {
    target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(t => t.type === 'page');
  } catch { /* not up yet */ }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let nextId = 1;
const waiting = new Map();
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) {
    waiting.get(m.id)(m);
    waiting.delete(m.id);
  }
};
const send = (method, params = {}) => new Promise(r => {
  const id = nextId++;
  waiting.set(id, r);
  ws.send(JSON.stringify({ id, method, params }));
});
const run = async expression => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? JSON.stringify(r.result.exceptionDetails));
  return r.result.result.value;
};

await send('Runtime.enable');
await send('Page.enable');
await send('DOM.enable');
await send('Page.navigate', { url: URL_ });
await sleep(2500);
await run(`(() => { const i = document.createElement('input'); i.type = 'file'; i.id = 'probe'; document.body.appendChild(i); })()`);
const doc = await send('DOM.getDocument');
const node = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '#probe' });
await send('DOM.setFileInputFiles', { nodeId: node.result.nodeId, files: [VIDEO] });

const info = JSON.parse(await run(`(async () => {
  const { Tracker } = await import('/src/video/tracker.ts');
  const { StageReader } = await import('/src/video/stage.ts');
  const { readVideo } = await import('/src/video/readVideo.ts');
  // The row reading runs always, but where the stage finds bar lines its result isn't asked for
  const add = Tracker.prototype.add;
  Tracker.prototype.add = function (...args) { window.__t = this; return add.apply(this, args); };
  const finishStage = StageReader.prototype.finish;
  StageReader.prototype.finish = function () { window.__stage = this; return finishStage.call(this); };
  const result = await readVideo(document.getElementById('probe').files[0], () => {});
  const t = window.__t;
  return JSON.stringify({ count: result.notes.length, hearing: result.hearing, frames: t.times.length, width: t.width, times: t.times, keys: t.keys, shown: t.shown });
})()`));
writeFileSync(join(OUT, 'info.json'), JSON.stringify(info));
// What the stage reading saw: its bar lines and bars, a few times a second
writeFileSync(join(OUT, 'stage.json'), await run('JSON.stringify(window.__stage.looks)'));
console.log(NAME, 'Noten', info.count, 'Bilder', info.frames, 'pro Sekunde', (info.frames / info.times.at(-1)).toFixed(1));

const inChunks = async (expression, chunks, chunk) => {
  const parts = [];
  for (let i = 0; i < chunks; i++) {
    parts.push(Buffer.from(await run(`(() => { const all = ${expression}(${i * chunk}, ${chunk}); let s = ''; for (let i = 0; i < all.length; i += 30000) s += String.fromCharCode(...all.subarray(i, i + 30000)); return btoa(s); })()`), 'base64'));
  }
  return Buffer.concat(parts);
};
const rows = await inChunks(`((from, count) => { const rows = __t.rows.slice(from, from + count); const all = new Uint8Array(rows.length * rows[0].length); rows.forEach((r, i) => all.set(r, i * r.length)); return all; })`, Math.ceil(info.frames / 500), 500);
writeFileSync(join(OUT, 'rows.bin'), rows);

const samples = await run(`(async () => {
  const { soundOf } = await import('/src/video/sound.ts');
  window.__s = await soundOf(document.getElementById('probe').files[0]);
  return window.__s ? window.__s.length : 0;
})()`);
if (samples) {
  const size = 2000000;
  const sound = await inChunks(`((from, count) => new Uint8Array(__s.buffer, from, Math.min(count, __s.byteLength - from)))`, Math.ceil((samples * 4) / size), size);
  writeFileSync(join(OUT, 'rec11.f32'), sound);
}
chrome.kill();
process.exit(0);
