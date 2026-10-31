// The real recording through the real page, with screenshots on phone, tablet and laptop.
// usage: node real.mjs <out-dir> <url> <video>
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [OUT, URL_, VIDEO] = process.argv.slice(2);
const PORT = 9348;
mkdirSync(OUT, { recursive: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(OUT, 'profile')}`,
  '--no-first-run', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', 'about:blank',
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
const send = (method, params = {}) => new Promise(r => { const id = nextId++; waiting.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const run = async expression => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed');
  return r.result.result.value;
};
const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64')); };
const size = (width, height, mobile = true) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile });
const click = async text => {
  const box = await run(`(() => { const e = [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)}) || b.getAttribute('aria-label') === ${JSON.stringify(text)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!box) throw new Error('kein Knopf: ' + text);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await sleep(350);
};

await send('Runtime.enable');
await send('Page.enable');
await send('DOM.enable');
await size(390, 844);
await send('Page.navigate', { url: URL_ });
await sleep(2500);
await shot('home-empty-390');
await click('Video in Noten');
await sleep(300);
await shot('import-390');
const doc = await send('DOM.getDocument');
const node = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: 'input[type=file][accept^=video]' });
await send('DOM.setFileInputFiles', { nodeId: node.result.nodeId, files: [VIDEO] });
await sleep(9000);
await shot('reading-390');
const began = Date.now();
let state = '';
for (let i = 0; i < 500; i++) {
  await sleep(1000);
  state = await run(`document.querySelector('[role=alert]')?.textContent || ([...document.querySelectorAll('button')].some(b => b.textContent === 'Notenblatt erstellen') ? 'FERTIG' : '')`);
  if (state) break;
}
console.log('Ergebnis', state || 'ZEIT ABGELAUFEN', Math.round((Date.now() - began) / 1000) + ' s');
await shot('result-390');
if (state !== 'FERTIG') { console.log(JSON.stringify([...new Set(problems)])); finish(1); }
console.log('Zahlen', await run(`[...document.querySelectorAll('dd')].map(d => d.textContent).join(' / ')`));
await click('Notenblatt erstellen');
await sleep(1500);
await shot('sheet-390');
const piece = await run(`JSON.parse(localStorage.getItem('klavier_pieces')).pieces.at(-1)`);
console.log('Stück', piece.title, piece.bpm, 'Tonart', piece.key, 'rechts', piece.hands.right.length, 'links', piece.hands.left.length);

const LEN = { w: 192, h: 96, q: 48, 8: 24, 16: 12, 32: 6 };
const nm = m => ['C', 'Cis', 'D', 'Dis', 'E', 'F', 'Fis', 'G', 'Gis', 'A', 'Ais', 'H'][m % 12] + (Math.floor(m / 12) - 1);
for (const hand of ['right', 'left']) {
  let tick = 0;
  const bars = [];
  for (const ev of piece.hands[hand]) {
    const bar = Math.floor(tick / 192);
    (bars[bar] ??= []).push((ev.keys.length ? ev.keys.map(nm).join('+') : '-') + ':' + (LEN[ev.dur] * (ev.dotted ? 1.5 : 1)) / 12);
    tick += LEN[ev.dur] * (ev.dotted ? 1.5 : 1);
  }
  console.log(hand, bars.slice(0, 4).map((b, i) => `T${i + 1} ` + b.join(' ')).join(' | '));
}
const overflow = () => run(`document.documentElement.scrollWidth > innerWidth`);
for (const [name, w, h, mobile] of [['ipad', 820, 1180, true], ['laptop', 1366, 768, false], ['handy', 390, 844, true], ['klein', 320, 568, true]]) {
  await size(w, h, mobile);
  await sleep(900);
  await shot(`${name}-notenblatt`);
  await click('Korrigieren');
  await sleep(500);
  await shot(`${name}-korrigieren`);
  await click('Fertig');
  await click('Üben');
  await sleep(700);
  await shot(`${name}-ueben`);
  await click('Fallend');
  await sleep(700);
  await shot(`${name}-fallend`);
  await click('Stücke');
  await sleep(500);
  await shot(`${name}-stuecke`);
  console.log(name, 'seitlich', await overflow());
  await click('Notenblatt');
  await sleep(500);
}
console.log('Fehler', JSON.stringify([...new Set(problems)]));
finish(0);
