/* ============================================================
   Piano Notenblatt — Robuste Kernlogik
   ============================================================ */

let currentHand = 'right';
let piece = {
  title: 'Mein Stueck',
  timeSignature: '4/4',
  hands: { right: [], left: [] }
};

/* ---------- Noten- und Tastatur-Mapping (88 Tasten) ---------- */
const NOTE_NAMES = ['A','A#','B','C','C#','D','D#','E','F','F#','G','G#'];
const MAP_88 = [];
for (let i = 0; i < 88; i++) {
  const midi = 21 + i; // MIDI 21 = A0
  const octave = Math.floor((midi - 12) / 12); // MIDI 21 -> 0, MIDI 60 -> 4, MIDI 108 -> 8
  const noteIndex = (midi - 21) % 12; // 0 = A, 1 = A#, 2 = B, 3 = C, 4 = C#, 5 = D, 6 = D#, 7 = E, 8 = F, 9 = F#, 10 = G, 11 = G#
  // Umrechnung: A (Index 0) -> A, C (Index 3) -> C, etc.
  // Wir wollen: C als erste weiße Taste in der Anzeige? Nein, wir zeigen alle korrekt.
  // Die interne VexFlow-Notation: a/0, a#/0, b/0, c/1, c#/1, d/1, ...
  // Wir behalten die einfache Zuordnung bei und zeigen den richtigen Namen.
  const chromaticNames = ['a','a#','b','c','c#','d','d#','e','f','f#','g','g#'];
  const name = chromaticNames[noteIndex];
  const displayName = NOTE_NAMES[noteIndex % 12];
  MAP_88.push({
    keyNum: i + 1,
    midi: midi,
    displayName: displayName,
    octave: octave,
    isSharp: name.includes('#'),
    isBlack: name.includes('#'),
    // VexFlow-Notation: Kleinbuchstabe + Oktave
    vexName: name + '/' + octave
  });
}

/* ---------- Hilfsfunktionen ---------- */
function getKeyData(num) {
  return MAP_88[num - 1] || null;
}

function formatDur(durationStr) {
  const base = durationStr.replace('.d', '');
  const names = {
    'w': 'Ganz',
    'h': 'Halb',
    'q': 'Viertel',
    '8': 'Achtel',
    '16': 'Sechzehntel'
  };
  let label = names[base] || base;
  if (durationStr.includes('.d')) label += ' (pkt)';
  return label;
}

/* ---------- Klaviatur erstellen (alle 88 Tasten) ---------- */
function buildKeyboard() {
  const container = document.getElementById('keyboard');
  container.innerHTML = '';
  MAP_88.forEach(item => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = item.isBlack ? 'key-black' : 'key-white';
    btn.dataset.key = item.keyNum;
    btn.setAttribute('aria-label', `${item.displayName}${item.octave}`);
    btn.innerHTML = `
      <span class="key-num">${item.keyNum}</span>
      <span class="key-note">${item.displayName}${item.octave}</span>
    `;
    btn.addEventListener('click', () => handleKeyClick(item));
    if (item.isBlack) {
      // Exakte Pixel-Position: Jede weiße Taste = 30px breit
      const whiteBefore = MAP_88.slice(0, item.keyNum - 1).filter(s => !s.isBlack).length;
      const whiteTotal = MAP_88.filter(s => !s.isBlack).length; // 52
      const leftPx = whiteBefore * 30 - 11; // 11px = halbe schwarze Tastenbreite
      btn.style.left = leftPx + 'px';
    }
    container.appendChild(btn);
  });
}

/* ---------- Auswahl ---------- */
let selectedKeys = new Set();

function handleKeyClick(item) {
  if (selectedKeys.has(item.keyNum)) {
    selectedKeys.delete(item.keyNum);
  } else {
    selectedKeys.add(item.keyNum);
  }
  updateSelectionVisual();
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
  if (!selectedKeys.size) {
    alert('Bitte mindestens eine Taste waehlen.');
    return;
  }
  const sorted = Array.from(selectedKeys).sort((a, b) => a - b);
  piece.hands[currentHand].push({
    type: 'note',
    keys: sorted,
    duration: getDurationValue()
  });
  selectedKeys.clear();
  updateSelectionVisual();
  renderSequence();
  renderSheet();
  autoSave();
}

function addRest() {
  piece.hands[currentHand].push({
    type: 'rest',
    duration: getDurationValue()
  });
  renderSequence();
  renderSheet();
  autoSave();
}

function undoLast() {
  if (piece.hands[currentHand].length) {
    piece.hands[currentHand].pop();
    renderSequence();
    renderSheet();
    autoSave();
  }
}

function clearHand() {
  if (!confirm('Spur wirklich leeren?')) return;
  piece.hands[currentHand] = [];
  renderSequence();
  renderSheet();
  autoSave();
}

function removeEvent(index) {
  piece.hands[currentHand].splice(index, 1);
  renderSequence();
  renderSheet();
  autoSave();
}

function switchHand(hand) {
  currentHand = hand;
  document.querySelectorAll('.hand-btn').forEach(b => b.classList.toggle('active', b.dataset.hand === hand));
  document.getElementById('currentHandLabel').textContent = hand === 'right' ? 'Rechte Hand' : 'Linke Hand';
  renderSequence();
}

/* ---------- Sequenz-Anzeige ---------- */
function renderSequence() {
  const box = document.getElementById('sequenceList');
  box.innerHTML = '';
  const events = piece.hands[currentHand];
  if (!events.length) {
    box.innerHTML = '<span style="color:var(--text-subtle);font-style:italic;font-size:0.85rem;">Noch keine Noten.</span>';
    return;
  }
  events.forEach((ev, i) => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    let text = ev.type === 'note'
      ? ev.keys.map(k => getKeyData(k)?.displayName + getKeyData(k)?.octave || '?').join(', ')
      : 'Pause';
    text += ' (' + formatDur(ev.duration) + ')';
    chip.innerHTML = `<span>${text}</span><button class="remove-ch" onclick="removeEvent(${i})" aria-label="Entfernen">x</button>`;
    box.appendChild(chip);
  });
}

/* ---------- VexFlow Notenblatt (robust) ---------- */
function renderSheet() {
  const canvas = document.getElementById('vexCanvas');
  const VF = VexFlow;
  const renderer = new VF.Renderer(canvas, VF.Renderer.Backends.CANVAS);
  renderer.resize(1200, 600);
  const ctx = renderer.getContext();
  ctx.clearRect(0, 0, 1200, 600);

  const timeSigStr = (document.getElementById('timeSigInput').value || '4/4').trim();
  const startX = 60;
  const rightStave = new VF.Stave(startX, 100, 1050);
  const leftStave = new VF.Stave(startX, 360, 1050);

  rightStave.addClef('treble').addTimeSignature(timeSigStr);
  leftStave.addClef('bass').addTimeSignature(timeSigStr);

  rightStave.setContext(ctx).draw();
  leftStave.setContext(ctx).draw();

  // Rechte Hand Noten
  const rightNotes = piece.hands.right.map(ev => {
    if (ev.type === 'rest') return new VF.StaveRest({ keys: ['b/4'], duration: ev.duration });
    return new VF.StaveNote({
      keys: ev.keys.map(k => getKeyData(k)?.vexName || 'b/4'),
      duration: ev.duration,
      clef: 'treble'
    });
  });

  // Linke Hand Noten
  const leftNotes = piece.hands.left.map(ev => {
    if (ev.type === 'rest') return new VF.StaveRest({ keys: ['b/4'], duration: ev.duration });
    return new VF.StaveNote({
      keys: ev.keys.map(k => getKeyData(k)?.vexName || 'b/4'),
      duration: ev.duration,
      clef: 'bass'
    });
  });

  // Zeichnen der Noten: Manuelle Positionierung fuer Stabilitaet
  // Wir platzieren jede Note mit festem Abstand (90px) ab Start-X (150)
  const offsetX = 150;
  const spacing = 85;

  rightNotes.forEach((note, i) => {
    const x = offsetX + i * spacing;
    if (x > startX + 1000) return;
    // Wir zeichnen direkt auf dem Canvas mit einer kleinen lokalen Zeile
    // Fuer eine einfache Darstellung: Note direkt zeichnen
    note.setStave(rightStave);
    note.setContext(ctx);
    try { note.draw(); } catch (e) { console.error('Note draw error:', e); }
  });

  leftNotes.forEach((note, i) => {
    const x = offsetX + i * spacing;
    if (x > startX + 1000) return;
    note.setStave(leftStave);
    note.setContext(ctx);
    try { note.draw(); } catch (e) { console.error('Note draw error:', e); }
  });

  // Brace
  const connector = new VF.StaveConnector(rightStave, leftStave);
  connector.setType(VF.StaveConnector.type.BRACE);
  connector.setContext(ctx).draw();
}

/* ---------- Export ---------- */
function exportPNG() {
  const canvas = document.getElementById('vexCanvas');
  const link = document.createElement('a');
  link.download = (document.getElementById('titleInput').value || 'notenblatt') + '.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/* ---------- Speicher ---------- */
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
  const name = document.getElementById('saveName').value || 'Mein Stueck';
  const all = JSON.parse(localStorage.getItem(getStorageKey()) || '{}');
  if (all[name]) {
    piece = JSON.parse(JSON.stringify(all[name]));
    document.getElementById('titleInput').value = piece.title || '';
    document.getElementById('timeSigInput').value = piece.timeSignature || '';
    renderSequence();
    renderSheet();
    alert('"' + name + '" geladen.');
  } else {
    alert('Stueck nicht gefunden: ' + name);
  }
}

function deletePiece(name) {
  if (!confirm('"' + name + '" wirklich loeschen?')) return;
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
  if (!names.length) {
    box.innerHTML = '<span style="color:var(--text-subtle);font-style:italic;font-size:0.85rem;">Noch keine gespeicherten Stuecke.</span>';
    return;
  }
  names.forEach(name => {
    const item = document.createElement('div');
    item.className = 'saved-item';
    item.innerHTML = `<span>${name}</span><button class="btn-load" onclick="loadNamedPiece('${name}')">Laden</button><button class="btn-del" onclick="deletePiece('${name}')">x</button>`;
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
  renderSequence();
  renderSavedList();
  setTimeout(renderSheet, 200);

  // Doppelklick auf Klaviatur = sofort hinzufuegen
  document.getElementById('keyboard').addEventListener('dblclick', (e) => {
    const btn = e.target.closest('.key-white, .key-black');
    if (!btn) return;
    const item = MAP_88[parseInt(btn.dataset.key) - 1];
    if (!item) return;
    selectedKeys.clear();
    selectedKeys.add(item.keyNum);
    addNote();
  });
}

window.addEventListener('DOMContentLoaded', init);
