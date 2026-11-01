import { beforeEach, describe, expect, it } from 'vitest';
import { Player } from './player';
import type { Sound } from './score';

const sound = (start: number, midi = 60, length = 48): Sound => ({ midi, hand: 'right', start, length, evId: `e${start}` });

let time: number;
let played: { midi: number; when: number; seconds: number }[];
let clicks: { when: number; strong: boolean }[];
let silenced: number;
const clock = {
  now: () => time,
  play: (s: Sound, when: number, seconds: number) => played.push({ midi: s.midi, when, seconds }),
  click: (when: number, strong: boolean) => clicks.push({ when, strong }),
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
  clicks = [];
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

  it('stays with the old round until the next one of a loop really begins', () => {
    const player = at60([sound(0, 60, 96)]);
    player.setLoop({ from: 0, to: 96 });
    player.start();
    const seen: number[] = [];
    for (let i = 0; i < 80; i++) {
      time += 0.025;
      player.tick();
      seen.push(player.position());
    }
    const steps = seen.slice(1).map((at, i) => (at - seen[i] + 96) % 96);
    expect(Math.max(...steps)).toBeCloseTo(1.2, 5); // 25 ms of 48 ticks a second, never a jump
  });

  it('jumps to a tapped place while it plays', () => {
    const player = at60([sound(0, 60, 400), sound(96, 62)]);
    player.start();
    run(player, 0.5);
    player.start(96);
    expect(silenced).toBe(1);
    run(player, 0.1);
    expect(played.map(p => p.midi)).toEqual([60, 62]);
  });

  it('stops by itself at the end and starts over', () => {
    const player = at60([sound(0)]);
    player.start();
    run(player, 2);
    expect(player.isRunning()).toBe(false);
    expect(player.position()).toBe(0);
  });
});

describe('Counting in', () => {
  const BAR = { beats: 4, ticks: 48 };

  it('clicks one bar before the first note', () => {
    const player = at60([sound(96, 62)]);
    player.start(96, BAR);
    run(player, 3.5);
    expect(clicks.map(c => c.when)).toEqual([100, 101, 102, 103]);
    expect(clicks.map(c => c.strong)).toEqual([true, false, false, false]);
    expect(played).toEqual([]);
    run(player, 0.6);
    expect(played.map(p => p.when)).toEqual([104]);
  });

  it('counts other bars and speeds in their own beats', () => {
    const player = at60([sound(0)]);
    player.setSpeed(0.5);
    player.start(0, { beats: 3, ticks: 24 });
    run(player, 2.9);
    expect(clicks.map(c => c.when)).toEqual([100, 101, 102]);
  });

  it('stands still while it counts', () => {
    const player = at60([sound(96, 62, 480)]);
    player.start(96, BAR);
    run(player, 2);
    expect(player.position()).toBe(96);
    run(player, 3);
    expect(player.position()).toBeGreaterThan(140);
  });

  it('can be stopped while it counts, and leaves no clicks behind', () => {
    const player = at60([sound(0)]);
    player.start(0, BAR);
    run(player, 1);
    player.stop();
    const heard = clicks.length;
    expect(player.position()).toBe(0);
    player.start();
    run(player, 3);
    expect(clicks).toHaveLength(heard);
    expect(played.map(p => p.when)[0]).toBeCloseTo(time - 3 - 0.05, 0);
  });

  it('goes on with the count when the speed changes meanwhile', () => {
    const player = at60([sound(0, 60, 96)]);
    player.start(0, BAR);
    run(player, 1);
    player.setSpeed(0.5);
    run(player, 3.5);
    expect(clicks.map(c => c.when)).toEqual([100, 101, 102, 103]);
    expect(played.map(p => p.when)).toEqual([104]);
    expect(played[0].seconds).toBeCloseTo(4);
  });

  it('counts once, not on every round of a loop', () => {
    const player = at60([sound(0, 60), sound(48, 62)]);
    player.setLoop({ from: 0, to: 96 });
    player.start(0, BAR);
    run(player, 10);
    expect(clicks).toHaveLength(4);
    expect(played.map(p => p.when)).toEqual([104, 105, 106, 107, 108, 109, 110]);
  });

  it('counts again when a tap jumps during the count', () => {
    const player = at60([sound(0), sound(96, 62)]);
    player.start(0, BAR);
    run(player, 1);
    const heard = clicks.length;
    player.start(96, BAR);
    expect(silenced).toBe(1);
    run(player, 0.1);
    expect(clicks[heard].strong).toBe(true);
    expect(clicks[heard].when).toBeCloseTo(101, 5);
  });
});
