import { useEffect, useRef } from 'react';
import { HIGHEST, LOWEST, isBlack, keyBox } from '../utils/notes';
import type { Player } from '../utils/player';
import { soundsBetween, type Sound } from '../utils/score';
import type { HandChoice } from '../utils/usePlayer';

const WIDEST_KEY = 24; // px; a wider screen shows more keys, not bigger ones
const BARS_SHOWN = 2.5; // how far ahead the notes can be seen
const WHITE_BAR = 0.7; // of a white key: slim enough to see the keys between two notes
const BLACK_BAR = 0.9; // of a black key
const FADED = 0.2; // the hand not being practised
const EMPTY_RANGE = { low: 48, high: 84 };
const GLOW = 128; // px of the prepared glow picture
const MOST_DPR = 2; // sharper costs speed and doesn't show

const whitesIn = (low: number, high: number) => Array.from({ length: high - low + 1 }, (_, i) => low + i).filter(k => !isBlack(k)).length;

// The octaves a piece uses, widened until the keys are no wider than WIDEST_KEY
function rangeFor(sounds: Sound[], width: number) {
  if (!sounds.length) return EMPTY_RANGE;
  const keys = sounds.map(s => s.midi);
  const lowest = Math.min(...keys);
  const highest = Math.max(...keys);
  let low = Math.max(LOWEST, lowest - (lowest % 12));
  let high = Math.min(HIGHEST, highest + (12 - (highest % 12)) % 12);
  while (whitesIn(low, high) * WIDEST_KEY < width && (low > LOWEST || high < HIGHEST)) {
    if (high >= HIGHEST || (low > LOWEST && 60 - low <= high - 60)) low = Math.max(LOWEST, low - 12);
    else high = Math.min(HIGHEST, high + 12);
  }
  return { low, high };
}

const colours = () => {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(`--color-${name}`).trim();
  return {
    stage: token('stage'), stageLight: token('stage-light'), line: token('stage-line'), ivory: token('ivory'), ivoryDark: token('ivory-dark'), ebony: token('ebony'),
    right: { white: token('bar-right'), black: token('bar-right-dark'), on: token('bar-right-on'), key: token('key-right') },
    left: { white: token('bar-left'), black: token('bar-left-dark'), on: token('bar-left-on'), key: token('key-left') },
  };
};

type Colours = ReturnType<typeof colours>;

function layer(width: number, height: number, dpr: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.scale(dpr, dpr);
  return { canvas, ctx };
}

// Everything that doesn't move, drawn once: painting it again for every picture would be wasted time
function buildStage(width: number, height: number, keysTop: number, dpr: number, low: number, high: number, c: Colours) {
  const back = layer(width, height, dpr);
  const blacks = layer(width, height, dpr);
  const sky = back.ctx.createLinearGradient(0, 0, 0, keysTop);
  sky.addColorStop(0, c.stage);
  sky.addColorStop(1, c.stageLight);
  back.ctx.fillStyle = sky;
  back.ctx.fillRect(0, 0, width, height);

  const keysHeight = height - keysTop;
  const shade = back.ctx.createLinearGradient(0, keysTop, 0, height);
  shade.addColorStop(0, c.ivoryDark);
  shade.addColorStop(0.12, c.ivory);
  back.ctx.fillStyle = c.line;
  for (let midi = low; midi <= high; midi++) {
    if (midi % 12 === 0) back.ctx.fillRect(Math.round(keyBox(midi, low, high).left * width), 0, 1, keysTop);
  }
  back.ctx.fillStyle = c.ivoryDark;
  back.ctx.fillRect(0, keysTop, width, keysHeight);
  back.ctx.fillStyle = shade;
  blacks.ctx.fillStyle = c.ebony;
  for (let midi = low; midi <= high; midi++) {
    const box = keyBox(midi, low, high);
    const x = box.left * width;
    const w = box.width * width;
    if (isBlack(midi)) {
      blacks.ctx.beginPath();
      blacks.ctx.roundRect(x, keysTop, w, keysHeight * 0.62, [0, 0, 2, 2]);
      blacks.ctx.fill();
    } else {
      back.ctx.beginPath();
      back.ctx.roundRect(x + 0.5, keysTop, Math.max(1, w - 1), keysHeight, [0, 0, 2, 2]);
      back.ctx.fill();
    }
  }
  return { back: back.canvas, blacks: blacks.canvas, keysHeight };
}

function buildGlow(colour: string) {
  const { canvas, ctx } = layer(GLOW, GLOW, 1);
  const glow = ctx.createRadialGradient(GLOW / 2, GLOW / 2, 0, GLOW / 2, GLOW / 2, GLOW / 2);
  glow.addColorStop(0, colour);
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, GLOW, GLOW);
  return canvas;
}

// The notes falling onto the keys, like in the tutorials, on a dark stage. Keys and notes are one
// picture, so they can't drift apart and no key has to be redrawn by React while playing. Draws
// only what changed since the last picture, and only the notes in view.
export function Falling({ player, sounds, ticksPerBar, hands }: {
  player: Player; sounds: Sound[]; ticksPerBar: number; hands: HandChoice;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const ctx = element?.getContext('2d', { alpha: false });
    if (!element || !ctx) return;

    const c = colours();
    const longest = sounds.reduce((most, s) => Math.max(most, s.length), 0);
    const glows = { right: buildGlow(c.right.white), left: buildGlow(c.left.white) };
    const ahead = ticksPerBar * BARS_SHOWN;
    let frame = 0;
    let last = '';
    let keysTop = 0;
    let scene: ReturnType<typeof buildStage> | null = null;
    let places = new Map<number, { x: number; w: number; black: boolean }>();

    const paint = () => {
      frame = requestAnimationFrame(paint);
      const { clientWidth: width, clientHeight: height } = element;
      if (!width || !height) return;
      const dpr = Math.min(MOST_DPR, window.devicePixelRatio || 1);
      const at = player.position();
      const state = `${at}|${width}|${height}`;
      if (state === last) return;
      const resized = !last.endsWith(`|${width}|${height}`);
      last = state;

      if (resized || !scene) {
        element.width = Math.round(width * dpr);
        element.height = Math.round(height * dpr);
        const { low, high } = rangeFor(sounds, width);
        keysTop = height - Math.round(Math.max(56, Math.min(120, height * 0.16)));
        scene = buildStage(width, height, keysTop, dpr, low, high, c);
        places = new Map();
        for (let midi = low; midi <= high; midi++) {
          const box = keyBox(midi, low, high);
          places.set(midi, { x: box.left * width, w: box.width * width, black: isBlack(midi) });
        }
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(scene.back, 0, 0, width, height);

      const perTick = keysTop / ahead;
      const yOf = (tick: number) => keysTop - (tick - at) * perTick;
      ctx.fillStyle = c.line;
      for (let tick = Math.ceil(at / ticksPerBar) * ticksPerBar; yOf(tick) > 0; tick += ticksPerBar) {
        ctx.fillRect(0, Math.round(yOf(tick)), width, 1);
      }

      const visible = soundsBetween(sounds, at, at + ahead, longest);
      const sounding: Sound[] = [];
      for (const sound of visible) {
        const place = places.get(sound.midi);
        if (!place) continue;
        const heard = hands === 'both' || hands === sound.hand;
        const on = sound.start <= at;
        if (on && heard) sounding.push(sound);
        const colour = c[sound.hand];
        const barWidth = place.w * (place.black ? BLACK_BAR : WHITE_BAR);
        const bottom = Math.min(keysTop, yOf(sound.start));
        const top = yOf(sound.start + sound.length);
        ctx.globalAlpha = heard ? 1 : FADED;
        ctx.fillStyle = on ? colour.on : place.black ? colour.black : colour.white;
        ctx.beginPath();
        ctx.roundRect(place.x + (place.w - barWidth) / 2, top, barWidth, Math.max(3, bottom - top - 1), Math.min(4, barWidth / 2));
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const { blacks, keysHeight } = scene;
      for (const sound of sounding) {
        const place = places.get(sound.midi);
        if (!place || place.black) continue;
        ctx.fillStyle = c[sound.hand].key;
        ctx.fillRect(place.x + 0.5, keysTop, place.w - 1, keysHeight);
      }
      ctx.drawImage(blacks, 0, 0, width, height);
      for (const sound of sounding) {
        const place = places.get(sound.midi);
        if (!place?.black) continue;
        ctx.fillStyle = c[sound.hand].key;
        ctx.fillRect(place.x, keysTop, place.w, keysHeight * 0.62);
      }
      ctx.globalCompositeOperation = 'lighter';
      for (const sound of sounding) {
        const place = places.get(sound.midi);
        if (!place) continue;
        const size = place.w * 5;
        ctx.drawImage(glows[sound.hand], place.x + place.w / 2 - size / 2, keysTop - size / 2, size, size);
      }
      ctx.globalCompositeOperation = 'source-over';
    };
    paint();
    return () => cancelAnimationFrame(frame);
  }, [player, sounds, ticksPerBar, hands]);

  return <canvas ref={canvas} data-testid="falling" className="block w-full h-full" />;
}
