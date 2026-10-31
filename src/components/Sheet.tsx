import { useEffect, useRef, useState } from 'react';
import { Accidental, Beam, Dot, Formatter, Renderer, Stave, StaveConnector, StaveNote, StaveTie, Voice } from 'vexflow';
import type { Hand, Piece } from '../types';
import { keyName, keySignature, signFor, spell } from '../utils/notes';
import { barTicks, toBars, type Printed } from '../utils/score';

type Clef = 'treble' | 'bass';
const REST_LINE: Record<Clef, string> = { treble: 'b/4', bass: 'd/3' };

const LEFT = 22; // room for the brace
const STAFF_GAP = 100; // top line of the treble staff to top line of the bass staff
const SYSTEM_HEIGHT = 190;
const MIN_BAR = 110;
const TAP_RADIUS = 32; // px; a tap counts for the nearest note this close

interface Bar {
  right: Printed[];
  left: Printed[];
  need: number;
}
export interface DrawnNote {
  hand: Hand;
  id: string;
  el: SVGElement;
}

function buildNotes(printed: Printed[], clef: Clef, piece: Piece) {
  const signature = keySignature(piece.key);
  const signs = new Map<string, string>();
  return printed.map(item => {
    const { ev, dur, dotted } = item;
    let note: StaveNote;
    if (!ev.keys.length) {
      note = new StaveNote({ clef, keys: [REST_LINE[clef]], duration: `${dur}r` });
    } else {
      const spelled = ev.keys.map(k => spell(k, piece.key, ev.spell?.[k]));
      note = new StaveNote({ clef, keys: spelled.map(s => `${s.letter}${s.accidental}/${s.octave}`), duration: dur, auto_stem: true });
      spelled.forEach((s, i) => {
        const sign = item.continued ? null : signFor(s, signature, signs);
        if (sign) note.addModifier(new Accidental(sign), i);
      });
    }
    if (dotted) Dot.buildAndAttach([note], { all: true });
    return note;
  });
}

// A hand without notes in this bar gets a whole-bar rest in the middle
const wholeRest = (clef: Clef) => new StaveNote({ clef, keys: [REST_LINE[clef]], duration: 'wr', align_center: true });

function buildBar(bar: Bar, piece: Piece) {
  const right = bar.right.length ? buildNotes(bar.right, 'treble', piece) : [wholeRest('treble')];
  const left = bar.left.length ? buildNotes(bar.left, 'bass', piece) : [wholeRest('bass')];
  const groups = Beam.getDefaultBeamGroups(`${piece.beats}/${piece.beatValue}`);
  const beams = [...Beam.generateBeams(right, { groups }), ...Beam.generateBeams(left, { groups })];
  const voice = (notes: StaveNote[]) =>
    new Voice({ num_beats: piece.beats, beat_value: piece.beatValue }).setMode(Voice.Mode.SOFT).addTickables(notes);
  const voices = [voice(right), voice(left)];
  const formatter = new Formatter();
  voices.forEach(v => formatter.joinVoices([v]));
  return { right, left, beams, voices, formatter };
}

// Noteheads that sit far above or below the staves need room in their line
function roomNeeded(bars: Bar[]) {
  const keys = (items: Printed[]) => items.flatMap(p => p.ev.keys);
  const high = Math.max(84, ...bars.flatMap(b => keys(b.right)));
  const low = Math.min(36, ...bars.flatMap(b => keys(b.left)));
  return { above: (high - 84) * 3, below: (36 - low) * 3 };
}

function draw(host: HTMLElement, piece: Piece, width: number): DrawnNote[] {
  host.innerHTML = '';
  const scale = width < 360 ? 0.58 : width < 600 ? 0.72 : 1;
  const available = (width - 4) / scale;

  const ticks = barTicks(piece);
  const right = toBars(piece.hands.right, ticks);
  const left = toBars(piece.hands.left, ticks);
  const count = Math.max(right.length, left.length, 1);
  const bars: Bar[] = Array.from({ length: count }, (_, i) => ({ right: right[i] ?? [], left: left[i] ?? [], need: 0 }));
  for (const bar of bars) {
    const built = buildBar(bar, piece);
    bar.need = Math.max(MIN_BAR, built.formatter.preCalculateMinTotalWidth(built.voices) + 40);
  }

  const startOf = (first: boolean) => {
    const stave = new Stave(0, 0, 500).addClef('treble').addKeySignature(keyName(piece.key));
    if (first) stave.addTimeSignature(`${piece.beats}/${piece.beatValue}`);
    return stave.getNoteStartX();
  };

  // Bars into lines
  const lines: { bars: number[]; used: number }[] = [];
  bars.forEach((bar, i) => {
    let line = lines[lines.length - 1];
    if (!line || LEFT + line.used + bar.need > available - 6) {
      line = { bars: [], used: startOf(i === 0) };
      lines.push(line);
    }
    line.bars.push(i);
    line.used += bar.need;
  });

  const rooms = lines.map(line => roomNeeded(line.bars.map(i => bars[i])));
  const totalHeight = rooms.reduce((sum, room) => sum + SYSTEM_HEIGHT + room.above + room.below, 20);
  const longest = Math.max(available, ...lines.map(l => LEFT + l.used + 6));

  const renderer = new Renderer(host as HTMLDivElement, Renderer.Backends.SVG);
  renderer.resize(longest * scale, totalHeight * scale);
  const ctx = renderer.getContext();
  ctx.scale(scale, scale);

  const drawn: DrawnNote[] = [];
  const placed: Record<Hand, { item: Printed; note: StaveNote; line: number }[]> = { right: [], left: [] };
  let y = 10;

  lines.forEach((line, lineIndex) => {
    const room = rooms[lineIndex];
    const top = y + room.above;
    const full = lineIndex < lines.length - 1;
    // Lines stretch to the full width; the last one only a little, so one bar stays one bar wide
    const needed = line.bars.reduce((sum, i) => sum + bars[i].need, 0);
    const free = longest - LEFT - 6 - line.used;
    const stretch = full ? 1 + free / needed : Math.min(1.5, 1 + free / needed);

    let x = LEFT;
    line.bars.forEach((index, position) => {
      const bar = bars[index];
      const first = position === 0;
      const lead = first ? startOf(index === 0) : 0;
      const barWidth = bar.need * stretch + lead;

      const treble = new Stave(x, top, barWidth);
      const bass = new Stave(x, top + STAFF_GAP, barWidth);
      for (const [stave, clef] of [[treble, 'treble'], [bass, 'bass']] as const) {
        if (first) {
          stave.addClef(clef);
          stave.addKeySignature(keyName(piece.key));
        }
        if (index === 0) stave.addTimeSignature(`${piece.beats}/${piece.beatValue}`);
      }
      const noteStart = Math.max(treble.getNoteStartX(), bass.getNoteStartX());
      treble.setNoteStartX(noteStart);
      bass.setNoteStartX(noteStart);
      treble.setContext(ctx).draw();
      bass.setContext(ctx).draw();

      if (first) {
        new StaveConnector(treble, bass).setType('brace').setContext(ctx).draw();
        new StaveConnector(treble, bass).setType('singleLeft').setContext(ctx).draw();
      }
      new StaveConnector(treble, bass).setType(index === count - 1 ? 'boldDoubleRight' : 'singleRight').setContext(ctx).draw();

      const built = buildBar(bar, piece);
      built.formatter.format(built.voices, Math.max(40, treble.getNoteEndX() - noteStart - 16));
      built.voices[0].draw(ctx, treble);
      built.voices[1].draw(ctx, bass);
      built.beams.forEach(beam => beam.setContext(ctx).draw());

      for (const hand of ['right', 'left'] as const) {
        bar[hand].forEach((item, i) => {
          const note = built[hand][i];
          placed[hand].push({ item, note, line: lineIndex });
          const el = note.getSVGElement();
          if (el) drawn.push({ hand, id: item.ev.id, el });
        });
      }
      x += barWidth;
    });
    y += SYSTEM_HEIGHT + room.above + room.below;
  });

  for (const hand of ['right', 'left'] as const) {
    placed[hand].forEach((from, i) => {
      const to = placed[hand][i + 1];
      if (!from.item.tie || !to) return;
      const shared = from.item.ev.keys.filter(k => to.item.ev.keys.includes(k));
      if (!shared.length) return;
      const first_indices = shared.map(k => from.item.ev.keys.indexOf(k));
      const last_indices = shared.map(k => to.item.ev.keys.indexOf(k));
      const ties = from.line === to.line
        ? [new StaveTie({ first_note: from.note, last_note: to.note, first_indices, last_indices })]
        : [
            new StaveTie({ first_note: from.note, last_note: null, first_indices, last_indices: first_indices }),
            new StaveTie({ first_note: null, last_note: to.note, first_indices: last_indices, last_indices }),
          ];
      ties.forEach(tie => tie.setContext(ctx).draw());
    });
  }

  return drawn;
}

// The two-handed score. Redrawn when the notes or the width change; which notes are selected or
// sounding only switches a class, so playback doesn't redraw anything.
export function Sheet({ piece, selected, active, follow, onSelect }: {
  piece: Piece; selected?: string | null; active?: ReadonlySet<string>; follow?: string | null;
  onSelect?: (hand: Hand, id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const notes = useRef<DrawnNote[]>([]);
  const [width, setWidth] = useState(0);
  const [drawCount, setDrawCount] = useState(0);
  const { hands, key, beats, beatValue } = piece;

  useEffect(() => {
    const box = host.current;
    if (!box) return;
    const observer = new ResizeObserver(() => setWidth(box.clientWidth));
    observer.observe(box);
    setWidth(box.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!host.current || !width) return;
    notes.current = draw(host.current, { ...piece, hands, key, beats, beatValue }, width);
    setDrawCount(n => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only what changes the picture
  }, [hands, key, beats, beatValue, width]);

  useEffect(() => {
    for (const { id, el } of notes.current) {
      el.classList.toggle('note-selected', id === selected);
      el.classList.toggle('note-playing', Boolean(active?.has(id)));
    }
  }, [selected, active, drawCount]);

  useEffect(() => {
    if (!follow) return;
    notes.current.find(n => n.id === follow)?.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [follow, drawCount]);

  const tap = (x: number, y: number) => {
    if (!onSelect) return;
    let best: DrawnNote | null = null;
    let bestDistance = TAP_RADIUS;
    for (const note of notes.current) {
      const box = note.el.getBoundingClientRect();
      const distance = Math.hypot(box.left + box.width / 2 - x, box.top + box.height / 2 - y);
      if (distance < bestDistance) {
        best = note;
        bestDistance = distance;
      }
    }
    if (best) onSelect(best.hand, best.id);
  };

  return <div ref={host} data-testid="sheet" className="sheet w-full" onClick={e => tap(e.clientX, e.clientY)} />;
}
