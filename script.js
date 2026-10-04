const $ = id => document.getElementById(id);

let currentHand = 'right';
let piece = { title: 'Mein Stück', timeSignature: '4/4', hands: { right: [], left: [] } };
let handSettings = { right: { dur: 'q', dotted: false }, left: { dur: 'w', dotted: false } };
let accidentalMode = 'sharp';
let selectedAccidentals = new Map();
let selectedKeys = new Set();
let selectedNote = null;
let noteElementMap = [];

/* ---------- 88-Tasten-Mapping ---------- */
const MAP_88 = [];
const scheme = [
  { sL:'a', sA:'',  fL:'a', fA:'',  black:false, disp:'A' },
  { sL:'a', sA:'#', fL:'b', fA:'b', black:true,  disp:'A♯/B♭' },
  { sL:'b', sA:'',  fL:'b', fA:'',  black:false, disp:'B' },
  { sL:'c', sA:'',  fL:'c', fA:'',  black:false, disp:'C' },
  { sL:'c', sA:'#', fL:'d', fA:'b', black:true,  disp:'C♯/D♭' },
  { sL:'d', sA:'',  fL:'d', fA:'',  black:false, disp:'D' },
  { sL:'d', sA:'#', fL:'e', fA:'b', black:true,  disp:'D♯/E♭' },
  { sL:'e', sA:'',  fL:'e', fA:'',  black:false, disp:'E' },
  { sL:'f', sA:'',  fL:'f', fA:'',  black:false, disp:'F' },
  { sL:'f', sA:'#', fL:'g', fA:'b', black:true,  disp:'F♯/G♭' },
  { sL:'g', sA:'',  fL:'g', fA:'',  black:false, disp:'G' },
  { sL:'g', sA:'#', fL:'a', fA:'b', black:true,  disp:'G♯/A♭' }
];
for (let i = 0; i < 88; i++) {
  const midi = 21 + i;
  const oct = Math.floor(midi / 12) - 1;
  const s = scheme[i % 12];
  MAP_88.push({
    keyNum: i + 1, midi, isBlack: s.black, displayName: s.disp,
    sharp: { vexKey: s.sL + '/' + oct, accidental: s.sA || null, label: s.sL.toUpperCase() + (s.sA === '#' ? '♯' : '') + oct },
    flat:  { vexKey: s.fL + '/' + oct, accidental: s.fA || null, label: s.fL.toUpperCase() + (s.fA === 'b' ? '♭' : '') + oct }
  });
}
function getKeyData(num) { return MAP_88[num - 1] || null; }
function getSpelling(keyNum, spelling) {
  const d = getKeyData(keyNum);
  if (!d) return null;
  return (!d.isBlack || spelling !== 'flat') ? d.sharp : d.flat;
}
function refreshAll() { renderSequence(); renderSheet(); autoSave(); }

/* ---------- Klaviatur ---------- */
function buildKeyboard() {
  const container = $('keyboard');
  container.innerHTML = '';
  let whiteIndex = 0;
  MAP_88.forEach(item => {
    if (item.isBlack) return;
    const btn = document.createElement('button');
    btn.className = 'key-white'; btn.dataset.key = item.keyNum; btn.style.left = (whiteIndex * 30) + 'px';
    btn.innerHTML = `<span class="key-num">${item.keyNum}</span><span class="key-note">${item.sharp.label}</span>`;
    btn.onclick = () => handleKeyClick(item);
    btn.oncontextmenu = e => { e.preventDefault(); toggleKeyAccidental(item); };
    container.appendChild(btn);
    whiteIndex++;
  });
  MAP_88.forEach(item => {
    if (!item.isBlack) return;
    const btn = document.createElement('button');
    btn.className = 'key-black'; btn.dataset.key = item.keyNum;
    const whiteBefore = MAP_88.slice(0, item.keyNum - 1).filter(s => !s.isBlack).length;
    btn.style.left = (whiteBefore * 30 - 10) + 'px';
    btn.innerHTML = `<span class="key-num">${item.keyNum}</span><span class="key-note">${accidentalMode === 'flat' ? item.flat.label : item.sharp.label}</span>`;
    btn.onclick = () => handleKeyClick(item);
    btn.oncontextmenu = e => { e.preventDefault(); toggleKeyAccidental(item); };
    container.appendChild(btn);
  });
}
function refreshKeyboardLabels() {
  document.querySelectorAll('.key-black').forEach(btn => {
    const k = parseInt(btn.dataset.key);
    const item = getKeyData(k);
    const spelling = selectedAccidentals.get(k) || accidentalMode;
    btn.querySelector('.key-note').textContent = spelling === 'flat' ? item.flat.label : item.sharp.label;
    btn.classList.toggle('flat-mode', spelling === 'flat');
  });
}
function onAccidentalModeChange() {
  accidentalMode = $('accidentalSelect').value;
  selectedAccidentals.clear();
  refreshKeyboardLabels();
}
function handleKeyClick(item) {
  if (selectedNote) { editKeyClick(item); return; }   // Bearbeitungsmodus
  if (selectedKeys.has(item.keyNum)) { selectedKeys.delete(item.keyNum); selectedAccidentals.delete(item.keyNum); }
  else selectedKeys.add(item.keyNum);
  updateSelectionVisual(); refreshKeyboardLabels();
}
function toggleKeyAccidental(item) {
  if (!item.isBlack || selectedNote) return;
  const current = selectedAccidentals.get(item.keyNum) || accidentalMode;
  selectedAccidentals.set(item.keyNum, current === 'sharp' ? 'flat' : 'sharp');
  selectedKeys.add(item.keyNum);
  updateSelectionVisual(); refreshKeyboardLabels();
}
function updateSelectionVisual() {
  document.querySelectorAll('.key-white, .key-black').forEach(btn => {
    btn.classList.toggle('active', selectedKeys.has(parseInt(btn.dataset.key)));
  });
}

/* ---------- Eingabe & Hand-Wechsel ---------- */
function onDurationChange() {
  handSettings[currentHand].dur = $('durationSelect').value;
  handSettings[currentHand].dotted = $('dottedCheck').checked;
}
function getDurationValue() {
  let d = $('durationSelect').value;
  if ($('dottedCheck').checked) d += '.d';
  return d;
}
function switchHand(hand) {
  currentHand = hand;
  document.querySelectorAll('.hand-btn').forEach(b => b.classList.toggle('active', b.dataset.hand === hand));
  $('currentHandLabel').textContent = hand === 'right' ? 'Rechte Hand' : 'Linke Hand';
  $('durationSelect').value = handSettings[hand].dur;
  $('dottedCheck').checked = handSettings[hand].dotted;
  renderSequence();
}
function addNote() {
  if (!selectedKeys.size) { alert('Bitte Tasten wählen.'); return; }
  const sorted = Array.from(selectedKeys).sort((a, b) => a - b);
  const spellings = sorted.map(k => !getKeyData(k).isBlack ? 'sharp' : (selectedAccidentals.get(k) || accidentalMode));
  piece.hands[currentHand].push({ type: 'note', keys: sorted, spellings, duration: getDurationValue() });
  selectedKeys.clear(); selectedAccidentals.clear();
  updateSelectionVisual(); refreshKeyboardLabels();
  refreshAll();
}
function addRest() {
  piece.hands[currentHand].push({ type: 'rest', duration: getDurationValue() });
  refreshAll();
}
function undoLast() { piece.hands[currentHand].pop(); refreshAll(); }
function clearHand() {
  if (confirm('Spur leeren?')) { piece.hands[currentHand] = []; closeEditPanel(); refreshAll(); }
}
function removeEvent(i) {
  piece.hands[currentHand].splice(i, 1);
  if (selectedNote && selectedNote.hand === currentHand) closeEditPanel();
  refreshAll();
}

// Letzte N Töne/Akkorde duplizieren
function duplicateLast() {
  const arr = piece.hands[currentHand];
  if (!arr.length) { alert('Es gibt noch nichts zum Duplizieren.'); return; }
  const n = Math.min(Math.max(parseInt($('dupCount').value) || 1, 1), arr.length);
  arr.push(...JSON.parse(JSON.stringify(arr.slice(-n))));
  refreshAll();
}
// Ganzen Takt duplizieren
function duplicateMeasurePrompt() {
  const m = prompt('Welchen Takt möchtest du in die ' + (currentHand === 'right' ? 'Rechte' : 'Linke') + ' Hand kopieren (als neuen Takt ans Ende hängen)?\nGib eine Taktnummer ein (1, 2, ...):');
  if (!m) return;
  const num = parseInt(m);
  if (isNaN(num) || num < 1) return alert('Ungültige Taktnummer.');
  const ts = $('timeSigInput').value || '4/4';
  let beats = null;
  if (/^\d+\/\d+$/.test(ts)) { const p = ts.split('/').map(Number); beats = p[0] * (4 / p[1]); }
  const measures = groupIntoMeasures(piece.hands[currentHand], beats);
  if (num > measures.length) return alert('Takt ' + num + ' existiert in dieser Hand nicht.');
  piece.hands[currentHand].push(...JSON.parse(JSON.stringify(measures[num - 1])));
  refreshAll();
}

/* ---------- Sequenz ---------- */
let seqVisible = true;
function toggleSequence() {
  seqVisible = !seqVisible;
  $('sequenceList').style.display = seqVisible ? 'flex' : 'none';
  $('toggleSeqBtn').textContent = seqVisible ? 'Verbergen' : 'Anzeigen';
}
function renderSequence() {
  const box = $('sequenceList'); box.innerHTML = '';
  piece.hands[currentHand].forEach((ev, i) => {
    const chip = document.createElement('div'); chip.className = 'chip';
    const dStr = ev.duration.replace('.d', '') + (ev.duration.includes('.d') ? ' (pkt)' : '');
    const text = ev.type === 'note' ? ev.keys.map((k, idx) => getSpelling(k, ev.spellings?.[idx] || 'sharp').label).join(',') : 'Pause';
    chip.innerHTML = `<span>${text} (${dStr})</span><button class="remove-ch" onclick="removeEvent(${i})">×</button>`;
    box.appendChild(chip);
  });
}

/* ============================================================
   VexFlow
   ============================================================ */
function VF() { return (window.Vex && window.Vex.Flow) || window.VexFlow || null; }
function parseDuration(d) { return { duration: d.replace('.d', ''), dots: d.endsWith('.d') ? 1 : 0 }; }
function eventBeats(ev) {
  const { duration, dots } = parseDuration(ev.duration);
  const base = { 'w': 4, 'h': 2, 'q': 1, '8': 0.5, '16': 0.25 }[duration] || 1;
  return dots ? base * 1.5 : base;
}
function groupIntoMeasures(events, bpm) {
  if (!bpm) return [events];
  const ms = []; let cur = [], cb = 0;
  for (const ev of events) {
    const b = eventBeats(ev);
    if (cb + b > bpm + 0.001 && cur.length > 0) { ms.push(cur); cur = []; cb = 0; }
    cur.push(ev); cb += b;
  }
  if (cur.length) ms.push(cur);
  return ms;
}
function buildIndexMap(measures) { let c = 0; return measures.map(m => m.map(() => c++)); }

function makeStaveNote(ev, clef) {
  const vf = VF(); const { duration, dots } = parseDuration(ev.duration);
  if (ev.type === 'rest') {
    const note = new vf.StaveNote({ clef, keys: [clef === 'treble' ? 'b/4' : 'd/3'], duration: duration + 'r' });
    if (dots) vf.Dot.buildAndAttach([note], { all: true });
    return note;
  }
  const pairs = ev.keys.map((k, i) => ({ k, sp: ev.spellings?.[i] || 'sharp', midi: getKeyData(k).midi })).sort((a, b) => a.midi - b.midi);
  const vexKeys = [], acc = [];
  pairs.forEach((p, i) => {
    const s = getSpelling(p.k, p.sp); vexKeys.push(s.vexKey);
    if (s.accidental) acc.push({ i, a: s.accidental });
  });
  const note = new vf.StaveNote({ clef, keys: vexKeys, duration });
  acc.forEach(x => note.addModifier(new vf.Accidental(x.a), x.i));
  if (dots) vf.Dot.buildAndAttach([note], { all: true });
  return note;
}
function makeVoice(notes, ts) {
  const n = ts ? ts.num : 4, d = ts ? ts.den : 4;
  const v = new (VF().Voice)({ numBeats: n, beatValue: d, num_beats: n, beat_value: d }).setStrict(false);
  v.addTickables(notes);
  return v;
}

// Mindestbreite, die ein Takt braucht, damit nichts über den Taktstrich ragt
function minWidth(events, clef, ts) {
  if (!events.length) return 0;
  const vf = VF();
  const notes = events.map(e => makeStaveNote(e, clef));
  const v = makeVoice(notes, ts);
  try { return new vf.Formatter().joinVoices([v]).preCalculateMinTotalWidth([v]); }
  catch (e) { return notes.length * 45; }
}

// Manuelle Balken: Note hat beamNext → mit der nächsten Note verbinden
function manualBeams(events, notes) {
  const vf = VF(); const out = []; let run = [];
  const ok = e => e.type === 'note' && ['8', '16'].includes(parseDuration(e.duration).duration);
  const flush = () => { if (run.length > 1) out.push(new vf.Beam(run)); run = []; };
  events.forEach((e, i) => {
    if (!ok(e)) { flush(); return; }
    run.push(notes[i]);
    if (!e.beamNext || !events[i + 1] || !ok(events[i + 1])) flush();
  });
  flush();
  return out;
}

function drawVoice(ctx, stave, events, clef, ts, autoBeam) {
  if (!events.length) return [];
  const vf = VF();
  const notes = events.map(ev => makeStaveNote(ev, clef));
  const v = makeVoice(notes, ts);
  new vf.Formatter().joinVoices([v]).format([v], Math.max(60, stave.getNoteEndX() - stave.getNoteStartX() - 12));
  const beams = autoBeam ? vf.Beam.generateBeams(notes) : manualBeams(events, notes);
  v.draw(ctx, stave);
  beams.forEach(b => b.setContext(ctx).draw());
  return notes;
}

function renderSheet() {
  const vf = VF();
  const host = $('sheetHost');
  if (!vf) { host.textContent = 'VexFlow konnte nicht geladen werden. Bitte Internetverbindung prüfen.'; return; }
  host.innerHTML = ''; noteElementMap = [];

  const tsStr = ($('timeSigInput').value || '').trim();
  let bpm = null, numB = 4, den = 4;
  if (/^\d+\/\d+$/.test(tsStr)) { const p = tsStr.split('/'); numB = +p[0]; den = +p[1]; bpm = numB * (4 / den); }
  const ts = bpm ? { num: numB, den } : null;

  const layoutMeasures = parseInt($('layoutMeasures').value) || 4;
  const scale = (parseInt($('layoutScale').value) || 100) / 100;
  const autoBeam = $('autoBeam').checked;
  const title = ($('titleInput').value || '').trim();
  const top = title ? 50 : 0;

  const rM = groupIntoMeasures(piece.hands.right, bpm);
  const lM = groupIntoMeasures(piece.hands.left, bpm);
  const mCount = Math.max(rM.length, lM.length, 1);
  const rIdx = buildIndexMap(rM), lIdx = buildIndexMap(lM);
  const mPerLine = Math.min(layoutMeasures, mCount);
  const lineCount = Math.ceil(mCount / mPerLine);
  const baseM = Math.floor(1070 / mPerLine);

  // Taktbreiten: ein Takt wird so lang wie nötig
  const widths = [];
  for (let m = 0; m < mCount; m++) {
    const need = Math.max(minWidth(rM[m] || [], 'treble', ts), minWidth(lM[m] || [], 'bass', ts));
    const prefix = (m % mPerLine === 0) ? (m === 0 && bpm ? 90 : 60) : 0;
    widths.push(Math.max(baseM, need + 40) + prefix);
  }
  let maxLine = 0;
  for (let l = 0; l < lineCount; l++) {
    maxLine = Math.max(maxLine, widths.slice(l * mPerLine, (l + 1) * mPerLine).reduce((a, b) => a + b, 0));
  }
  const totalW = maxLine + 40;

  const renderer = new vf.Renderer(host, vf.Renderer.Backends.SVG);
  renderer.resize(totalW * scale, (lineCount * 220 + 40 + top) * scale);
  const ctx = renderer.getContext();
  ctx.scale(scale, scale);
  if (title) { ctx.setFont('serif', 24, 'bold'); ctx.fillText(title, 20, 34); }

  const drawnNotes = [];
  for (let line = 0; line < lineCount; line++) {
    const startM = line * mPerLine, endM = Math.min(startM + mPerLine, mCount);
    let x = 20; const yOff = line * 220 + top;
    for (let m = startM; m < endM; m++) {
      const isFirst = m === startM, w = widths[m];
      const tS = new vf.Stave(x, 20 + yOff, w);
      if (isFirst) tS.addClef('treble');
      if (m === 0 && bpm) tS.addTimeSignature(tsStr);
      tS.setContext(ctx).draw();
      const bS = new vf.Stave(x, 120 + yOff, w);
      if (isFirst) bS.addClef('bass');
      if (m === 0 && bpm) bS.addTimeSignature(tsStr);
      bS.setContext(ctx).draw();

      if (isFirst) {
        new vf.StaveConnector(tS, bS).setType(3).setContext(ctx).draw(); // Klammer
        new vf.StaveConnector(tS, bS).setType(1).setContext(ctx).draw(); // Linie links
      }
      // Taktstrich rechts: einfach, nur am Stückende doppelt
      new vf.StaveConnector(tS, bS).setType(m === mCount - 1 ? 6 : 0).setContext(ctx).draw();

      const rN = drawVoice(ctx, tS, rM[m] || [], 'treble', ts, autoBeam);
      const lN = drawVoice(ctx, bS, lM[m] || [], 'bass', ts, autoBeam);
      rN.forEach((n, i) => drawnNotes.push({ note: n, h: 'right', idx: rIdx[m][i] }));
      lN.forEach((n, i) => drawnNotes.push({ note: n, h: 'left', idx: lIdx[m][i] }));
      x += w;
    }
  }

  drawnNotes.forEach(e => {
    const el = e.note.getSVGElement ? e.note.getSVGElement() : null;
    if (!el) return;
    el.classList.add('vf-stavenote');
    el.onclick = ev => { ev.stopPropagation(); selectNoteInSheet(e.h, e.idx); };
    noteElementMap.push({ el, h: e.h, idx: e.idx });
  });
  if (selectedNote) restoreSelectionVisual();
}

/* ---------- Bearbeiten ---------- */
function clearHighlights() {
  document.querySelectorAll('.key-white.highlight, .key-black.highlight').forEach(b => b.classList.remove('highlight'));
}
function highlightEvent(ev) {
  clearHighlights();
  if (ev.type === 'note') ev.keys.forEach(k => document.querySelector(`[data-key="${k}"]`)?.classList.add('highlight'));
  document.querySelectorAll('.note-selected').forEach(e => e.classList.remove('note-selected'));
  const ne = noteElementMap.find(m => m.h === selectedNote.hand && m.idx === selectedNote.index);
  if (ne) ne.el.classList.add('note-selected');
}
function selectNoteInSheet(hand, idx) {
  const ev = piece.hands[hand][idx]; if (!ev) return;
  selectedNote = { hand, index: idx };
  selectedKeys.clear(); selectedAccidentals.clear(); updateSelectionVisual();
  highlightEvent(ev);
  if (ev.type === 'note') {
    const btn = document.querySelector(`[data-key="${ev.keys[0]}"]`);
    if (btn) $('keyboardScroll').scrollTo({ left: btn.offsetLeft - 300, behavior: 'smooth' });
  }
  openEditPanel(ev);
}
function restoreSelectionVisual() {
  if (!selectedNote) return;
  const ev = piece.hands[selectedNote.hand][selectedNote.index];
  if (!ev) { selectedNote = null; return; }
  highlightEvent(ev);
}
function openEditPanel(ev) {
  $('editPanel').hidden = false;
  document.body.classList.add('editing');
  $('editHand').textContent = selectedNote.hand === 'right' ? 'Rechts' : 'Links';
  $('editIndex').textContent = selectedNote.index + 1;
  $('editKeys').textContent = ev.type === 'rest' ? 'Pause' : ev.keys.map((k, i) => getSpelling(k, ev.spellings?.[i] || 'sharp').label).join(', ');

  const { duration, dots } = parseDuration(ev.duration);
  $('editDuration').value = duration;
  $('editDotted').checked = dots === 1;
  $('editBeam').checked = !!ev.beamNext;

  const accList = $('editAccidentalList'); accList.innerHTML = '';
  $('editAccidentalRow').style.display = 'none';
  if (ev.type === 'note') {
    ev.keys.forEach((k, idx) => {
      if (!getKeyData(k).isBlack) return;
      $('editAccidentalRow').style.display = '';
      const sp = getSpelling(k, ev.spellings?.[idx] || 'sharp');
      const btn = document.createElement('button');
      btn.className = 'acc-chip' + (ev.spellings?.[idx] === 'flat' ? ' flat' : '');
      btn.textContent = sp.label;
      btn.onclick = () => {
        if (!ev.spellings) ev.spellings = ev.keys.map(() => 'sharp');
        ev.spellings[idx] = ev.spellings[idx] === 'sharp' ? 'flat' : 'sharp';
        refreshAll(); openEditPanel(ev);
      };
      accList.appendChild(btn);
    });
  }
}
function closeEditPanel() {
  $('editPanel').hidden = true;
  document.body.classList.remove('editing');
  selectedNote = null; clearHighlights();
  document.querySelectorAll('.note-selected').forEach(e => e.classList.remove('note-selected'));
}
function currentEditEvent() { return selectedNote ? piece.hands[selectedNote.hand][selectedNote.index] : null; }
function applyEditDuration() {
  const ev = currentEditEvent(); if (!ev) return;
  let d = $('editDuration').value; if ($('editDotted').checked) d += '.d';
  ev.duration = d; refreshAll(); openEditPanel(ev);
}
function applyEditBeam() {
  const ev = currentEditEvent(); if (!ev) return;
  ev.beamNext = $('editBeam').checked;
  refreshAll();
}
function editKeyClick(item) {
  const ev = currentEditEvent(); if (!ev) return;
  const k = item.keyNum, sp = item.isBlack ? accidentalMode : 'sharp';
  if (ev.type === 'rest' || $('editKeyMode').value === 'replace') {
    ev.type = 'note'; ev.keys = [k]; ev.spellings = [sp];
  } else {
    const i = ev.keys.indexOf(k);
    if (i >= 0) { if (ev.keys.length === 1) return; ev.keys.splice(i, 1); ev.spellings.splice(i, 1); }
    else { ev.keys.push(k); ev.spellings.push(sp); }
    const z = ev.keys.map((key, j) => ({ key, sp: ev.spellings[j] })).sort((a, b) => a.key - b.key);
    ev.keys = z.map(o => o.key); ev.spellings = z.map(o => o.sp);
  }
  refreshAll(); openEditPanel(ev);
}
function moveEvent(dir) {
  if (!selectedNote) return;
  const arr = piece.hands[selectedNote.hand], i = selectedNote.index, j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]]; selectedNote.index = j;
  refreshAll(); openEditPanel(arr[j]);
}
function duplicateSelected() {
  if (!selectedNote) return;
  const arr = piece.hands[selectedNote.hand], i = selectedNote.index;
  arr.splice(i + 1, 0, JSON.parse(JSON.stringify(arr[i])));
  selectedNote.index = i + 1;
  refreshAll(); openEditPanel(arr[i + 1]);
}
function deleteSelectedEvent() {
  if (!selectedNote) return;
  piece.hands[selectedNote.hand].splice(selectedNote.index, 1);
  closeEditPanel(); refreshAll();
}

/* ---------- Export & Speichern ---------- */
function exportPNG() {
  const svg = document.querySelector('#sheetHost svg'); if (!svg) return;
  const src = new XMLSerializer().serializeToString(svg).replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  const img = new Image(); const url = URL.createObjectURL(new Blob([src], { type: 'image/svg+xml' }));
  img.onload = () => {
    const c = document.createElement('canvas'); const s = 2;
    c.width = (parseInt(svg.getAttribute('width')) || svg.clientWidth) * s;
    c.height = (parseInt(svg.getAttribute('height')) || svg.clientHeight) * s;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.scale(s, s); ctx.drawImage(img, 0, 0, c.width / s, c.height / s); URL.revokeObjectURL(url);
    const a = document.createElement('a'); a.download = 'notenblatt.png'; a.href = c.toDataURL(); a.click();
  };
  img.src = url;
}
function getStorageKey() { return 'piano_notes_pieces'; }
function loadAll() { try { return JSON.parse(localStorage.getItem(getStorageKey()) || '{}'); } catch (e) { return {}; } }
function saveAll(all) { try { localStorage.setItem(getStorageKey(), JSON.stringify(all)); } catch (e) { console.warn('Speichern fehlgeschlagen', e); } }
function savePiece() {
  const n = $('saveName').value || 'Unbenannt';
  piece.title = $('titleInput').value || piece.title;
  piece.timeSignature = $('timeSigInput').value || piece.timeSignature;
  const all = loadAll();
  all[n] = JSON.parse(JSON.stringify(piece)); saveAll(all);
  renderSavedList(); alert('Gespeichert.');
}
function loadPiece() {
  const n = $('saveName').value;
  const all = loadAll();
  if (!all[n]) { alert('Nicht gefunden.'); return; }
  piece = JSON.parse(JSON.stringify(all[n]));
  piece.hands = piece.hands || {}; piece.hands.right = piece.hands.right || []; piece.hands.left = piece.hands.left || [];
  ['right', 'left'].forEach(h => piece.hands[h].forEach(e => { if (e.type === 'note' && !e.spellings) e.spellings = e.keys.map(() => 'sharp'); }));
  closeEditPanel();
  $('titleInput').value = piece.title || '';
  $('timeSigInput').value = piece.timeSignature || '';
  renderSequence(); renderSheet();
}
function deletePiece(n) {
  if (!confirm('Löschen?')) return;
  const all = loadAll(); delete all[n]; saveAll(all); renderSavedList();
}
function renderSavedList() {
  const b = $('savedList'); b.innerHTML = '';
  Object.keys(loadAll()).forEach(n => {
    const d = document.createElement('div'); d.className = 'saved-item';
    const s = document.createElement('span'); s.textContent = n;
    const l = document.createElement('button'); l.className = 'btn-load'; l.textContent = 'Laden';
    l.onclick = () => { $('saveName').value = n; loadPiece(); };
    const x = document.createElement('button'); x.className = 'btn-del'; x.textContent = '×';
    x.onclick = () => deletePiece(n);
    d.append(s, l, x); b.appendChild(d);
  });
}
function autoSave() {
  const all = loadAll();
  all['Auto-Speichern'] = JSON.parse(JSON.stringify(piece)); saveAll(all); renderSavedList();
}

function init() {
  buildKeyboard(); renderSequence(); renderSavedList();
  setTimeout(renderSheet, 100);
  $('keyboard').ondblclick = e => {
    if (selectedNote) return;
    const b = e.target.closest('.key-white, .key-black'); if (!b) return;
    const i = MAP_88[parseInt(b.dataset.key) - 1]; if (!i) return;
    selectedKeys.clear(); selectedKeys.add(i.keyNum); addNote();
  };
  $('timeSigInput').onchange = renderSheet;
  $('titleInput').onchange = renderSheet;
}
window.addEventListener('DOMContentLoaded', init);
