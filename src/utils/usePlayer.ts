import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Hand, Piece } from '../types';
import { audioClock, unlockAudio } from './audio';
import { harmonies, harmonyBeat, withPedal } from './pedal';
import { Player, type Loop } from './player';
import { soundsBetween, timeline } from './score';

export type HandChoice = Hand | 'both';

const TIMER_MS = 40;

// Everything the Üben page needs from the player. `active` = what sounds right now; it changes
// only when a note starts or ends, the position is read directly from `player` for drawing. Whoever
// draws from the position itself sets `followNotes` to false and saves all those redraws. The
// pedal changes only what is heard: the notes stay as written for everything that shows them.
export function usePlayer(piece: Piece, { hands, speed, loop, pedal, followNotes }: {
  hands: HandChoice; speed: number; loop: Loop | null; pedal: boolean; followNotes: boolean;
}) {
  const player = useRef<Player | null>(null);
  player.current ??= new Player(audioClock);
  const current = player.current;
  const { beats, beatValue } = piece;

  const sounds = useMemo(() => timeline(piece), [piece]);
  const played = useMemo(() => sounds.filter(s => hands === 'both' || s.hand === hands), [sounds, hands]);
  const harmony = useMemo(() => (pedal ? harmonies(sounds, harmonyBeat({ beats, beatValue })) : null), [pedal, sounds, beats, beatValue]);
  const heard = useMemo(() => (harmony ? withPedal(played, harmony) : played), [harmony, played]);
  const [running, setRunning] = useState(false);
  const [active, setActive] = useState<{ keys: Set<number>; events: Set<string> }>({ keys: new Set(), events: new Set() });

  useEffect(() => {
    current.load(heard, piece.bpm);
  }, [current, heard, piece.bpm]);
  useEffect(() => current.setSpeed(speed), [current, speed]);
  useEffect(() => current.setLoop(loop), [current, loop]);
  useEffect(() => () => current.stop(), [current]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      if (!current.tick()) setRunning(false);
    }, TIMER_MS);
    return () => clearInterval(timer);
  }, [current, running]);

  useEffect(() => {
    if (!followNotes) return;
    const longest = played.reduce((most, s) => Math.max(most, s.length), 0);
    let frame = 0;
    let shown = '';
    const update = () => {
      frame = requestAnimationFrame(update);
      const at = current.isRunning() ? current.position() : -1;
      const now = soundsBetween(played, at, at, longest).filter(s => s.start <= at);
      const key = now.map(s => s.evId + s.midi).join();
      if (key === shown) return;
      shown = key;
      setActive({ keys: new Set(now.map(s => s.midi)), events: new Set(now.map(s => s.evId)) });
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [current, played, followNotes]);

  const toggle = useCallback(() => {
    if (current.isRunning()) {
      current.stop();
      setRunning(false);
    } else {
      unlockAudio();
      current.start();
      setRunning(true);
    }
  }, [current]);

  return { player: current, sounds, running, active, toggle };
}
