import { useEffect, useRef } from 'react';
import { isBlack, keyBox } from '../utils/notes';
import type { Player } from '../utils/player';
import type { Sound } from '../utils/score';
import type { HandChoice } from '../utils/usePlayer';

const PX_PER_TICK = 1.4;
const COLORS = { right: '#bfa27a', left: '#6f7a86' };
const SOUNDING = { right: '#f5f0e6', left: '#c3ccd6' };

// The notes falling onto the keys, like in the tutorials: the bottom edge of the canvas is the top
// edge of the keyboard. Draws only when the position or size changed.
export function Falling({ player, sounds, low, high, ticksPerBar, hands }: {
  player: Player; sounds: Sound[]; low: number; high: number; ticksPerBar: number; hands: HandChoice;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const ctx = element?.getContext('2d');
    if (!element || !ctx) return;

    let frame = 0;
    let last = '';
    const paint = () => {
      frame = requestAnimationFrame(paint);
      const { clientWidth: width, clientHeight: height } = element;
      const dpr = window.devicePixelRatio || 1;
      const at = player.position();
      const state = `${at}|${width}|${height}`;
      if (state === last) return;
      last = state;

      if (element.width !== width * dpr || element.height !== height * dpr) {
        element.width = width * dpr;
        element.height = height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (let midi = low; midi <= high; midi++) {
        if (midi % 12 === 0) ctx.fillRect(keyBox(midi, low, high).left * width, 0, 1, height);
      }
      const yOf = (tick: number) => height - (tick - at) * PX_PER_TICK;
      for (let tick = Math.ceil(at / ticksPerBar) * ticksPerBar; yOf(tick) > 0; tick += ticksPerBar) {
        ctx.fillRect(0, yOf(tick), width, 1);
      }

      for (const sound of sounds) {
        const bottom = yOf(sound.start);
        const top = yOf(sound.start + sound.length);
        if (bottom < 0 || top > height) continue;
        const box = keyBox(sound.midi, low, high);
        const sounding = at >= sound.start && at < sound.start + sound.length;
        ctx.globalAlpha = hands === 'both' || hands === sound.hand ? 1 : 0.25;
        ctx.fillStyle = sounding ? SOUNDING[sound.hand] : COLORS[sound.hand];
        const inset = isBlack(sound.midi) ? 0 : 1;
        ctx.beginPath();
        ctx.roundRect(box.left * width + inset, top, Math.max(2, box.width * width - inset * 2), Math.max(3, bottom - top - 1), 1);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    };
    paint();
    return () => cancelAnimationFrame(frame);
  }, [player, sounds, low, high, ticksPerBar, hands]);

  return <canvas ref={canvas} data-testid="falling" className="block w-full h-full" />;
}
