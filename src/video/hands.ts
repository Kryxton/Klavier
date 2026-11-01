const STEP = 0.5; // seconds between two places of the line
const WINDOW = 1.5; // seconds of music to each side that decide a place
const LOWEST = 44; // lowest and highest key the line may stand on
const HIGHEST = 80;
const MIDDLE_C = 60;
const TOGETHER = 0.06; // seconds; notes this close are played at once
const REACH = 14; // keys one hand can span at once
const TOO_FAR = 3; // how much a key beyond that counts against a line
const ALONE = 6; // what it costs a line to leave one hand without notes
const STAY = 0.3; // what it costs the line to move by one key
const CENTRED = 0.02; // and to stand one key away from middle C

const spread = (keys: number[]) => {
  if (!keys.length) return 0;
  const mean = keys.reduce((sum, key) => sum + key, 0) / keys.length;
  return keys.reduce((sum, key) => sum + Math.abs(key - mean), 0);
};

const span = (keys: number[]) => (keys.length > 1 ? Math.max(...keys) - Math.min(...keys) : 0);

// How badly a line on `line` separates these notes into two hands
function cost(keys: number[], chords: number[][], line: number) {
  const left = keys.filter(key => key < line);
  const right = keys.filter(key => key >= line);
  let far = 0;
  for (const chord of chords) {
    far += Math.max(0, span(chord.filter(key => key < line)) - REACH);
    far += Math.max(0, span(chord.filter(key => key >= line)) - REACH);
  }
  const alone = left.length && right.length ? 0 : ALONE;
  return (spread(left) + spread(right) + TOO_FAR * far) / Math.max(1, keys.length) + alone + CENTRED * Math.abs(line - MIDDLE_C);
}

// Where the hands divide when a video draws both in one colour. A fixed split at middle C gets one
// note in five wrong: left-hand chords reach far above it. So the line moves with the music: at each
// moment it lies between the two groups of notes, it moves as little as it can, and no hand has to
// stretch further than a hand can. Against the hand colours of a real video: one note in 25 wrong.
export function handLine(notes: { midi: number; start: number }[]) {
  if (!notes.length) return () => MIDDLE_C;
  const places = HIGHEST - LOWEST + 1;
  const count = Math.ceil(Math.max(...notes.map(n => n.start)) / STEP) + 1;
  const sorted = [...notes].sort((a, b) => a.start - b.start);

  let best = new Float64Array(places);
  const cameFrom = Array.from({ length: count }, () => new Int16Array(places));
  for (let k = 0; k < count; k++) {
    const here = sorted.filter(n => Math.abs(n.start - k * STEP) <= WINDOW);
    const keys = here.map(n => n.midi);
    const chords: number[][] = [];
    here.forEach((note, i) => {
      if (i && note.start - here[i - 1].start < TOGETHER) chords[chords.length - 1].push(note.midi);
      else chords.push([note.midi]);
    });
    const next = new Float64Array(places);
    for (let place = 0; place < places; place++) {
      let least = Infinity;
      let from = place;
      for (let before = 0; before < places; before++) {
        const value = best[before] + (k ? STAY * Math.abs(before - place) : 0);
        if (value < least) {
          least = value;
          from = before;
        }
      }
      cameFrom[k][place] = from;
      next[place] = least + cost(keys, chords, LOWEST + place);
    }
    best = next;
  }

  const line = new Int16Array(count);
  let place = best.indexOf(Math.min(...best));
  for (let k = count - 1; k >= 0; k--) {
    line[k] = LOWEST + place;
    place = cameFrom[k][place];
  }
  return (time: number) => line[Math.max(0, Math.min(count - 1, Math.round(time / STEP)))];
}
