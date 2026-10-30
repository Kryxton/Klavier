import * as Tone from 'tone';
import type { Clock } from './player';
import type { Sound } from './score';

// Until the real piano samples have arrived (or if they can't be loaded) a small synth plays, so a
// tap always makes a sound
let sampler: Tone.Sampler | null = null;
let samplerReady = false;
let synth: Tone.PolySynth | null = null;

function loadSampler() {
  if (sampler) return;
  const urls: Record<string, string> = { A0: 'A0.mp3', C8: 'C8.mp3' };
  for (let octave = 1; octave <= 7; octave++) {
    urls[`C${octave}`] = `C${octave}.mp3`;
    urls[`D#${octave}`] = `Ds${octave}.mp3`;
    urls[`F#${octave}`] = `Fs${octave}.mp3`;
    urls[`A${octave}`] = `A${octave}.mp3`;
  }
  sampler = new Tone.Sampler({
    urls,
    release: 1,
    baseUrl: 'https://tonejs.github.io/audio/salamander/',
    onload: () => { samplerReady = true; },
    onerror: () => { samplerReady = false; },
  }).toDestination();
}

function instrument() {
  if (sampler && samplerReady) return sampler;
  synth ??= new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.6 },
    volume: -8,
  }).toDestination();
  return synth;
}

// Browsers allow sound only after a tap: call this from the tap itself
export function unlockAudio() {
  void Tone.start();
  loadSampler();
}

const noteName = (midi: number) => Tone.Frequency(midi, 'midi').toNote();

export function playKey(midi: number) {
  unlockAudio();
  instrument().triggerAttackRelease(noteName(midi), 0.6, Tone.immediate());
}

export const audioClock: Clock = {
  now: () => Tone.immediate(),
  play: (sound: Sound, when: number, seconds: number) => {
    instrument().triggerAttackRelease(noteName(sound.midi), seconds, when);
  },
  silence: () => {
    sampler?.releaseAll();
    synth?.releaseAll();
  },
};
