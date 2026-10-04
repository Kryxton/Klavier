let currentHand = 'right';
let piece = {
  title: 'Mein Stück',
  timeSignature: '4/4',
  hands: { right: [], left: [] }
};

// Einstellungs-Speicher für Hände
let handSettings = {
  right: { dur: 'q', dotted: false },
  left:  { dur: 'w', dotted: false }
};

let accidentalMode = 'sharp';
let selectedAccidentals = new Map();
let selectedKeys = new Set();

// Für Noten-Klick
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
    sharp: { vexKey: s.sL + '/' + oct, accidental: s.sA || null, label: s.sL.toUpperCase() + (s.sA==='#'?'♯':'') + oct },
    flat:  { vexKey: s.fL + '/' + oct, accidental: s.fA || null, label: s.fL.toUpperCase() + (s.fA==='b'?'♭':'') + oct }
  });
}
function getKeyData(num) { return MAP_88[num - 1] || null; }
function getSpelling(keyNum, spelling) {
  const d = getKeyData(keyNum);
  if (!d) return null;
  return (!d.isBlack || spelling !== 'flat') ? d.sharp : d.flat;
}

/* ---------- Klaviatur bauen ---------- */
function buildKeyboard() {
  const container = document.getElementById('keyboard');
  container.innerHTML = '';
  let whiteIndex = 0;
  
  MAP_88.forEach(item => {
    if (item.isBlack) return;
    const btn = document.createElement('button');
    btn.className = 'key-white'; btn.dataset.key = item.keyNum; btn.style.left = (whiteIndex * 30) + 'px';
    btn.innerHTML = `<span class="key-num">${item.keyNum}</span><span class="key-note">${item.sharp.label}</span>`;
    btn.onclick = () => handleKeyClick(item);
    btn.oncontextmenu = (e) => { e.preventDefault(); toggleKeyAccidental(item); };
    container.appendChild(btn);
    whiteIndex++;
  });
  
  MAP_88.forEach(item => {
    if (!item.isBlack) return;
    const btn = document.createElement('button');
    btn.className = 'key-black'; btn.dataset.key = item.keyNum;
    const whiteBefore = MAP_88.slice(0, item.keyNum - 1).filter(s => !s.isBlack).length;
    btn.style.left = (whiteBefore * 30 - 10) + 'px'; 
    btn.innerHTML = `<span class="key-num">${item.keyNum}</span><span class="key-note">${accidentalMode==='flat'?item.flat.label:item.sharp.label}</span>`;
    btn.onclick = () => handleKeyClick(item);
    btn.oncontextmenu = (e) => { e.preventDefault(); toggleKeyAccidental(item); };
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
  accidentalMode = document.getElementById('accidentalSelect').value;
  selectedAccidentals.clear();
  refreshKeyboardLabels();
}

function handleKeyClick(item) {
  if (selectedKeys.has(item.keyNum)) { selectedKeys.delete(item.keyNum); selectedAccidentals.delete(item.keyNum); }
  else { selectedKeys.add(item.keyNum); }
  updateSelectionVisual(); refreshKeyboardLabels();
}
function toggleKeyAccidental(item) {
  if (!item.isBlack) return;
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

/* ---------- Eingabe & Kopieren ---------- */
function onDurationChange() {
  handSettings[currentHand].dur = document.getElementById('durationSelect').value;
  handSettings[currentHand].dotted = document.getElementById('dottedCheck').checked;
}
function getDurationValue() {
  let d = document.getElementById('durationSelect').value;
  if (document.getElementById('dottedCheck').checked) d += '.d';
  return d;
}
function switchHand(hand) {
  currentHand = hand;
  document.querySelectorAll('.hand-btn').forEach(b => b.classList.toggle('active', b.dataset.hand === hand));
  document.getElementById('currentHandLabel').textContent = hand === 'right' ? 'Rechte Hand' : 'Linke Hand';
  
  document.getElementById('durationSelect').value = handSettings[hand].dur;
  document.getElementById('dottedCheck').checked = handSettings[hand].dotted;
  
  renderSequence();
}

function addNote() {
  if (!selectedKeys.size) { alert('Bitte Tasten wählen.'); return; }
  const sorted = Array.from(selectedKeys).sort((a,b) => a-b);
  const spellings = sorted.map(k => !getKeyData(k).isBlack ? 'sharp' : (selectedAccidentals.get(k) || accidentalMode));
  piece.hands[currentHand].push({ type: 'note', keys: sorted, spellings, duration: getDurationValue() });
  selectedKeys.clear(); selectedAccidentals.clear();
  updateSelectionVisual(); refreshKeyboardLabels();
  renderSequence(); renderSheet(); autoSave();
}
function addRest() {
  piece.hands[currentHand].push({ type: 'rest', duration: getDurationValue() });
  renderSequence(); renderSheet(); autoSave();
}
function undoLast() {
  piece.hands[currentHand].pop();
  renderSequence(); renderSheet(); autoSave();
}
function clearHand() {
  if (confirm('Spur leeren?')) { piece.hands[currentHand] = []; renderSequence(); renderSheet(); autoSave(); }
}
function removeEvent(i) {
  piece.hands[currentHand].splice(i, 1);
  renderSequence(); renderSheet(); autoSave();
}

// NEU: Letzte X Elemente kopieren
function duplicateLastNPrompt() {
  const m = prompt("Wie viele der letzen Noten/Pausen sollen in dieser Spur nochmal kopiert werden?");
  if (!m) return;
  const num = parseInt(m);
  if (isNaN(num) || num < 1) return alert("Bitte eine gültige Zahl eingeben.");
  
  const arr = piece.hands[currentHand];
  if (num > arr.length) return alert("Es gibt noch keine " + num + " Elemente in dieser Spur.");
  
  const toCopy = arr.slice(arr.length - num);
  piece.hands[currentHand].push(...JSON.parse(JSON.stringify(toCopy))); // Tiefe Kopie
  renderSequence(); renderSheet(); autoSave();
}

// NEU: Ganzen Takt kopieren
function duplicateMeasurePrompt() {
  const m = prompt("Welchen Takt möchtest du ans Ende kopieren?\n(Gib eine Taktnummer ein, z.B. 1, 2, ...):");
  if (!m) return;
  const num = parseInt(m);
  if (isNaN(num) || num < 1) return alert("Ungültige Taktnummer.");
  
  const ts = document.getElementById('timeSigInput').value || '4/4';
  let beats = null;
  if (/^\d+\/\d+$/.test(ts)) {
    const p = ts.split('/').map(Number);
    beats = p[0] * (4/p[1]);
  }
  
  const measures = groupIntoMeasures(piece.hands[currentHand], beats);
  if (num > measures.length) return alert("Takt " + num + " existiert nicht.");
  
  const toCopy = JSON.parse(JSON.stringify(measures[num - 1]));
  piece.hands[currentHand].push(...toCopy);
  renderSequence(); renderSheet(); autoSave();
}

/* ---------- Sequenz Toggle ---------- */
let seqVisible = true;
function toggleSequence() {
  seqVisible = !seqVisible;
  document.getElementById('sequenceList').style.display = seqVisible ? 'flex' : 'none';
  document.getElementById('toggleSeqBtn').textContent = seqVisible ? 'Verbergen' : 'Anzeigen';
}
function renderSequence() {
  const box = document.getElementById('sequenceList'); box.innerHTML = '';
  piece.hands[currentHand].forEach((ev, i) => {
    const chip = document.createElement('div'); chip.className = 'chip';
    const dStr = ev.duration.replace('.d','') + (ev.duration.includes('.d')?' (pkt)':'');
    let text = ev.type === 'note' ? ev.keys.map((k,idx) => getSpelling(k, ev.spellings?.[idx]||'sharp').label).join(',') : 'Pause';
    chip.innerHTML = `<span>${text} (${dStr})</span><button class="remove-ch" onclick="removeEvent(${i})">×</button>`;
    box.appendChild(chip);
  });
}

/* ============================================================
   VexFlow & Edit-Logik (Dynamische Breite & Beaming)
   ============================================================ */
function VF() { return window.Vex.Flow || window.VexFlow; }
function parseDuration(d) { return { duration: d.replace('.d',''), dots: d.endsWith('.d')?1:0 }; }
function eventBeats(ev) {
  const { duration, dots } = parseDuration(ev.duration);
  const base = { 'w':4, 'h':2, 'q':1, '8':0.5, '16':0.25 }[duration] || 1;
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
function buildIndexMap(measures) {
  let counter = 0; return measures.map(m => m.map(() => counter++));
}

function makeStaveNote(ev, clef) {
  const vf = VF(); const { duration, dots } = parseDuration(ev.duration);
  if (ev.type === 'rest') {
    const note = new vf.StaveNote({ clef, keys: [clef==='treble'?'b/4':'d/3'], duration: duration+'r' });
    if (dots) vf.Dot.buildAndAttach([note], { all: true }); return note;
  }
  const pairs = ev.keys.map((k, i) => ({ k, sp: ev.spellings?.[i]||'sharp', midi: getKeyData(k).midi })).sort((a,b)=>a.midi-b.midi);
  const vexKeys = [], acc = [];
  pairs.forEach((p, i) => {
    const s = getSpelling(p.k, p.sp); vexKeys.push(s.vexKey);
    if (s.accidental) acc.push({ i, a: s.accidental });
  });
  const note = new vf.StaveNote({ clef, keys: vexKeys, duration });
  acc.forEach(x => note.addModifier(new vf.Accidental(x.a), x.i));
  if (dots) vf.Dot.buildAndAttach([note], { all: true }); return note;
}

function renderSheet() {
  const vf = VF(); if (!vf) return;
  const host = document.getElementById('sheetHost'); host.innerHTML = '';
  noteElementMap = [];

  const tsStr = (document.getElementById('timeSigInput').value || '').trim();
  let bpm = null, numB = 4, den = 4;
  if (/^\d+\/\d+$/.test(tsStr)) { const p = tsStr.split('/'); numB = +p[0]; den = +p[1]; bpm = numB * (4/den); }
  
  const layoutMeasures = parseInt(document.getElementById('layoutMeasures').value) || 4;
  const layoutScale = (parseInt(document.getElementById('layoutScale').value) || 100) / 100;

  const rM = groupIntoMeasures(piece.hands.right, bpm);
  const lM = groupIntoMeasures(piece.hands.left, bpm);
  const mCount = Math.max(rM.length, lM.length, 1);
  const rIdx = buildIndexMap(rM), lIdx = buildIndexMap(lM);

  const baseWidth = 1180;
  const mPerLine = Math.min(layoutMeasures, Math.max(1, mCount));
  const lineCount = Math.ceil(mCount / mPerLine);
  
  const renderer = new vf.Renderer(host, vf.Renderer.Backends.SVG);
  renderer.resize(baseWidth * layoutScale, (lineCount * 220 + 40) * layoutScale);
  const ctx = renderer.getContext();
  ctx.scale(layoutScale, layoutScale);

  const drawnNotes = [];

  // NEU: Dynamische Breitenberechnung
  for (let line = 0; line < lineCount; line++) {
    const startM = line * mPerLine; 
    const endM = Math.min(startM + mPerLine, mCount);
    let yOffset = line * 220;
    
    // Berechne das "Gewicht" (Anzahl der Töne) der Takte für diese Zeile
    let lineMeasuresInfo = [];
    let totalWeight = 0;
    for (let m = startM; m < endM; m++) {
      const rW = rM[m] ? rM[m].length : 0;
      const lW = lM[m] ? lM[m].length : 0;
      const weight = Math.max(rW, lW, 2); // Mindestens Gewicht 2, damit leere Takte nicht verschwinden
      lineMeasuresInfo.push({ m, weight });
      totalWeight += weight;
    }
    
    // 90px für den allerersten Takt reserviert (Schlüssel & Taktart)
    const availableForNotes = baseWidth - 40 - 90; 
    let xCursor = 20;

    for (let i = 0; i < lineMeasuresInfo.length; i++) {
      const { m, weight } = lineMeasuresInfo[i];
      const isFirstInLine = (i === 0);
      const clefSpace = isFirstInLine ? 90 : 0;
      const w = Math.floor(availableForNotes * (weight / totalWeight)) + clefSpace;
      
      const tS = new vf.Stave(xCursor, 20 + yOffset, w);
      if (isFirstInLine) tS.addClef('treble'); if (m===0 && bpm) tS.addTimeSignature(tsStr);
      tS.setContext(ctx).draw();
      
      const bS = new vf.Stave(xCursor, 120 + yOffset, w);
      if (isFirstInLine) bS.addClef('bass'); if (m===0 && bpm) bS.addTimeSignature(tsStr);
      bS.setContext(ctx).draw();

      if (isFirstInLine) {
        new vf.StaveConnector(tS, bS).setType(3).setContext(ctx).draw();
        new vf.StaveConnector(tS, bS).setType(1).setContext(ctx).draw();
      }
      new vf.StaveConnector(tS, bS).setType(6).setContext(ctx).draw();

      const rNotes = drawVoice(ctx, tS, rM[m]||[], 'treble', bpm?{num:numB,den}:null);
      const lNotes = drawVoice(ctx, bS, lM[m]||[], 'bass', bpm?{num:numB,den}:null);
      
      (rNotes||[]).forEach((n,idx) => drawnNotes.push({ note: n, h: 'right', idx: rIdx[m][idx] }));
      (lNotes||[]).forEach((n,idx) => drawnNotes.push({ note: n, h: 'left', idx: lIdx[m][idx] }));
      
      xCursor += w;
    }
  }

  drawnNotes.forEach(e => {
    const el = e.note.getSVGElement ? e.note.getSVGElement() : null;
    if (!el) return;
    el.classList.add('vf-stavenote');
    el.onclick = (ev) => { ev.stopPropagation(); selectNoteInSheet(e.h, e.idx); };
    noteElementMap.push({ el, h: e.h, idx: e.idx });
  });

  if (selectedNote) restoreSelectionVisual();
}

function drawVoice(ctx, stave, events, clef, ts) {
  if (!events.length) return [];
  const vf = VF(); 
  const notes = events.map(ev => makeStaveNote(ev, clef));
  const v = new vf.Voice({ num_beats: ts?ts.num:4, beat_value: ts?ts.den:4 }).setStrict(false);
  v.addTickables(notes);
  new vf.Formatter().joinVoices([v]).format([v], Math.max(60, stave.getWidth()-40));
  v.draw(ctx, stave);
  
  // NEU: Auto-Beaming (Fähnchen verbinden)
  try {
    const beams = vf.Beam.generateBeams(notes);
    beams.forEach(b => b.setContext(ctx).draw());
  } catch(e) { 
    // Falsche Taktarten ignorieren wir fürs Beaming leise
  }
  
  return notes;
}

/* ---------- Interaktives Editieren ---------- */
function clearHighlights() {
  document.querySelectorAll('.key-white.highlight, .key-black.highlight').forEach(b => b.classList.remove('highlight'));
}
function selectNoteInSheet(hand, idx) {
  const ev = piece.hands[hand][idx]; if (!ev) return;
  selectedNote = { hand, index: idx };
  clearHighlights();
  if (ev.type === 'note') {
    ev.keys.forEach(k => { const b = document.querySelector(`[data-key="${k}"]`); if(b) b.classList.add('highlight'); });
    const btn = document.querySelector(`[data-key="${ev.keys[0]}"]`);
    if(btn) document.getElementById('keyboardScroll').scrollTo({ left: btn.offsetLeft - 300, behavior: 'smooth' });
  }
  document.querySelectorAll('.note-selected').forEach(e => e.classList.remove('note-selected'));
  const ne = noteElementMap.find(m => m.h === hand && m.idx === idx);
  if (ne) ne.el.classList.add('note-selected');
  openEditPanel(ev);
}
function restoreSelectionVisual() {
  if (!selectedNote) return;
  const ev = piece.hands[selectedNote.hand][selectedNote.index];
  if (!ev) { selectedNote = null; return; }
  clearHighlights();
  if (ev.type === 'note') ev.keys.forEach(k => document.querySelector(`[data-key="${k}"]`)?.classList.add('highlight'));
  document.querySelectorAll('.note-selected').forEach(e => e.classList.remove('note-selected'));
  const ne = noteElementMap.find(m => m.h === selectedNote.hand && m.idx === selectedNote.index);
  if (ne) ne.el.classList.add('note-selected');
}

function openEditPanel(ev) {
  document.getElementById('editPanel').hidden = false;
  document.body.classList.add('editing'); 
  
  document.getElementById('editHand').textContent = selectedNote.hand === 'right' ? 'Rechts' : 'Links';
  document.getElementById('editIndex').textContent = (selectedNote.index + 1);
  document.getElementById('editKeys').textContent = ev.type==='rest'?'Pause':ev.keys.map((k,i)=>getSpelling(k,ev.spellings?.[i]||'sharp').label).join(', ');
  
  const { duration, dots } = parseDuration(ev.duration);
  document.getElementById('editDuration').value = duration;
  document.getElementById('editDotted').checked = (dots === 1);
  
  const accList = document.getElementById('editAccidentalList'); accList.innerHTML = '';
  document.getElementById('editAccidentalRow').style.display = 'none';
  if (ev.type === 'note') {
    ev.keys.forEach((k, idx) => {
      if (!getKeyData(k).isBlack) return;
      document.getElementById('editAccidentalRow').style.display = '';
      const sp = getSpelling(k, ev.spellings?.[idx]||'sharp');
      const btn = document.createElement('button');
      btn.className = 'acc-chip' + (ev.spellings?.[idx]==='flat'?' flat':'');
      btn.textContent = sp.label;
      btn.onclick = () => {
        ev.spellings[idx] = ev.spellings[idx]==='sharp'?'flat':'sharp';
        renderSequence(); renderSheet(); autoSave(); openEditPanel(ev);
      };
      accList.appendChild(btn);
    });
  }
}
function closeEditPanel() {
  document.getElementById('editPanel').hidden = true;
  document.body.classList.remove('editing');
  selectedNote = null; clearHighlights();
  document.querySelectorAll('.note-selected').forEach(e => e.classList.remove('note-selected'));
}
function applyEditDuration() {
  if(!selectedNote) return; const ev = piece.hands[selectedNote.hand][selectedNote.index];
  let d = document.getElementById('editDuration').value; if(document.getElementById('editDotted').checked) d += '.d';
  ev.duration = d; renderSequence(); renderSheet(); autoSave(); openEditPanel(ev);
}
function moveEvent(dir) {
  if(!selectedNote) return; const arr = piece.hands[selectedNote.hand], i = selectedNote.index, j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]]; selectedNote.index = j;
  renderSequence(); renderSheet(); autoSave(); openEditPanel(arr[j]);
}
function deleteSelectedEvent() {
  if(!selectedNote) return;
  piece.hands[selectedNote.hand].splice(selectedNote.index, 1);
  closeEditPanel(); renderSequence(); renderSheet(); autoSave();
}

/* ---------- Export & Save ---------- */
function exportPNG() {
  const svg = document.querySelector('#sheetHost svg'); if (!svg) return;
  const src = new XMLSerializer().serializeToString(svg).replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  const img = new Image(); const url = URL.createObjectURL(new Blob([src], {type:'image/svg+xml'}));
  img.onload = () => {
    const c = document.createElement('canvas'); const s = 2; // High-Res
    c.width = (parseInt(svg.getAttribute('width'))||svg.clientWidth) * s;
    c.height = (parseInt(svg.getAttribute('height'))||svg.clientHeight) * s;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,c.width,c.height);
    ctx.scale(s,s); ctx.drawImage(img,0,0); URL.revokeObjectURL(url);
    const a = document.createElement('a'); a.download = 'notenblatt.png'; a.href = c.toDataURL(); a.click();
  };
  img.src = url;
}
function getStorageKey() { return 'piano_notes_pieces'; }
function savePiece() {
  const n = document.getElementById('saveName').value || 'Unbenannt';
  piece.title = document.getElementById('titleInput').value || piece.title;
  piece.timeSignature = document.getElementById('timeSigInput').value || piece.timeSignature;
  const all = JSON.parse(localStorage.getItem(getStorageKey())||'{}');
  all[n] = JSON.parse(JSON.stringify(piece)); localStorage.setItem(getStorageKey(), JSON.stringify(all));
  renderSavedList(); alert('Gespeichert.');
}
function loadPiece() {
  const n = document.getElementById('saveName').value;
  const all = JSON.parse(localStorage.getItem(getStorageKey())||'{}');
  if (all[n]) {
    piece = JSON.parse(JSON.stringify(all[n]));
    ['right','left'].forEach(h => (piece.hands[h]||[]).forEach(e => { if(e.type==='note'&&!e.spellings) e.spellings=e.keys.map(()=>'sharp'); }));
    document.getElementById('titleInput').value = piece.title||'';
    document.getElementById('timeSigInput').value = piece.timeSignature||'';
    renderSequence(); renderSheet();
  } else alert('Nicht gefunden.');
}
function deletePiece(n) {
  if (!confirm('Löschen?')) return;
  const all = JSON.parse(localStorage.getItem(getStorageKey())||'{}'); delete all[n];
  localStorage.setItem(getStorageKey(), JSON.stringify(all)); renderSavedList();
}
function renderSavedList() {
  const b = document.getElementById('savedList'); b.innerHTML = '';
  Object.keys(JSON.parse(localStorage.getItem(getStorageKey())||'{}')).forEach(n => {
    const d = document.createElement('div'); d.className = 'saved-item';
    d.innerHTML = `<span>${n}</span><button class="btn-load" onclick="document.getElementById('saveName').value='${n}';loadPiece()">Laden</button><button class="btn-del" onclick="deletePiece('${n}')">×</button>`;
    b.appendChild(d);
  });
}
function autoSave() {
  const all = JSON.parse(localStorage.getItem(getStorageKey())||'{}');
  all['Auto-Speichern'] = JSON.parse(JSON.stringify(piece));
  localStorage.setItem(getStorageKey(), JSON.stringify(all)); renderSavedList();
}

function init() {
  buildKeyboard(); renderSequence(); renderSavedList();
  setTimeout(renderSheet, 100);
  document.getElementById('keyboard').ondblclick = (e) => {
    const b = e.target.closest('.key-white, .key-black'); if(!b) return;
    const i = MAP_88[parseInt(b.dataset.key)-1]; if(!i) return;
    selectedKeys.clear(); selectedKeys.add(i.keyNum); addNote();
  };
  document.getElementById('timeSigInput').onchange = renderSheet;
}
window.addEventListener('DOMContentLoaded', init);
