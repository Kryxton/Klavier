import * as Tone from 'tone';
import type { Clock } from './player';
import type { Sound } from './score';

const RELEASE = 1; // seconds a key fades after it is let go
const CUT = 0.06; // seconds everything fades when playback is stopped
const CLICK_PITCH = { strong: 1760, weak: 1320 };
const CLICK_LEVEL = 0.3; // about as loud as a played note

// Until the real piano samples have arrived (or if they can't be loaded) a small synth plays, so a
// tap always makes a sound
let samples: Tone.ToneAudioBuffers | null = null;
let samplesReady = false;
let synth: Tone.PolySynth | null = null;
let clicks: { strong: Tone.ToneAudioBuffer; weak: Tone.ToneAudioBuffer } | null = null;
const recorded: number[] = []; // the keys that have a sample, the others are pitched from the nearest

// All notes of one run go through one bus. Tone's Sampler can't take back a release it was given,
// so a pause would leave held notes sounding; dropping the bus also reaches those that were only
// planned so far.
let bus: Tone.Gain | null = null;
const output = () => (bus ??= new Tone.Gain(1).toDestination());

function loadSamples() {
  if (samples) return;
  const urls: Record<number, string> = { 21: 'A0.mp3', 108: 'C8.mp3' };
  for (let octave = 1; octave <= 7; octave++) {
    const c = (octave + 1) * 12;
    urls[c] = `C${octave}.mp3`;
    urls[c + 3] = `Ds${octave}.mp3`;
    urls[c + 6] = `Fs${octave}.mp3`;
    urls[c + 9] = `A${octave}.mp3`;
  }
  recorded.push(...Object.keys(urls).map(Number));
  samples = new Tone.ToneAudioBuffers({
    urls,
    baseUrl: 'https://tonejs.github.io/audio/salamander/',
    onload: () => { samplesReady = true; },
    onerror: () => { samplesReady = false; },
  });
}

function strike(midi: number, when: number, seconds: number) {
  if (!samples || !samplesReady) {
    synth ??= new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.6 },
      volume: -8,
    }).toDestination();
    synth.triggerAttackRelease(Tone.Frequency(midi, 'midi').toNote(), seconds, when);
    return;
  }
  const nearest = recorded.reduce((best, key) => (Math.abs(key - midi) < Math.abs(best - midi) ? key : best));
  const buffer = samples.get(nearest);
  const playbackRate = Tone.intervalToFrequencyRatio(midi - nearest);
  const source = new Tone.ToneBufferSource({ url: buffer, curve: 'exponential', fadeOut: RELEASE, playbackRate }).connect(output());
  source.onended = () => {}; // with a listener Tone cleans the source up by itself
  source.start(when, 0, buffer.duration / playbackRate, 1);
  source.stop(when + seconds);
}

// A wooden tick for the count-in, made once
function clickSound(pitch: number) {
  const rate = Tone.getContext().sampleRate;
  return Tone.ToneAudioBuffer.fromArray(Float32Array.from({ length: rate * 0.05 }, (_, i) => (
    Math.sin((2 * Math.PI * pitch * i) / rate) * Math.exp(-i / (rate * 0.008))
  )));
}

function click(when: number, strong: boolean) {
  clicks ??= { strong: clickSound(CLICK_PITCH.strong), weak: clickSound(CLICK_PITCH.weak) };
  const buffer = strong ? clicks.strong : clicks.weak;
  const source = new Tone.ToneBufferSource({ url: buffer }).connect(output());
  source.onended = () => {};
  source.start(when, 0, buffer.duration, CLICK_LEVEL);
}

// Browsers allow sound only after a tap: call this from the tap itself
export function unlockAudio() {
  void Tone.start();
  loadSamples();
}

export function playKey(midi: number) {
  unlockAudio();
  strike(midi, Tone.immediate(), 0.6);
}

export const audioClock: Clock = {
  now: () => Tone.immediate(),
  play: (sound: Sound, when: number, seconds: number) => strike(sound.midi, when, seconds),
  click,
  silence: () => {
    synth?.releaseAll();
    const old = bus;
    bus = null;
    old?.gain.rampTo(0, CUT);
    if (old) setTimeout(() => old.dispose(), CUT * 2000);
  },
};
