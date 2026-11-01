import { findKey } from './rhythm';
import type { Detected } from './tracker';

export const RATE = 11025; // Hz; the overtones up to here are what tell keys apart
const SIZE = 2048; // samples in one look: 0.19 s
const SLOW = 4; // low keys are close together, so they get a look four times as long
const HOP = 0.02; // seconds between looks
const FIRST_KEY = 36; // what lies outside the keys below can't be judged and stays as it is
const KEYS = 60;
const LAST_BIN = 112; // key whose frequency ends the picture of the sound
const PER_KEY = 5; // frequency steps between two keys
const SLOW_BELOW = 72; // key up to which the long look is used
const OVERTONES = 8;
const LEARN_ROUNDS = 15;
const SPLIT_ROUNDS = 25;
const RING = 0.6; // seconds a note goes on sounding after its bar
const ENOUGH_LOOKS = 20; // of a key, to learn what it sounds like
const LAG_FROM = -1; // seconds from the picture to the sound
const LAG_TO = 2;
const LAG_STEP = 0.02;
const SURE_LAG = 2; // the right delay fits this many times better than a usual one
const BEFORE = 6; // looks that show how a key sounded before a note
const AFTER = 4;
const HEARD = 0.3; // of a typical note's attack: this note is in the sound
const CLEAR = 0.5; // this one so clearly that it may add or move a note
const SILENT = 0.3; // level below which a key isn't sounding at all
const NOTHING = 0.1; // attack and...
const NOTHING_LEVEL = 0.15; // ...level of something that was never played
const FLICKER = 0.1; // seconds; bars this short can be taken away
const REPEAT = 0.5; // seconds; a key struck again in its own echo shows no new attack
const SAME_NOTE = 0.15; // seconds

export interface Hearing {
  lag: number; // seconds the sound comes after the picture
  heard: number; // notes the sound confirms
  added: number;
  moved: number;
  dropped: number;
}

export interface Checked {
  notes: Detected[];
  hearing: Hearing;
}

const breathe = () => new Promise(resolve => setTimeout(resolve));

const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1];

const frequency = (key: number) => 440 * 2 ** ((key - 69) / 12);

function transform(re: Float64Array, im: Float64Array, cos: Float64Array, sin: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2;
    const step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let j = 0, t = 0; j < half; j++, t += step) {
        const a = start + j;
        const b = a + half;
        const x = re[b] * cos[t] + im[b] * sin[t];
        const y = im[b] * cos[t] - re[b] * sin[t];
        re[b] = re[a] - x;
        im[b] = im[a] - y;
        re[a] += x;
        im[a] += y;
      }
    }
  }
}

// Every SLOW-th sample of the smoothed sound
function thinned(samples: Float32Array) {
  const out = new Float32Array(Math.floor(samples.length / SLOW));
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (let d = -SLOW + 1; d < SLOW; d++) {
      const s = i * SLOW + d;
      if (s >= 0 && s < samples.length) sum += samples[s] * (SLOW - Math.abs(d));
    }
    out[i] = sum / (SLOW * SLOW);
  }
  return out;
}

// Which lines of a spectrum make up each frequency step
function bandsFor(rate: number, bins: number) {
  const line = rate / SIZE;
  return Array.from({ length: bins }, (_, b) => {
    const edge = (at: number) => frequency(FIRST_KEY + (at - 0.5) / PER_KEY) / line;
    const from = Math.ceil(edge(b));
    const to = Math.ceil(edge(b + 1));
    return { from, to, at: (edge(b) + edge(b + 1)) / 2 };
  });
}

// The sound as a picture, over time and frequency steps, with one look centred on each moment
async function spectrogram(samples: Float32Array, progress: (share: number) => void) {
  const seconds = samples.length / RATE;
  const frames = Math.floor(seconds / HOP);
  const bins = (LAST_BIN - FIRST_KEY) * PER_KEY + 1;
  const parts = [
    { signal: thinned(samples), rate: RATE / SLOW, gain: Math.sqrt(SLOW), first: 0, last: (SLOW_BELOW - FIRST_KEY) * PER_KEY },
    { signal: samples, rate: RATE, gain: 1, first: (SLOW_BELOW - FIRST_KEY) * PER_KEY, last: bins },
  ];
  const cos = Float64Array.from({ length: SIZE }, (_, i) => Math.cos((2 * Math.PI * i) / SIZE));
  const sin = Float64Array.from({ length: SIZE }, (_, i) => Math.sin((2 * Math.PI * i) / SIZE));
  const window = Float64Array.from({ length: SIZE }, (_, i) => 0.5 - 0.5 * cos[i]);
  const re = new Float64Array(SIZE);
  const im = new Float64Array(SIZE);
  const power = new Float64Array(SIZE / 2 + 1);
  const spectrum = new Float32Array(frames * bins);
  for (const [part, { signal, rate, gain, first, last }] of parts.entries()) {
    const bands = bandsFor(rate, bins);
    for (let f = 0; f < frames; f++) {
      const start = Math.round(f * HOP * rate) - SIZE / 2;
      for (let i = 0; i < SIZE; i++) {
        const at = start + i;
        re[i] = at >= 0 && at < signal.length ? signal[at] * window[i] : 0;
        im[i] = 0;
      }
      transform(re, im, cos, sin);
      for (let i = 0; i <= SIZE / 2; i++) power[i] = re[i] * re[i] + im[i] * im[i];
      for (let b = first; b < last; b++) {
        const { from, to, at } = bands[b];
        let value = 0;
        if (to > from) {
          for (let i = from; i < to && i <= SIZE / 2; i++) value += power[i];
          value = Math.sqrt(value);
        } else if (at < SIZE / 2) {
          const i = Math.floor(at);
          value = (1 - (at - i)) * Math.sqrt(power[i]) + (at - i) * Math.sqrt(power[i + 1]);
        }
        spectrum[f * bins + b] = value * gain;
      }
      if (f % 1000 === 999) {
        progress((part + f / frames) / parts.length);
        await breathe();
      }
    }
  }
  const top = spectrum.reduce((max, value) => (value > max ? value : max), 0) || 1;
  for (let i = 0; i < spectrum.length; i++) spectrum[i] /= top;
  return { spectrum, frames, bins };
}

type Sound = Awaited<ReturnType<typeof spectrogram>>;

// How long the sound comes after the picture: the bars pass the row a moment before they land, by
// how much depends on the video. The delay at which the most notes meet a rise of their key.
function findLag({ spectrum, frames, bins }: Sound, notes: Detected[]) {
  const risesOf = new Map<number, Float32Array>();
  const rises = (key: number) => {
    const known = risesOf.get(key);
    if (known) return known;
    const level = new Float32Array(frames);
    for (let h = 1; h <= 3; h++) {
      const bin = Math.round((key + 12 * Math.log2(h) - FIRST_KEY) * PER_KEY);
      if (bin + 1 >= bins) continue;
      for (let f = 0; f < frames; f++) {
        const i = f * bins + bin;
        level[f] += Math.max(spectrum[i - 1], spectrum[i], spectrum[i + 1]) / h;
      }
    }
    const rise = new Float32Array(frames);
    for (let f = 3; f < frames; f++) rise[f] = Math.max(0, level[f] - level[f - 3]);
    risesOf.set(key, rise);
    return rise;
  };
  const scores: { lag: number; score: number }[] = [];
  for (let lag = LAG_FROM; lag <= LAG_TO; lag += LAG_STEP) {
    let score = 0;
    for (const note of notes) {
      if (note.midi < FIRST_KEY || note.midi >= FIRST_KEY + KEYS) continue;
      const rise = rises(note.midi);
      const at = Math.round((note.start + lag) / HOP);
      let best = 0;
      for (let f = Math.max(0, at - 2); f <= at + 2 && f < frames; f++) if (rise[f] > best) best = rise[f];
      score += best;
    }
    scores.push({ lag, score });
  }
  const best = scores.reduce((a, b) => (b.score > a.score ? b : a));
  const usual = median(scores.map(s => s.score));
  return usual > 0 && best.score >= SURE_LAG * usual ? best.lag : null;
}

// What a key sounds like, as weights on a few frequency steps: its overtones
function startingTemplates(bins: number) {
  return Array.from({ length: KEYS }, (_, k) => {
    const weights = new Map<number, number>();
    for (let h = 1; h <= OVERTONES; h++) {
      const centre = Math.round((k + 12 * Math.log2(h)) * PER_KEY);
      for (const [d, share] of [[-1, 0.3], [0, 1], [1, 0.3]]) {
        const bin = centre + d;
        if (bin >= 0 && bin < bins) weights.set(bin, (weights.get(bin) ?? 0) + share / h);
      }
    }
    const sum = [...weights.values()].reduce((a, b) => a + b, 0);
    return { bins: Int32Array.from(weights.keys()), weights: Float64Array.from([...weights.values()].map(w => w / sum)) };
  });
}

type Templates = ReturnType<typeof startingTemplates>;

// One round of splitting the sound into keys: each key's share of each moment moves towards what
// explains the sound (non-negative factorisation). Templates are few numbers, so this stays fast
// enough for a phone. `learned` collects how the templates should change.
function round({ spectrum, frames, bins }: Sound, templates: Templates, shares: Float32Array, learned?: Float64Array[]) {
  const model = new Float64Array(bins);
  const sums = templates.map(t => t.weights.reduce((a, b) => a + b, 0));
  for (let f = 0; f < frames; f++) {
    const row = f * bins;
    model.fill(1e-9);
    for (let k = 0; k < KEYS; k++) {
      const share = shares[f * KEYS + k];
      if (!share) continue;
      const { bins: at, weights } = templates[k];
      for (let i = 0; i < at.length; i++) model[at[i]] += share * weights[i];
    }
    for (let k = 0; k < KEYS; k++) {
      const share = shares[f * KEYS + k];
      if (!share) continue;
      const { bins: at, weights } = templates[k];
      let sum = 0;
      for (let i = 0; i < at.length; i++) {
        const ratio = spectrum[row + at[i]] / model[at[i]];
        sum += weights[i] * ratio;
        if (learned) learned[k][i] += share * ratio;
      }
      shares[f * KEYS + k] = (share * sum) / sums[k];
    }
  }
}

// The picture says when each key is played; those moments show what the keys of this recording
// really sound like
async function learnTemplates(sound: Sound, notes: Detected[], lag: number, progress: (share: number) => void) {
  const { frames, bins } = sound;
  const templates = startingTemplates(bins);
  const shares = new Float32Array(frames * KEYS);
  const seen = new Int32Array(KEYS);
  for (const note of notes) {
    const k = note.midi - FIRST_KEY;
    if (k < 0 || k >= KEYS) continue;
    const from = Math.max(0, Math.round((note.start + lag) / HOP) - 2);
    const to = Math.min(frames, Math.round((note.end + lag + RING) / HOP));
    for (let f = from; f < to; f++) {
      if (!shares[f * KEYS + k]) seen[k]++;
      shares[f * KEYS + k] = 0.1;
    }
  }
  for (let r = 0; r < LEARN_ROUNDS; r++) {
    const learned = templates.map(t => new Float64Array(t.weights.length));
    round(sound, templates, shares, learned);
    templates.forEach((template, k) => {
      if (seen[k] <= ENOUGH_LOOKS) return;
      const total = learned[k].reduce((a, b) => a + b, 0) || 1;
      const sum = template.weights.reduce((a, w, i) => a + w * learned[k][i], 0) / total || 1;
      template.weights = template.weights.map((w, i) => (w * learned[k][i]) / total / sum);
    });
    progress((r + 1) / LEARN_ROUNDS);
    await breathe();
  }
  return { templates, known: templates.map((_, k) => seen[k] > ENOUGH_LOOKS) };
}

async function splitIntoKeys(sound: Sound, templates: Templates, progress: (share: number) => void) {
  const { spectrum, frames } = sound;
  const mean = spectrum.reduce((a, b) => a + b, 0) / spectrum.length;
  const shares = new Float32Array(frames * KEYS).fill(mean / KEYS);
  for (let r = 0; r < SPLIT_ROUNDS; r++) {
    round(sound, templates, shares);
    progress((r + 1) / SPLIT_ROUNDS);
    await breathe();
  }
  return shares;
}

// The notes against the sound. The picture proposes, the sound decides: doubtful bars that clearly
// sound become notes, silent notes outside the key go to the neighbouring key that does sound, or
// away. A note that fits the key stays: the overtones of a lower note can sound like its neighbour,
// and this has replaced right notes. So do solid bars with no such evidence, because quiet inner
// notes can't be heard out of a chord.
export async function judge(notes: Detected[], doubtful: Detected[], samples: Float32Array, progress: (share: number) => void = () => {}): Promise<Checked | null> {
  if (notes.length < 8 || samples.length < SIZE) return null;
  const sound = await spectrogram(samples, share => progress(share * 0.4));
  const lag = findLag(sound, notes);
  if (lag === null) return null;
  const { templates, known: heardBefore } = await learnTemplates(sound, notes, lag, share => progress(0.4 + share * 0.3));
  const shares = await splitIntoKeys(sound, templates, share => progress(0.7 + share * 0.3));
  const { frames } = sound;

  const at = (seconds: number) => Math.round((seconds + lag) / HOP);
  const known = (midi: number) => midi >= FIRST_KEY && midi < FIRST_KEY + KEYS;
  const attack = (midi: number, start: number) => {
    const f = at(start);
    if (!known(midi) || f < 3 || f >= frames - AFTER - 1) return 0;
    const k = midi - FIRST_KEY;
    let peak = 0;
    for (let i = f - 1; i <= f + AFTER; i++) peak = Math.max(peak, shares[i * KEYS + k]);
    let before = 0;
    const first = Math.max(0, f - BEFORE);
    for (let i = first; i < f - 1; i++) before += shares[i * KEYS + k];
    return Math.max(0, peak - before / (f - 1 - first));
  };
  const level = (midi: number, start: number) => {
    const f = at(start);
    if (!known(midi) || f < 0 || f + 12 >= frames) return 0;
    let sum = 0;
    for (let i = f; i < f + 12; i++) sum += shares[i * KEYS + midi - FIRST_KEY];
    return sum / 12;
  };

  const attacks = notes.map(n => attack(n.midi, n.start)).filter(a => a > 0);
  if (!attacks.length) return null;
  const typical = median(attacks);
  const heard = (midi: number, start: number) => attack(midi, start) / typical;
  // A key the piece hardly uses has no learned sound, and rumble in the bass looks like such keys
  const clearly = (midi: number, start: number) => (heardBefore[midi - FIRST_KEY] ? heard(midi, start) : 0);

  const added: Detected[] = [];
  for (const note of [...doubtful].sort((a, b) => a.start - b.start)) {
    const twice = added.some(other => other.midi === note.midi && Math.abs(other.start - note.start) < SAME_NOTE);
    if (!twice && clearly(note.midi, note.start) >= CLEAR) added.push(note);
  }

  const sounding = (list: Detected[], midi: number, start: number) =>
    list.some(other => other.midi === midi && other.start - SAME_NOTE < start && start < other.end + SAME_NOTE);
  const everything = [...notes, ...added];
  const key = findKey(notes);
  const scale = [0, 2, 4, 5, 7, 9, 11].map(step => ((key * 7 + step) % 12 + 12) % 12);
  let confirmed = 0;
  let moved = 0;
  let dropped = 0;
  const kept: Detected[] = [];
  for (const note of notes) {
    const here = heard(note.midi, note.start);
    if (here >= HEARD) confirmed++;
    const repeated = notes.some(other => other !== note && other.midi === note.midi && other.start < note.start && note.start - other.end < REPEAT);
    if (!known(note.midi) || here >= HEARD || repeated || level(note.midi, note.start) / typical > SILENT) {
      kept.push(note);
      continue;
    }
    const neighbour = [-1, 1, -2, 2]
      .map(d => ({ midi: note.midi + d, value: clearly(note.midi + d, note.start) }))
      .reduce((a, b) => (b.value > a.value ? b : a));
    if (neighbour.value >= CLEAR && !scale.includes(note.midi % 12)) {
      if (sounding(everything, neighbour.midi, note.start)) {
        dropped++;
      } else {
        kept.push({ ...note, midi: neighbour.midi });
        moved++;
      }
    } else if (note.end - note.start <= FLICKER && here < NOTHING && level(note.midi, note.start) / typical < NOTHING_LEVEL) {
      dropped++;
    } else {
      kept.push(note);
    }
  }
  return {
    notes: [...kept, ...added].sort((a, b) => a.start - b.start || a.midi - b.midi),
    hearing: { lag, heard: confirmed, added: added.length, moved, dropped },
  };
}

// The sound of a video file, or null if it has none or the browser can't read it
export async function soundOf(file: File) {
  try {
    const context = new OfflineAudioContext(1, 1, RATE);
    const sound = await context.decodeAudioData(await file.arrayBuffer());
    const samples = new Float32Array(sound.length);
    for (let c = 0; c < sound.numberOfChannels; c++) {
      const channel = sound.getChannelData(c);
      for (let i = 0; i < samples.length; i++) samples[i] += channel[i] / sound.numberOfChannels;
    }
    return samples;
  } catch {
    return null;
  }
}
