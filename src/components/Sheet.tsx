import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Accidental, Beam, Dot, Formatter, Renderer, Stave, StaveConnector, StaveNote, StaveTie, Voice } from 'vexflow';
import type { Hand, Piece } from '../types';
import { titleOf, type Bars } from '../utils/edit';
import { keyName, keySignature, signFor, spell } from '../utils/notes';
import { paginate } from '../utils/print';
import { barTicks, toBars, type Printed } from '../utils/score';

type Clef = 'treble' | 'bass';
const REST_LINE: Record<Clef, string> = { treble: 'b/4', bass: 'd/3' };

const LEFT = 22; // room for the brace
const STAFF_GAP = 100; // top line of the treble staff to top line of the bass staff
const STAFF_TOP = 30; // from a stave's y to just above its top line
const STAFF_HEIGHT = 60; // the five lines with a little air
const SYSTEM_HEIGHT = 190;
const MIN_BAR = 110;
const TAP_RADIUS = 32; // px; a tap counts for the nearest note this close
const NOTE_ROOM = 28; // px a note takes in a bar, at the least
const SIGN_ROOM = 14;
const DOT_ROOM = 8;
const DRAW_AHEAD = 900; // px beyond the screen where lines are already drawn
const PAPER_WIDTH = 688; // px at 96 to the inch: A4 less 14 mm on each side
const PAPER_HEIGHT = 970; // px, a little short of A4: not every browser gives the whole sheet
const PAPER_SCALE = 0.72; // staves of 7.6 mm, the size of printed music
const TITLE_ROOM = 92; // px on the first sheet
const HEADER_ROOM = 36; // px on the others
const WIDEST_GAP = 34; // px between lines where a sheet has room to spare

interface Bar {
  right: Printed[];
  left: Printed[];
  need: number;
}
interface DrawnNote {
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
function arrange({ piece, bars }: Measured, width: number, fixedScale?: number) {
  const scale = fixedScale ?? (width < 360 ? 0.58 : width < 600 ? 0.72 : 1);
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

// Where the bars of a line stand, in the units of the score
function barsOfLine({ bars }: Measured, { longest, lines, leadOf }: Page, lineIndex: number) {
  const line = lines[lineIndex];
  const full = lineIndex < lines.length - 1;
  // Lines stretch to the full width; the last one only a little, so one bar stays one bar wide
  const needed = line.bars.reduce((sum, i) => sum + bars[i].need, 0);
  const free = longest - LEFT - 6 - line.used;
  const stretch = full ? 1 + free / needed : Math.min(1.5, 1 + free / needed);
  let x = LEFT;
  return line.bars.map((index, position) => {
    const width = bars[index].need * stretch + (position === 0 ? leadOf(index === 0) : 0);
    x += width;
    return { index, x: x - width, width };
  });
}

// All bars in px on the page, for marking and tapping whole bars
function barBoxes(measured: Measured, page: Page) {
  const { scale, lines } = page;
  let y = 0;
  return lines.flatMap((line, lineIndex) => {
    const top = y + (10 + line.room.above) * scale;
    y += line.height * scale;
    return barsOfLine(measured, page, lineIndex).map(({ index, x, width }) => ({ index, left: x * scale, width: width * scale, top }));
  });
}

// The bar closest to a point of the page; a tap beside the staves still means the bar next to it
function nearestBar(boxes: ReturnType<typeof barBoxes>, x: number, y: number, scale: number) {
  const away = ({ left, width, top }: typeof boxes[number]) => Math.hypot(
    Math.max(left - x, 0, x - left - width),
    Math.max(top + STAFF_TOP * scale - y, 0, y - top - (STAFF_TOP + STAFF_GAP + STAFF_HEIGHT) * scale),
  );
  return boxes.reduce((best, box) => (away(box) < away(best) ? box : best)).index;
}

// One line of the score into its own picture
function drawLine(host: HTMLElement, { piece, bars }: Measured, page: Page, lineIndex: number): DrawnNote[] {
  host.innerHTML = '';
  const { scale, longest, lines } = page;
  const line = lines[lineIndex];
  const renderer = new Renderer(host as HTMLDivElement, Renderer.Backends.SVG);
  renderer.resize(longest * scale, line.height * scale);
  const ctx = renderer.getContext();
  ctx.scale(scale, scale);

  const drawn: DrawnNote[] = [];
  const placed: Record<Hand, { item: Printed; note: StaveNote; bar: number }[]> = { right: [], left: [] };
  const top = 10 + line.room.above;

  barsOfLine({ piece, bars }, page, lineIndex).forEach(({ index, x, width: barWidth }, position) => {
    const bar = bars[index];
    const first = position === 0;

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
export function Sheet({ piece, selected, active, doubts, follow, onSelect, bars, onBar }: {
  piece: Piece; selected?: string | null; active?: ReadonlySet<string>; doubts?: ReadonlySet<string>; follow?: string | null;
  onSelect?: (hand: Hand, id: string) => void;
  bars?: Bars | null; onBar?: (bar: number) => void; // with onBar a tap means a bar, not a note
}) {
  const host = useRef<HTMLDivElement>(null);
  const notes = useRef(new Map<number, DrawnNote[]>());
  const byId = useRef(new Map<string, DrawnNote[]>());
  const lit = useRef<{ selected?: string | null; active?: ReadonlySet<string>; doubts?: ReadonlySet<string> }>({ selected, active, doubts });
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
  const pickBars = Boolean(onBar);
  const boxes = useMemo(() => (pickBars && page ? barBoxes(measured, page) : []), [pickBars, measured, page]);

  const mark = (note: DrawnNote) => {
    note.el.classList.toggle('note-selected', note.id === lit.current.selected);
    note.el.classList.toggle('note-playing', Boolean(lit.current.active?.has(note.id)));
    note.el.classList.toggle('note-unsure', Boolean(lit.current.doubts?.has(note.id)));
  };

  useEffect(() => {
    lit.current.doubts = doubts;
    for (const line of notes.current.values()) line.forEach(mark);
  }, [doubts, drawCount]);

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
    lit.current = { ...lit.current, selected, active };
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
    const area = host.current?.getBoundingClientRect();
    if (onBar && area && boxes.length) return onBar(nearestBar(boxes, x - area.left, y - area.top, page?.scale ?? 1));
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

  const scale = page?.scale ?? 1;
  return (
    <div className="relative">
      <div ref={host} data-testid="sheet" className="sheet w-full" onClick={e => tap(e.clientX, e.clientY)}>
        {page?.lines.map((line, i) => <div key={i} data-line={i} style={{ height: line.height * page.scale, width: page.longest * page.scale }} />)}
      </div>
      {boxes.map(box => (
        <Fragment key={box.index}>
          <span className="pointer-events-none absolute text-[11px] tabular-nums text-paper-dim" style={{ left: box.left + 2, top: box.top + (STAFF_TOP - 16) * scale - 4 }}>{box.index + 1}</span>
          {bars && box.index >= bars.from && box.index <= bars.to && (
            <div
              data-testid="marked-bar"
              className="pointer-events-none absolute bg-mark/15"
              style={{
                left: box.left, width: box.width,
                top: box.top + (STAFF_TOP + (bars.hands === 'left' ? STAFF_GAP : 0)) * scale,
                height: (STAFF_HEIGHT + (bars.hands === 'both' ? STAFF_GAP : 0)) * scale,
              }}
            />
          )}
        </Fragment>
      ))}
    </div>
  );
}

// The whole score for paper, whatever the screen is: every line, at the size of printed music, on
// A4. Exists only around printing and is drawn at once when it appears, because a browser prints
// what is there the moment it is asked. Hidden on screen, index.css brings it out for paper.
export function PrintSheet({ piece }: { piece: Piece }) {
  const host = useRef<HTMLDivElement>(null);
  const { measured, page, sheets } = useMemo(() => {
    const measured = measure(piece);
    const page = arrange(measured, PAPER_WIDTH, PAPER_SCALE);
    const heights = page.lines.map(line => line.height * PAPER_SCALE);
    const sheets = paginate(heights, PAPER_HEIGHT - TITLE_ROOM, PAPER_HEIGHT - HEADER_ROOM).map((lines, i, all) => {
      const used = lines.reduce((sum, line) => sum + heights[line], 0) + (i ? HEADER_ROOM : TITLE_ROOM);
      const spread = i < all.length - 1 && lines.length > 1 ? (PAPER_HEIGHT - used) / (lines.length - 1) : WIDEST_GAP;
      return { lines, gap: Math.min(WIDEST_GAP, spread) };
    });
    return { measured, page, sheets };
  }, [piece]);

  useLayoutEffect(() => {
    host.current?.querySelectorAll<HTMLElement>('[data-line]').forEach(line => drawLine(line, measured, page, Number(line.dataset.line)));
  }, [measured, page]);

  return createPortal(
    <div ref={host} className="print-view sheet">
      {sheets.map(({ lines, gap }, i) => (
        <section key={i} className="print-sheet">
          {i === 0
            ? <header style={{ minHeight: TITLE_ROOM }}><h1>{titleOf(piece)}</h1><p>♩ = {piece.bpm}</p></header>
            : <header className="print-running" style={{ height: HEADER_ROOM }}>{titleOf(piece)} · Seite {i + 1} von {sheets.length}</header>}
          {lines.map((line, n) => <div key={line} data-line={line} className="print-line" style={{ height: page.lines[line].height * PAPER_SCALE, marginTop: n ? gap : 0 }} />)}
        </section>
      ))}
    </div>,
    document.body,
  );
}
