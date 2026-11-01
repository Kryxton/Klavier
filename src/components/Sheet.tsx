import { useEffect, useMemo, useRef, useState } from 'react';
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
const NOTE_ROOM = 28; // px a note takes in a bar, at the least
const SIGN_ROOM = 14;
const DOT_ROOM = 8;
const DRAW_AHEAD = 900; // px beyond the screen where lines are already drawn

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

// The room a hand needs in a bar. Asking VexFlow would mean building every note of the piece before
// the first line can show; this errs on the wide side instead, so that nothing gets cramped.
function roomOf(printed: Printed[], piece: Piece) {
  const signature = keySignature(piece.key);
  return printed.reduce((sum, { ev, dotted }) => {
    const signs = ev.keys.map(k => spell(k, piece.key, ev.spell?.[k])).filter(s => s.accidental !== (signature[s.letter] ?? '')).length;
    return sum + NOTE_ROOM + signs * SIGN_ROOM + (dotted ? DOT_ROOM : 0);
  }, 0);
}

function measure(piece: Piece) {
  const ticks = barTicks(piece);
  const right = toBars(piece.hands.right, ticks);
  const left = toBars(piece.hands.left, ticks);
  const count = Math.max(right.length, left.length, 1);
  const bars: Bar[] = Array.from({ length: count }, (_, i) => ({ right: right[i] ?? [], left: left[i] ?? [], need: 0 }));
  for (const bar of bars) bar.need = Math.max(MIN_BAR, Math.max(roomOf(bar.right, piece), roomOf(bar.left, piece)) + 40);
  return { piece, bars };
}

type Measured = ReturnType<typeof measure>;

// Bars into lines for this width
function arrange({ piece, bars }: Measured, width: number) {
  const scale = width < 360 ? 0.58 : width < 600 ? 0.72 : 1;
  const available = (width - 4) / scale;
  const leadOf = (first: boolean) => {
    const stave = new Stave(0, 0, 500).addClef('treble').addKeySignature(keyName(piece.key));
    if (first) stave.addTimeSignature(`${piece.beats}/${piece.beatValue}`);
    return stave.getNoteStartX();
  };
  const lines: { bars: number[]; used: number }[] = [];
  bars.forEach((bar, i) => {
    let line = lines[lines.length - 1];
    if (!line || LEFT + line.used + bar.need > available - 6) {
      line = { bars: [], used: leadOf(i === 0) };
      lines.push(line);
    }
    line.bars.push(i);
    line.used += bar.need;
  });
  const longest = Math.max(available, ...lines.map(l => LEFT + l.used + 6));
  const lineOf = new Map<string, number>();
  lines.forEach((line, l) => {
    for (const i of line.bars) for (const item of [...bars[i].right, ...bars[i].left]) lineOf.set(item.ev.id, l);
  });
  return {
    scale, longest, lineOf, leadOf,
    lines: lines.map(line => {
      const room = roomNeeded(line.bars.map(i => bars[i]));
      return { ...line, room, height: SYSTEM_HEIGHT + room.above + room.below };
    }),
  };
}

type Page = ReturnType<typeof arrange>;

// The printed note next to bar `index` in a hand: where a tie leaves the line
function neighbour(bars: Bar[], hand: Hand, index: number, step: 1 | -1) {
  for (let i = index + step; i >= 0 && i < bars.length; i += step) {
    const items = bars[i][hand];
    if (items.length) return step > 0 ? items[0] : items[items.length - 1];
  }
  return null;
}

// One line of the score into its own picture
function drawLine(host: HTMLElement, { piece, bars }: Measured, page: Page, lineIndex: number): DrawnNote[] {
  host.innerHTML = '';
  const { scale, longest, lines, leadOf } = page;
  const line = lines[lineIndex];
  const renderer = new Renderer(host as HTMLDivElement, Renderer.Backends.SVG);
  renderer.resize(longest * scale, line.height * scale);
  const ctx = renderer.getContext();
  ctx.scale(scale, scale);

  const drawn: DrawnNote[] = [];
  const placed: Record<Hand, { item: Printed; note: StaveNote; bar: number }[]> = { right: [], left: [] };
  const top = 10 + line.room.above;
  const full = lineIndex < lines.length - 1;
  // Lines stretch to the full width; the last one only a little, so one bar stays one bar wide
  const needed = line.bars.reduce((sum, i) => sum + bars[i].need, 0);
  const free = longest - LEFT - 6 - line.used;
  const stretch = full ? 1 + free / needed : Math.min(1.5, 1 + free / needed);

  let x = LEFT;
  line.bars.forEach((index, position) => {
    const bar = bars[index];
    const first = position === 0;
    const lead = first ? leadOf(index === 0) : 0;
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
    new StaveConnector(treble, bass).setType(index === bars.length - 1 ? 'boldDoubleRight' : 'singleRight').setContext(ctx).draw();

    const built = buildBar(bar, piece);
    built.formatter.format(built.voices, Math.max(40, treble.getNoteEndX() - noteStart - 16));
    built.voices[0].draw(ctx, treble);
    built.voices[1].draw(ctx, bass);
    built.beams.forEach(beam => beam.setContext(ctx).draw());

    for (const hand of ['right', 'left'] as const) {
      bar[hand].forEach((item, i) => {
        const note = built[hand][i];
        placed[hand].push({ item, note, bar: index });
        const el = note.getSVGElement();
        if (el) drawn.push({ hand, id: item.ev.id, el });
      });
    }
    x += barWidth;
  });

  for (const hand of ['right', 'left'] as const) {
    const here = placed[hand];
    here.forEach((from, i) => {
      const to = here[i + 1];
      const next = to?.item ?? neighbour(bars, hand, from.bar, 1);
      if (!from.item.tie || !next) return;
      const shared = from.item.ev.keys.filter(k => next.ev.keys.includes(k));
      if (!shared.length) return;
      const first_indices = shared.map(k => from.item.ev.keys.indexOf(k));
      const last_indices = shared.map(k => next.ev.keys.indexOf(k));
      const tie = to
        ? new StaveTie({ first_note: from.note, last_note: to.note, first_indices, last_indices })
        : new StaveTie({ first_note: from.note, last_note: null, first_indices, last_indices: first_indices });
      tie.setContext(ctx).draw();
    });
    // A tie coming in from the line before
    const opening = here[0];
    const before = opening && neighbour(bars, hand, opening.bar, -1);
    if (before?.tie) {
      const shared = opening.item.ev.keys.filter(k => before.ev.keys.includes(k));
      const indices = shared.map(k => opening.item.ev.keys.indexOf(k));
      if (shared.length) new StaveTie({ first_note: null, last_note: opening.note, first_indices: indices, last_indices: indices }).setContext(ctx).draw();
    }
  }
  return drawn;
}

const scrollerOf = (element: HTMLElement) => {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(parent).overflowY)) return parent;
  }
  return null;
};

// The two-handed score. Only the lines near the screen exist as pictures, so a long piece opens as
// fast as a short one and an edit redraws just those. Which notes are selected or sounding only
// switches a class on the notes concerned, so playback doesn't redraw anything.
export function Sheet({ piece, selected, active, follow, onSelect }: {
  piece: Piece; selected?: string | null; active?: ReadonlySet<string>; follow?: string | null;
  onSelect?: (hand: Hand, id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const notes = useRef(new Map<number, DrawnNote[]>());
  const byId = useRef(new Map<string, DrawnNote[]>());
  const lit = useRef({ selected, active });
  const shown = useRef(new Set<string>());
  const followed = useRef(-1);
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

  // eslint-disable-next-line react-hooks/exhaustive-deps -- only what changes the picture
  const measured = useMemo(() => measure(piece), [hands, key, beats, beatValue]);
  const page = useMemo(() => (width ? arrange(measured, width) : null), [measured, width]);

  const mark = (note: DrawnNote) => {
    note.el.classList.toggle('note-selected', note.id === lit.current.selected);
    note.el.classList.toggle('note-playing', Boolean(lit.current.active?.has(note.id)));
  };

  useEffect(() => {
    const box = host.current;
    if (!box || !page) return;
    notes.current.clear();
    byId.current.clear();
    for (const line of box.children) line.innerHTML = '';

    const show = (element: HTMLElement) => {
      const index = Number(element.dataset.line);
      if (notes.current.has(index)) return;
      const drawn = drawLine(element, measured, page, index);
      notes.current.set(index, drawn);
      for (const note of drawn) {
        byId.current.set(note.id, [...(byId.current.get(note.id) ?? []), note]);
        mark(note);
      }
    };
    // One line to a picture, in the order they came, so the page keeps moving while it fills
    const waiting: HTMLElement[] = [];
    let frame = 0;
    const next = () => {
      frame = 0;
      const element = waiting.shift();
      if (!element) return;
      show(element);
      setDrawCount(n => n + 1);
      if (waiting.length) frame = requestAnimationFrame(next);
    };
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) waiting.push(entry.target as HTMLElement);
      if (waiting.length && !frame) frame = requestAnimationFrame(next);
    }, { root: scrollerOf(box), rootMargin: `${DRAW_AHEAD}px 0px` });
    for (const line of box.children) observer.observe(line);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [measured, page]);

  useEffect(() => {
    const now = new Set<string>(active);
    if (selected) now.add(selected);
    lit.current = { selected, active };
    for (const id of new Set([...shown.current, ...now])) byId.current.get(id)?.forEach(mark);
    shown.current = now;
  }, [selected, active, drawCount]);

  useEffect(() => {
    const line = follow ? page?.lineOf.get(follow) ?? -1 : -1;
    // Every note would mean working out the page again; only a new line has to move
    if (line === followed.current) return;
    followed.current = line;
    if (line >= 0) host.current?.children[line]?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [follow, page, drawCount]);

  const tap = (x: number, y: number) => {
    if (!onSelect) return;
    let best: DrawnNote | null = null;
    let bestDistance = TAP_RADIUS;
    for (const line of notes.current.values()) {
      for (const note of line) {
        const box = note.el.getBoundingClientRect();
        const distance = Math.hypot(box.left + box.width / 2 - x, box.top + box.height / 2 - y);
        if (distance < bestDistance) {
          best = note;
          bestDistance = distance;
        }
      }
    }
    if (best) onSelect(best.hand, best.id);
  };

  return (
    <div ref={host} data-testid="sheet" className="sheet w-full" onClick={e => tap(e.clientX, e.clientY)}>
      {page?.lines.map((line, i) => <div key={i} data-line={i} style={{ height: line.height * page.scale, width: page.longest * page.scale }} />)}
    </div>
  );
}
