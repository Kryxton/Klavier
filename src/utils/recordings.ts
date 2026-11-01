// The sound of the videos pieces were read from, to compare with the notes. Too big for localStorage,
// so in the browser's database. Pieces work without it: backups don't carry it, and a browser may
// clear it or not offer it at all.
const DATABASE = 'klavier';
const STORE = 'aufnahmen';

interface Stored {
  rate: number;
  samples: Int16Array;
}

function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const request = work(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).finally(() => db.close());
}

export const toSamples16 = (samples: Float32Array) =>
  Int16Array.from(samples, sample => Math.round(Math.max(-1, Math.min(1, sample)) * 32767));

export async function saveRecording(id: string, samples: Float32Array, rate: number) {
  try {
    await run('readwrite', store => store.put({ rate, samples: toSamples16(samples) } satisfies Stored, id));
    return true;
  } catch {
    return false;
  }
}

export async function deleteRecording(id: string) {
  try {
    await run('readwrite', store => store.delete(id));
  } catch {
    // Without a database there is nothing to delete
  }
}

// The head of a plain WAV file: the browser plays that at any speed, without changing the pitch
export function wavHeader(samples: Int16Array, rate: number) {
  const header = new DataView(new ArrayBuffer(44));
  const text = (at: number, value: string) => [...value].forEach((c, i) => header.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  header.setUint32(4, 36 + samples.byteLength, true);
  text(8, 'WAVEfmt ');
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, 1, true);
  header.setUint32(24, rate, true);
  header.setUint32(28, rate * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  text(36, 'data');
  header.setUint32(40, samples.byteLength, true);
  return header;
}

const wavOf = (samples: Int16Array, rate: number) =>
  new Blob([wavHeader(samples, rate), samples.slice()], { type: 'audio/wav' });

// From ticks to seconds in the recording and back, between the moments known from the reading.
// Played music moves freely, so this can't be a tempo. Beyond the ends it goes on at `perSecond`.
function along(points: [number, number][], from: 0 | 1, to: 0 | 1, value: number, slope: number) {
  if (!points.length) return value * slope;
  let low = 0;
  let high = points.length - 1;
  if (value <= points[0][from]) return points[0][to] + (value - points[0][from]) * slope;
  if (value >= points[high][from]) return points[high][to] + (value - points[high][from]) * slope;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (points[middle][from] <= value) low = middle;
    else high = middle;
  }
  const share = (value - points[low][from]) / (points[high][from] - points[low][from]);
  return points[low][to] + share * (points[high][to] - points[low][to]);
}

export const secondsAt = (moments: [number, number][], tick: number, ticksPerSecond: number) =>
  along(moments, 0, 1, tick, 1 / ticksPerSecond);

export const tickAt = (moments: [number, number][], seconds: number, ticksPerSecond: number) =>
  along(moments, 1, 0, seconds, ticksPerSecond);

export async function loadRecording(id: string) {
  try {
    const stored = await run<Stored | undefined>('readonly', store => store.get(id));
    return stored ? wavOf(stored.samples, stored.rate) : null;
  } catch {
    return null;
  }
}
