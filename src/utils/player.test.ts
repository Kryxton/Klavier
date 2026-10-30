import { beforeEach, describe, expect, it } from 'vitest';
import { Player } from './player';
import type { Sound } from './score';

const sound = (start: number, midi = 60, length = 48): Sound => ({ midi, hand: 'right', start, length, evId: `e${start}` });

let time: number;
let played: { midi: number; when: number; seconds: number }[];
let silenced: number;
const clock = {
  now: () => time,
  play: (s: Sound, when: number, seconds: number) => played.push({ midi: s.midi, when, seconds }),
  silence: () => { silenced++; },
};

// Runs the scheduler like the timer would, every 50 ms
function run(player: Player, seconds: number) {
  for (let t = 0; t < seconds; t += 0.05) {
    time += 0.05;
    player.tick();
  }
}

beforeEach(() => {
  time = 100;
  played = [];
  silenced = 0;
});

const at60 = (sounds: Sound[]) => {
  const player = new Player(clock);
  player.load(sounds, 60); // one quarter per second
  return player;
};

describe('Player', () => {
  it('places notes exactly on the audio clock', () => {
    const player = at60([sound(0), sound(48, 62), sound(96, 64)]);
    player.start();
    run(player, 3);
    expect(played.map(p => p.when)).toEqual([100, 101, 102]);
    expect(played[0].seconds).toBeCloseTo(1);
  });

  it('hands out every note once, also when a timer comes late', () => {
    const player = at60([sound(0), sound(24, 61), sound(48, 62), sound(72, 63)]);
    player.start();
    time += 1.2;
    player.tick();
    run(player, 2);
    expect(played.map(p => p.midi)).toEqual([60, 61, 62, 63]);
  });

  it('never places a late note in the past', () => {
    const player = at60([sound(0), sound(48, 62)]);
    player.start();
    time += 2;
    player.tick();
    expect(played[1].when).toBe(time);
  });

  it('reports the position and slows down', () => {
    const player = at60([sound(0, 60, 960)]);
    player.start();
    run(player, 1);
    expect(player.position()).toBeCloseTo(48, 0);
    player.setSpeed(0.5);
    run(player, 1);
    expect(player.position()).toBeCloseTo(72, 0);
  });

  it('keeps the place after stop and goes on from there', () => {
    const player = at60([sound(0), sound(96, 62)]);
    player.start();
    run(player, 1);
    player.stop();
    expect(silenced).toBe(1);
    const place = player.position();
    time += 10;
    expect(player.position()).toBe(place);
    player.start();
    run(player, 1.5);
    expect(played.map(p => p.midi)).toEqual([60, 62]);
  });

  it('plays a loop again and again without a gap', () => {
    const player = at60([sound(0, 50), sound(48, 60), sound(96, 62), sound(144, 70)]);
    player.setLoop({ from: 48, to: 144 }); // two seconds long
    player.start();
    run(player, 5.1);
    expect(played.map(p => p.midi)).toEqual([60, 62, 60, 62, 60, 62]);
    expect(played.map(p => Math.round(p.when * 10) / 10)).toEqual([100, 101, 102, 103, 104, 105]);
    expect(player.position()).toBeGreaterThanOrEqual(48);
    expect(player.position()).toBeLessThan(144);
  });

  it('stops by itself at the end and starts over', () => {
    const player = at60([sound(0)]);
    player.start();
    run(player, 2);
    expect(player.isRunning()).toBe(false);
    expect(player.position()).toBe(0);
  });
});
