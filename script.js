/* ============================================================
   Piano Notenblatt — VexFlow mit wählbaren Vorzeichen
   ============================================================ */

let currentHand = 'right';
let piece = {
  title: 'Mein Stück',
  timeSignature: '4/4',
  hands: { right: [], left: [] }
};

// Globaler Vorzeichen-Modus: 'sharp' oder 'flat'
let accidentalMode = 'sharp';

// Pro-Taste-Overrides für die aktuelle Auswahl:
// Map: keyNum -> 'sharp' | 'flat'
let selectedAccidentals = new Map();

/* ---------- 88-Tasten-Mapping mit beiden Schreibweisen ---------- */
const MAP_88 = [];
{
  // Chromatisch ab A: A, A#/Bb, B, C, C#/Db, D, D#/Eb, E, F, F#/Gb, G, G#/Ab
  // sharpName / flatName in VexFlow-Notation ("c/4", "db/4" …)
  // Bei b/cb und e#/fb usw. brauchen wir Oktavwechsel korrekt.
  const scheme = [
    // { sharpLetter, sharpAcc, flatLetter, flatAcc, isBlack, display }
    { sL:'a',  sA:'',  fL:'a',  fA:'',  black:false, disp:'A'  },
    { sL:'a',  sA:'#', fL:'b',  fA:'b', black:true,  disp:'A♯/B♭' },
    { sL:'b',  sA:'',  fL:'b',  fA:'',  black:false, disp:'B'  },
    { sL:'c',  sA:'',  fL:'c',  fA:'',  black:false, disp:'C'  },
    { sL:'c',  sA:'#', fL:'d',  fA:'b', black:true,  disp:'C♯/D♭' },
    { sL:'d',  sA:'',  fL:'d',  fA:'',  black:false, disp:'D'  },
    { sL:'d',  sA:'#', fL:'e',  fA:'b', black:true,  disp:'D♯/E♭' },
    { sL:'e',  sA:'',  fL:'e',  fA:'',  black:false, disp:'E'  },
    { sL:'f',  sA:'',  fL:'f',  fA:'',  black:false, disp:'F'  },
    { sL:'f',  sA:'#', fL:'g',  fA:'b', black:true,  disp:'F♯/G♭' },
    { sL:'g',  sA:'',  fL:'g',  fA:'',  black:false, disp:'G'  },
    { sL:'g',  sA:'#', fL:'a',  fA:'b', black:true,  disp:'G♯/A♭' }
  ];

  for (let i = 0; i < 88; i++) {
    const midi = 21 + i;
    // Wissenschaftliche Oktave: C4 = MIDI 60
    const scientificOctave = Math.floor(midi / 12) - 1;
    const pcFromA = i % 12;
    const s = scheme[pcFromA];

    // Für die Sharp-Schreibweise verwenden wir die Oktave des Grundbuchstabens.
    // Beispiel B♭4 (MIDI 70) ist als „a#/4" korrekt.
    // Für die Flat-Schreibweise kann sich die Oktave ändern:
    //   A♯4 (MIDI 70) = B♭4 → gleiche Oktave (Grundbuchstabe B)
    //   G♯4 (MIDI 68) = A♭4 → gleiche Oktave (Grundbuchstabe A)
    // Ausnahme wäre nur bei Cb/B# — kommt hier nicht vor, weil wir nur die
    // 5 schwarzen Tasten enharmonisch umschalten (A#↔Bb, C#↔Db, D#↔Eb, F#↔Gb, G#↔Ab).
    const sharpOctave = scientificOctave;
    const flatOctave  = scientificOctave;

    MAP_88.push({
      keyNum: i + 1,
      midi,
      isBlack: s.black,
      displayName: s.disp,
      // Zwei Schreibweisen mit VexFlow-Key + Vorzeichen-Modifier
      sharp: {
        vexKey: s.sL + '/' + sharpOctave,
        accidental: s.sA || null,
        label: s.sL.toUpperCase() + (s.sA === '#' ? '♯' : '') + sharpOctave
      },
      flat: {
        vexKey: s.fL + '/' + flatOctave,
        accidental: s.fA || null,
        label: s.fL.toUpperCase() + (s.fA === 'b' ? '♭' : '') + flatOctave
      }
    });
  }
}

function getKeyData(num) { return MAP_88[num - 1] || null; }

// Liefert Schreibweise für ein Event/eine Taste
function getSpelling(keyNum, spelling) {
  const d = getKeyData(keyNum);
  if (!d) return null;
  if (!d.isBlack) return d.sharp; // egal, weiße Taste
  return spelling === 'flat' ? d.flat : d.sharp;
}

/* ---------- Klaviatur bauen ---------- */
function buildKeyboard() {
  const container = document.getElementById('keyboard');
  container.innerHTML = '';
  MAP_88.forEach(item => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = item.isBlack ? 'key-black' : 'key-white';
    btn.dataset.key = item.keyNum;
    btn.setAttribute('aria-label', item.displayName);

    // Beschriftung: Bei schwarzen Tasten die aktuelle Schreibweise anzeigen
    const label = item.isBlack
      ? (accidentalMode === 'flat' ? item.flat.label : item.sharp.label)
      : item.sharp.label;

    btn.innerHTML = `
      <span class="key-num">${item.keyNum}</span>
      <span class="key-note">${label}</span>
    `;
    btn.addEventListener('click', () => handleKeyClick(item));
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      toggleKeyAccidental(item);
    });

    if (item.isBlack) {
      const whiteBefore = MAP_88.slice(0, item.keyNum - 1).filter(s => !s.isBlack).length;
      btn.style.left = (whiteBefore * 30 - 11) + 'px';
    }
    container.appendChild(btn);
  });
}

// Aktualisiert die Beschriftung der schwarzen Tasten, wenn Modus wechselt
function refreshKeyboardLabels() {
  document.querySelectorAll('.key-black').forEach(btn => {
    const k = parseInt(btn.dataset.key);
    const item = getKeyData(k);
    if (!item) return;
    // Wenn Taste ausgewählt und individuellen Override hat, den nehmen
    const spelling = selectedAccidentals.get(k) || accidentalMode;
    const label = spelling === 'flat' ? item.flat.label : item.sharp.label;
    const noteSpan = btn.querySelector('.key-note');
    if (noteSpan) noteSpan.textContent = label;
    btn.classList.toggle('flat-mode', spelling === 'flat');
  });
}

function onAccidentalModeChange() {
  accidentalMode = document.getElementById('accidentalSelect').value;
  // Individuelle Overrides zurücksetzen, damit der neue Modus sichtbar wirkt
  selectedAccidentals.clear();
  refreshKeyboardLabels();
}

/* ---------- Auswahl ---------- */
let selectedKeys = new Set();

function handleKeyClick(item) {
  if (selectedKeys.has(item.keyNum)) {
    selectedKeys.delete(item.keyNum);
    selectedAccidentals.delete(item.keyNum);
  } else {
    selectedKeys.add(item.keyNum);
  }
  updateSelectionVisual();
  refreshKeyboardLabels();
}

// Rechtsklick: Vorzeichen dieser einen Taste umschalten (nur schwarze Tasten sinnvoll)
function toggleKeyAccidental(item) {
  if (!item.isBlack) return;
  const current = selectedAccidentals.get(item.keyNum) || accidentalMode;
  const next = current === 'sharp' ? 'flat' : 'sharp';
  selectedAccidentals.set(item.keyNum, next);
  // Falls Taste noch nicht ausgewählt, direkt auswählen
  selectedKeys.add(item.keyNum);
  updateSelectionVisual();
  refreshKeyboardLabels();
}

function updateSelectionVisual() {
  document.querySelectorAll('.key-white, .key-black').forEach(btn => {
    const k = parseInt(btn.dataset.key);
    btn.classList.toggle('active', selectedKeys.has(k));
  });
}

/* ---------- Eingabe ---------- */
function getDurationValue() {
  let d = document.getElementById('durationSelect').value;
  if (document.getElementById('dottedCheck').checked) d += '.d';
  return d;
}

function addNote() {
  if (!selectedKeys.size) { alert('Bitte mindestens eine Taste wählen.'); return; }
  const sorted = Array.from(selectedKeys).sort((a, b) => a - b);
  // Pro Taste die Schreibweise festhalten
  const spellings = sorted.map(k => {
    const item = getKeyData(k);
    if (!item.isBlack) return 'sharp';
    return selectedAccidentals.get(k) || accidentalMode;
  });
  piece.hands[currentHand].push({
    type: 'note',
    keys: sorted,
    spellings, // parallel zu keys
    duration: getDurationValue()
  });
  selectedKeys.clear();
  selectedAccidentals.clear();
  updateSelectionVisual();
  refreshKeyboardLabels();
  renderSequence(); renderSheet(); autoSave();
}

function addRest() {
  piece.hands[currentHand].push({ type: 'rest', duration: getDurationValue() });
  renderSequence(); renderSheet(); autoSave();
}
function undoLast() {
  if (piece.hands[currentHand].length) {
    piece.hands[currentHand].pop();
    renderSequence(); renderSheet(); autoSave();
  }
}
function clearHand() {
  if (!confirm('Spur wirklich leeren?')) return;
  piece.hands[currentHand] = [];
  renderSequence(); renderSheet(); autoSave();
}
function removeEvent(index) {
  piece.hands[currentHand].splice(index, 1);
  renderSequence(); renderSheet(); autoSave();
}
function switchHand(hand) {
  currentHand = hand;
  document.querySelectorAll('.hand-btn').forEach(b => b.classList.toggle('active', b.dataset.hand === hand));
  document.getElementById('currentHandLabel').textContent = hand === 'right' ? 'Rechte Hand' : 'Linke Hand';
  renderSequence();
}

/* ---------- Sequenz-Anzeige ---------- */
function formatDur(d) {
  const base = d.replace('.d', '');
  const names = { 'w':'Ganz', 'h':'Halb', 'q':'Viertel', '8':'Achtel', '16':'Sechzehntel' };
  let label = names[base] || base;
  if (d.includes('.d')) label += ' (pkt)';
  return label;
}
function renderSequence() {
  const box = document.getElementById('sequenceList');
  box.innerHTML = '';
  const events = piece.hands[currentHand];
  if (!events.length) return;
  events.forEach((ev, i) => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    let text;
    if (ev.type === 'note') {
      text = ev.keys.map((k, idx) => {
        const spelling = (ev.spellings && ev.spellings[idx]) || 'sharp';
        const sp = getSpelling(k, spelling);
        return sp ? sp.label : '?';
      }).join(', ');
    } else {
      text = 'Pause';
    }
    text += ' (' + formatDur(ev.duration) + ')';
    chip.innerHTML = `<span>${text}</span><button class="remove-ch" onclick="removeEvent(${i})" aria-label="Entfernen">×</button>`;
    box.appendChild(chip);
  });
}

/* ============================================================
   VexFlow-Rendering
   ============================================================ */
function VF() {
  return (window.Vex && window.Vex.Flow) ? window.Vex.Flow : window.VexFlow;
}

function parseDuration(d) {
  const dots = d.endsWith('.d') ? 1 : 0;
  const base = d.replace('.d', '');
  return { duration: base, dots };
}

function makeStaveNote(ev, clef) {
  const vf = VF();
  const { duration, dots } = parseDuration(ev.duration);

  if (ev.type === 'rest') {
    const restKey = clef === 'treble' ? 'b/4' : 'd/3';
    const note = new vf.StaveNote({ clef, keys: [restKey], duration: duration + 'r' });
    if (dots) vf.Dot.buildAndAttach([note], { all: true });
    return note;
  }

  // Akkord/Note mit individuellen Schreibweisen
  // Sortierung nach Tonhöhe (MIDI), damit VexFlow konsistent rendert
  const pairs = ev.keys.map((k, idx) => {
    const spelling = (ev.spellings && ev.spellings[idx]) || 'sharp';
    return { keyNum: k, spelling, midi: getKeyData(k).midi };
  }).sort((a, b) => a.midi - b.midi);

  const vexKeys = [];
  const accidentals = []; // Array von { index, symbol }
  pairs.forEach((p, i) => {
    const sp = getSpelling(p.keyNum, p.spelling);
    vexKeys.push(sp.vexKey);
    if (sp.accidental) accidentals.push({ index: i, symbol: sp.accidental });
  });

  const note = new vf.StaveNote({ clef, keys: vexKeys, duration });
  accidentals.forEach(a => {
    note.addModifier(new vf.Accidental(a.symbol), a.index);
  });
  if (dots) vf.Dot.buildAndAttach([note], { all: true });
  return note;
}

function eventBeats(ev) {
  const { duration, dots } = parseDuration(ev.duration);
  const base = { 'w': 4, 'h': 2, 'q': 1, '8': 0.5, '16': 0.25 }[duration] || 1;
  return dots ? base * 1.5 : base;
}

function groupIntoMeasures(events, beatsPerMeasure) {
  if (!beatsPerMeasure) return [events];
  const measures = [];
  let current = [];
  let currentBeats = 0;
  for (const ev of events) {
    const b = eventBeats(ev);
    if (currentBeats + b > beatsPerMeasure + 0.0001 && current.length > 0) {
      measures.push(current);
      current = [];
      currentBeats = 0;
    }
    current.push(ev);
    currentBeats += b;
  }
  if (current.length) measures.push(current);
  return measures;
}

function renderSheet() {
  const vf = VF();
  if (!vf) { console.warn('VexFlow nicht geladen'); return; }

  const host = document.getElementById('sheetHost');
  host.innerHTML = '';

  const timeSigStr = (document.getElementById('timeSigInput').value || '').trim();
  let numBeats = null, beatValue = 4;
  let hasTimeSig = false;
  if (timeSigStr && /^\d+\/\d+$/.test(timeSigStr)) {
    const [n, d] = timeSigStr.split('/').map(Number);
    if (n > 0 && d > 0) { numBeats = n; beatValue = d; hasTimeSig = true; }
  }
  const beatsPerMeasure = hasTimeSig ? (numBeats * (4 / beatValue)) : null;

  const rightMeasures = groupIntoMeasures(piece.hands.right, beatsPerMeasure);
  const leftMeasures  = groupIntoMeasures(piece.hands.left, beatsPerMeasure);
  const measureCount = Math.max(rightMeasures.length, leftMeasures.length, 1);

  const pageWidth = 1180;
  const leftMargin = 20;
  const clefWidth = 90;
  const measuresPerLine = Math.min(4, Math.max(1, measureCount));
  const usableWidth = pageWidth - leftMargin - 20;
  const measureWidth = Math.floor((usableWidth - clefWidth) / measuresPerLine);
  const firstMeasureWidth = measureWidth + clefWidth;

  const systemHeight = 220;
  const trebleY = 20;
  const bassY = 120;

  const lineCount = Math.ceil(measureCount / measuresPerLine);
  const totalHeight = lineCount * systemHeight + 40;

  const renderer = new vf.Renderer(host, vf.Renderer.Backends.SVG);
  renderer.resize(pageWidth, totalHeight);
  const context = renderer.getContext();
  context.setFont('Arial', 10);

  for (let line = 0; line < lineCount; line++) {
    const startMeasure = line * measuresPerLine;
    const endMeasure = Math.min(startMeasure + measuresPerLine, measureCount);
    const yOffset = line * systemHeight;

    let xCursor = leftMargin;

    for (let m = startMeasure; m < endMeasure; m++) {
      const isFirstInLine = (m === startMeasure);
      const isFirstEver = (m === 0);
      const width = isFirstInLine ? firstMeasureWidth : measureWidth;

      const trebleStave = new vf.Stave(xCursor, trebleY + yOffset, width);
      if (isFirstInLine) trebleStave.addClef('treble');
      if (isFirstEver && hasTimeSig) trebleStave.addTimeSignature(timeSigStr);
      trebleStave.setContext(context).draw();

      const bassStave = new vf.Stave(xCursor, bassY + yOffset, width);
      if (isFirstInLine) bassStave.addClef('bass');
      if (isFirstEver && hasTimeSig) bassStave.addTimeSignature(timeSigStr);
      bassStave.setContext(context).draw();

      if (isFirstInLine) {
        new vf.StaveConnector(trebleStave, bassStave).setType(3).setContext(context).draw();
        new vf.StaveConnector(trebleStave, bassStave).setType(1).setContext(context).draw();
      }
      new vf.StaveConnector(trebleStave, bassStave).setType(6).setContext(context).draw();

      drawMeasureVoice(context, trebleStave, rightMeasures[m] || [], 'treble', hasTimeSig ? { num: numBeats, den: beatValue } : null);
      drawMeasureVoice(context, bassStave,   leftMeasures[m]  || [], 'bass',   hasTimeSig ? { num: numBeats, den: beatValue } : null);

      xCursor += width;
    }
  }
}

function drawMeasureVoice(context, stave, events, clef, timeSig) {
  const vf = VF();
  if (!events.length) return;

  const notes = events.map(ev => makeStaveNote(ev, clef));
  const voice = new vf.Voice({
    num_beats: timeSig ? timeSig.num : 4,
    beat_value: timeSig ? timeSig.den : 4
  });
  voice.setStrict(false);
  voice.addTickables(notes);

  const formatWidth = Math.max(60, stave.getWidth() - (stave.getNoteStartX() - stave.getX()) - 20);
  new vf.Formatter().joinVoices([voice]).format([voice], formatWidth);
  voice.draw(context, stave);
}

/* ---------- Export als PNG ---------- */
function exportPNG() {
  const host = document.getElementById('sheetHost');
  const svg = host.querySelector('svg');
  if (!svg) { alert('Kein Notenblatt vorhanden.'); return; }

  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(svg);
  if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
    source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  const svgBlob = new Blob(['<?xml version="1.0" standalone="no"?>\r\n' + source], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = function () {
    const scale = 2;
    const w = svg.getAttribute('width') ? parseInt(svg.getAttribute('width')) : svg.clientWidth;
    const h = svg.getAttribute('height') ? parseInt(svg.getAttribute('height')) : svg.clientHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const link = document.createElement('a');
    link.download = (document.getElementById('titleInput').value || 'notenblatt') + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };
  img.onerror = function () { alert('Export fehlgeschlagen.'); URL.revokeObjectURL(url); };
  img.src = url;
}

/* ---------- Speicher (unverändert) ---------- */
function getStorageKey() { return 'piano_notes_pieces'; }
function savePiece() {
  const name = document.getElementById('saveName').value || 'Unbenannt';
  piece.title = document.getElementById('titleInput').value || piece.title;
  piece.timeSignature = document.getElementById('timeSigInput').value || piece.timeSignature;
  const all = JSON.parse(localStorage.getItem(getStorageKey()) || '{}');
  all[name] = JSON.parse(JSON.stringify(piece));
  localStorage.setItem(getStorageKey(), JSON.stringify(all));
  renderSavedList();
  alert('"' + name + '" gespeichert.');
}
function loadPiece() {
  const name = document.getElementById('saveName').value || 'Mein Stück';
  const all = JSON.parse(localStorage.getItem(getStorageKey()) || '{}');
  if (all[name]) {
    piece = JSON.parse(JSON.stringify(all[name]));
    // Migration: alte Stücke ohne spellings-Array bekommen 'sharp' als Default
    ['right', 'left'].forEach(h => {
      (piece.hands[h] || []).forEach(ev => {
        if (ev.type === 'note' && !ev.spellings) {
          ev.spellings = ev.keys.map(() => 'sharp');
        }
      });
    });
    document.getElementById('titleInput').value = piece.title || '';
    document.getElementById('timeSigInput').value = piece.timeSignature || '';
    renderSequence(); renderSheet();
  } else alert('Stück nicht gefunden: ' + name);
}
function deletePiece(name) {
  if (!confirm('"' + name + '" wirklich löschen?')) return;
  const all = JSON.parse(localStorage.getItem(getStorageKey()) || '{}');
  delete all[name];
  localStorage.setItem(getStorageKey(), JSON.stringify(all));
  renderSavedList();
}
function renderSavedList() {
  const box = document.getElementById('savedList');
  const all = JSON.parse(localStorage.getItem(getStorageKey()) || '{}');
  const names = Object.keys(all);
  box.innerHTML = '';
  if (!names.length) return;
  names.forEach(name => {
    const item = document.createElement('div');
    item.className = 'saved-item';
    item.innerHTML = `<span>${name}</span><button class="btn-load" onclick="loadNamedPiece('${name}')">Laden</button><button class="btn-del" onclick="deletePiece('${name}')">×</button>`;
    box.appendChild(item);
  });
}
function loadNamedPiece(name) {
  document.getElementById('saveName').value = name;
  loadPiece();
}
function autoSave() {
  const all = JSON.parse(localStorage.getItem(getStorageKey()) || '{}');
  all['Auto-Speichern'] = JSON.parse(JSON.stringify(piece));
  localStorage.setItem(getStorageKey(), JSON.stringify(all));
  renderSavedList();
}

/* ---------- Init ---------- */
function init() {
  buildKeyboard();
  refreshKeyboardLabels();
  renderSequence();
  renderSavedList();
  setTimeout(renderSheet, 100);

  document.getElementById('keyboard').addEventListener('dblclick', (e) => {
    const btn = e.target.closest('.key-white, .key-black');
    if (!btn) return;
    const item = MAP_88[parseInt(btn.dataset.key) - 1];
    if (!item) return;
    selectedKeys.clear();
    selectedKeys.add(item.keyNum);
    addNote();
  });

  document.getElementById('timeSigInput').addEventListener('change', renderSheet);
}
window.addEventListener('DOMContentLoaded', init);