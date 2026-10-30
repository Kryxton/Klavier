import { PPQ, type Sound } from './score';

export interface Clock {
  now: () => number; // seconds on the audio clock
  play: (sound: Sound, when: number, seconds: number) => void;
  silence: () => void;
}

export interface Loop {
  from: number; // ticks
  to: number;
}

// How far ahead notes are handed to the audio clock. Timers only wake the scheduler up; the notes
// themselves are placed on the audio clock, so they stay exact even when a timer comes late.
export const LOOKAHEAD = 0.25;

// Plays a list of sounds from a tick on, with speed and an optional loop. No React or audio code
// in here, so the timing can be tested with a fake clock.
export class Player {
  private sounds: Sound[] = [];
  private end = 0;
  private bpm = 80;
  private speed = 1;
  private loop: Loop | null = null;
  private running = false;
  private startedAt = 0; // audio time of `startTick`
  private startTick = 0;
  private handed = 0; // everything before this tick has been given to the audio clock
  private clock: Clock;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  private ticksPerSecond() {
    return (this.bpm * PPQ * this.speed) / 60;
  }

  load(sounds: Sound[], bpm: number) {
    this.sounds = sounds;
    this.end = sounds.reduce((max, s) => Math.max(max, s.start + s.length), 0);
    this.bpm = bpm;
  }

  isRunning() {
    return this.running;
  }

  // Where the music is right now, in ticks
  position() {
    if (!this.running) return this.startTick;
    const tick = this.startTick + (this.clock.now() - this.startedAt) * this.ticksPerSecond();
    if (!this.loop || tick < this.loop.to) return tick;
    return this.loop.from + ((tick - this.loop.from) % (this.loop.to - this.loop.from));
  }

  private rebase(tick: number) {
    this.startedAt = this.clock.now();
    this.startTick = tick;
    this.handed = tick;
  }

  start(tick = this.startTick) {
    this.running = true;
    this.rebase(this.loop && (tick < this.loop.from || tick >= this.loop.to) ? this.loop.from : tick);
    this.tick();
  }

  stop() {
    const at = this.position();
    this.running = false;
    this.startTick = at;
    this.clock.silence();
  }

  seek(tick: number) {
    if (this.running) {
      this.clock.silence();
      this.rebase(tick);
      this.tick();
    } else this.startTick = tick;
  }

  setSpeed(speed: number) {
    const at = this.position();
    this.speed = speed;
    if (this.running) this.rebase(at);
    else this.startTick = at;
  }

  setLoop(loop: Loop | null) {
    this.loop = loop && loop.to > loop.from ? loop : null;
    if (this.running && this.loop) {
      const at = this.position();
      if (at < this.loop.from || at >= this.loop.to) this.seek(this.loop.from);
    }
  }

  // Call this every few dozen milliseconds. Returns false once the piece has ended.
  tick() {
    if (!this.running) return false;
    const perSecond = this.ticksPerSecond();
    const horizon = this.handed + Math.max(0, (this.clock.now() + LOOKAHEAD - this.timeOf(this.handed)) * perSecond);

    if (this.loop && horizon >= this.loop.to) {
      this.handOut(this.handed, this.loop.to);
      const startsAgain = this.timeOf(this.loop.to);
      this.startedAt = startsAgain;
      this.startTick = this.loop.from;
      this.handed = this.loop.from;
      return true;
    }

    this.handOut(this.handed, horizon);
    this.handed = horizon;
    if (horizon < this.end) return true;
    if (this.clock.now() < this.timeOf(this.end)) return true;
    this.running = false;
    this.startTick = 0;
    return false;
  }

  private timeOf(tick: number) {
    return this.startedAt + (tick - this.startTick) / this.ticksPerSecond();
  }

  private handOut(from: number, to: number) {
    const perSecond = this.ticksPerSecond();
    for (const sound of this.sounds) {
      if (sound.start >= from && sound.start < to) {
        const length = this.loop ? Math.min(sound.length, this.loop.to - sound.start) : sound.length;
        this.clock.play(sound, Math.max(this.timeOf(sound.start), this.clock.now()), length / perSecond);
      }
    }
  }
}
