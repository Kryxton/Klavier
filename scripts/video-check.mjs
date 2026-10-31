// Makes a real tutorial-style video in Chrome from a known piece, uploads it through the page and
// compares the written score with the original, note by note.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
const URL_ = process.argv[3];
const PORT = 9345;
mkdirSync(OUT, { recursive: true });

const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(OUT, 'profile')}`,
  '--no-first-run', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank',
], { stdio: 'ignore' });
const finish = code => { chrome.kill(); process.exit(code); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(t => t.type === 'page'); } catch { /* not up yet */ }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let nextId = 1;
const waiting = new Map();
const problems = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') problems.push('EXCEPTION ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push('error ' + m.params.args.map(a => a.value ?? a.description).join(' '));
};
const send = (method, params = {}) => new Promise(r => {
  const id = nextId++;
  waiting.set(id, r);
  ws.send(JSON.stringify({ id, method, params }));
});
const run = async expression => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed');
  return r.result.result.value;
};
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64'));
};
const size = (width, height, mobile = true) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile });
const clickText = async text => {
  const box = await run(`(() => { const e = [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)})); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!box) throw new Error('kein Knopf: ' + text);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await sleep(150);
};

await send('Runtime.enable');
await send('Page.enable');
await send('DOM.enable');
await size(390, 844);
await send('Page.navigate', { url: URL_ });
await sleep(2000);
await shot('home-390');

const NAME = process.argv[4] ?? 'tutorial';
const videoPath = join(process.argv[5], `${NAME}.mp4`);
const { right, left } = JSON.parse(readFileSync(join(process.argv[5], `${NAME}.json`), 'utf8'));

await clickText('Video in Noten');
await sleep(400);
await shot('import-390');
const doc = await send('DOM.getDocument');
const node = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: 'input[type=file][accept^=video]' });
await send('DOM.setFileInputFiles', { nodeId: node.result.nodeId, files: [videoPath] });
await sleep(1500);
await shot('reading-390');

let state = '';
for (let i = 0; i < 240; i++) {
  await sleep(500);
  state = await run(`document.querySelector('[role=alert]')?.textContent || ([...document.querySelectorAll('button')].some(b => b.textContent === 'Notenblatt erstellen') ? 'FERTIG' : '')`);
  if (state) break;
}
console.log('state', state);
await shot('result-390');
if (state !== 'FERTIG') { console.log(JSON.stringify(problems)); finish(1); }

await clickText('Notenblatt erstellen');
await sleep(1200);
await shot('sheet-390');
const piece = await run(`(() => { const lib = JSON.parse(localStorage.getItem('klavier_pieces')); return lib.pieces.at(-1); })()`);

// Compare: the written notes against the original, ignoring where bar 1 was put
const LENGTH = { w: 192, h: 96, q: 48, 8: 24, 16: 12, 32: 6 };
const flatten = events => {
  const out = [];
  let tick = 0;
  let held = new Map();
  for (const ev of events) {
    const ticks = LENGTH[ev.dur] * (ev.dotted ? 1.5 : 1);
    const next = new Map();
    for (const midi of ev.keys) {
      const note = held.get(midi) ?? { midi, tick, length: 0 };
      if (!held.has(midi)) out.push(note);
      note.length += ticks;
      if (ev.tie) next.set(midi, note);
    }
    held = next;
    tick += ticks;
  }
  return out;
};
const compare = (truth, written, name) => {
  const clean = truth.filter(n => n.midi !== undefined);
  const shift = Math.min(...written.map(n => n.tick));
  const key = n => `${n.tick}|${n.midi}`;
  const found = new Map(written.map(n => [`${n.tick - shift}|${n.midi}`, n]));
  const missing = clean.filter(n => !found.has(key(n)));
  const truthKeys = new Set(clean.map(key));
  const extra = written.filter(n => !truthKeys.has(`${n.tick - shift}|${n.midi}`));
  const lengths = clean.filter(n => found.has(key(n)) && found.get(key(n)).length !== n.length);
  console.log(name, 'original', clean.length, 'geschrieben', written.length, 'fehlend', missing.length, 'zuviel', extra.length, 'laenge falsch', lengths.length);
  if (missing.length) console.log('  fehlend', JSON.stringify(missing.slice(0, 8)));
  if (extra.length) console.log('  zuviel', JSON.stringify(extra.slice(0, 8)));
  if (lengths.length) console.log('  laengen', JSON.stringify(lengths.slice(0, 6).map(n => [n.midi, n.tick, n.length, found.get(key(n)).length])));
};
console.log('tempo', piece.bpm, 'tonart', piece.key, 'takt', piece.beats + '/' + piece.beatValue);
compare(right, flatten(piece.hands.right), 'rechts');
compare(left, flatten(piece.hands.left), 'links');

await size(1024, 768, false);
await sleep(700);
await shot('sheet-1024');
await clickText('Stücke');
await sleep(500);
await shot('home-1024');
await clickText('Üben');
await sleep(600);
await shot('practice-1024');
await size(320, 568);
await sleep(500);
await shot('practice-320');
await clickText('Notenblatt');
await sleep(500);
await clickText('Korrigieren');
await sleep(500);
await shot('correct-320');
console.log('sideways', await run(`document.documentElement.scrollWidth > innerWidth`));
console.log('problems', JSON.stringify([...new Set(problems)]));
finish(0);
