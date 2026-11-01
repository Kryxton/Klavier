import { findKeyboard, type KeyMap } from './keyboard';
import { judge, soundOf } from './sound';
import { Tracker, type Detected } from './tracker';

const MAX_WIDTH = 960; // enough to tell the keys apart, and much faster than full size
const LOOKS = 12; // pictures tried to find the keyboard: intros and outros often don't show it
const CERTAIN = 4; // looks at the full keyboard that are enough
const SCOUT_SPEEDS = [8, 2]; // runs through, only looking for the keyboard: fast, then carefully
const SPEED = 1; // faster skips pictures: note starts get less exact and fast tempos are misread
const SLOWEST = 0.5;
const ENOUGH = 27; // pictures for each second of video: with fewer the note times get too uneven for the rhythm
const CHECK_EVERY = 2; // seconds of video
const STEP = 1 / 30; // seconds between pictures when reading one by one
const HOLE = 0.12; // a longer time without a picture has to be read again; recordings are uneven
const HOLE_BUDGET = 0.1; // of the video's length: reading holes one by one is slow
const SEEK_WAIT = 1000; // ms
const WATCH_MS = 250;
const STALL_MS = 3000;
const SCOUT_SHARE = 0.1; // of the progress bar
const PLAY_SHARE = 0.7;
const HOLE_SHARE = 0.05;

export class VideoError extends Error {}

export type Stage = 'keys' | 'bars' | 'sound';
type Progress = (share: number, stage: Stage) => void;

const stoppedIf = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');
};

const once = (target: EventTarget, event: string) =>
  new Promise<void>(resolve => target.addEventListener(event, () => resolve(), { once: true }));

// Whether the browser answered: with iPhone recordings (HEVC) Chrome on Windows stops answering
// after the first jump, so jumping can only ever be an extra
async function seek(video: HTMLVideoElement, time: number) {
  const done = once(video, 'seeked').then(() => true);
  video.currentTime = time;
  return Promise.race([done, new Promise<boolean>(resolve => setTimeout(() => resolve(false), SEEK_WAIT))]);
}

// Plays from where it stands, calling `frame` for every picture shown, until the end, until `frame`
// returns true, or until nothing moves any more. The 'ended' event alone isn't reliable. In a hidden
// tab no pictures arrive, so it waits there: notes played meanwhile would be gone without a trace.
async function playThrough(video: HTMLVideoElement, speed: number, frame: (time: number) => boolean | void, signal?: AbortSignal) {
  let stop = false;
  const onFrame: VideoFrameRequestCallback = (_, data) => {
    if (stop) return;
    if (frame(data.mediaTime)) stop = true;
    else video.requestVideoFrameCallback(onFrame);
  };
  video.requestVideoFrameCallback(onFrame);
  video.playbackRate = speed;
  void video.play().catch(() => { stop = true; });
  const onVisibility = () => {
    if (document.hidden) video.pause();
    else void video.play().catch(() => { stop = true; });
  };
  document.addEventListener('visibilitychange', onVisibility);
  await new Promise<void>(resolve => {
    let last = -1;
    let still = 0;
    const timer = setInterval(() => {
      still = video.currentTime === last && !document.hidden ? still + 1 : 0;
      last = video.currentTime;
      if (stop || signal?.aborted || video.ended || still * WATCH_MS >= STALL_MS) {
        clearInterval(timer);
        resolve();
      }
    }, WATCH_MS);
  });
  document.removeEventListener('visibilitychange', onVisibility);
  stop = true;
  video.pause();
}

async function open(file: File) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  // Some browsers only hand out pictures of a video that is on the page
  video.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none';
  document.body.appendChild(video);
  const failed = once(video, 'error').then(() => { throw new VideoError('Diese Datei lässt sich nicht als Video öffnen.'); });
  video.src = URL.createObjectURL(file);
  await Promise.race([once(video, 'loadedmetadata'), failed]);
  if (!('requestVideoFrameCallback' in video)) throw new VideoError('Dieser Browser ist zu alt für die Video-Erkennung.');
  return video;
}

function close(video: HTMLVideoElement) {
  URL.revokeObjectURL(video.src);
  video.remove();
}

// `rows`: a thin strip that stays on the graphics card. The hint for frequent reading would make
// every picture come down from there whole, which alone cost 30 ms for each row.
function canvasFor(video: HTMLVideoElement, rows?: number) {
  const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = rows ?? Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: !rows });
  if (!ctx) throw new VideoError('Dieser Browser kann das Video nicht lesen.');
  return { canvas, ctx, scale };
}

// A quick run through the video, looking at a few pictures for the keyboard
async function lookForKeys(file: File, speed: number, progress: Progress, signal?: AbortSignal) {
  const video = await open(file);
  try {
    const { canvas, ctx } = canvasFor(video);
    const every = (Number.isFinite(video.duration) ? video.duration : 120) / LOOKS;
    let next = every / 2;
    let full = 0;
    let map: KeyMap | null = null;
    await playThrough(video, speed, time => {
      progress(SCOUT_SHARE * Math.min(1, time / (video.duration || 1)), 'keys');
      if (time < next) return false;
      next += every;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const found = findKeyboard(ctx.getImageData(0, 0, canvas.width, canvas.height));
      // Hands over the keys hide black keys and push the found top edge down, so the picture with
      // the most keys and the highest edge is the one to trust
      if (found && (!map || found.keys.length > map.keys.length || (found.keys.length === map.keys.length && found.keyTop < map.keyTop))) map = found;
      if (found?.fullKeyboard) full++;
      return full >= CERTAIN;
    }, signal);
    stoppedIf(signal);
    return map as KeyMap | null;
  } finally {
    close(video);
  }
}

// At high speed a busy browser may show too few pictures to see the keyboard in
async function findKeys(file: File, progress: Progress, signal?: AbortSignal) {
  for (const speed of SCOUT_SPEEDS) {
    const map = await lookForKeys(file, speed, progress, signal);
    if (map) return map;
  }
  return null;
}

// A sleeping screen ends the reading on phones and tablets
const stayAwake = async () => {
  try {
    return await navigator.wakeLock.request('screen');
  } catch {
    return null;
  }
};

export async function readVideo(file: File, progress: Progress, signal?: AbortSignal) {
  const awake = await stayAwake();
  try {
    return await read(file, progress, signal);
  } finally {
    void awake?.release();
  }
}

async function read(file: File, progress: Progress, signal?: AbortSignal) {
  const map = await findKeys(file, progress, signal);
  if (!map) throw new VideoError('In diesem Video habe ich keine Klaviatur gefunden.');
  progress(SCOUT_SHARE, 'bars');

  const video = await open(file);
  try {
    // Only the two rows needed, so that as many pictures as possible get read: a bar shorter than
    // the time between two pictures is never seen
    const { canvas, ctx, scale } = canvasFor(video, 2);
    const tracker = new Tracker(map);
    const read = (time: number) => {
      [map.scanY, map.keyRow].forEach((y, row) => {
        ctx.drawImage(video, 0, y / scale, video.videoWidth, 1 / scale, 0, row, canvas.width, 1);
      });
      const { data, width } = ctx.getImageData(0, 0, canvas.width, 2);
      const row = (y: number) => ({ data: data.subarray(y * width * 4, (y + 1) * width * 4), width, height: 1 });
      tracker.add(row(0), time, row(1));
    };

    const seen = [0];
    let since = 1;
    await playThrough(video, SPEED, time => {
      read(time);
      seen.push(time);
      if (time - seen[since] >= CHECK_EVERY) {
        // A slow device gets more pictures out of a video played more slowly
        if ((seen.length - since) / (time - seen[since]) < ENOUGH) video.playbackRate = Math.max(SLOWEST, video.playbackRate * 0.75);
        since = seen.length - 1;
      }
      progress(SCOUT_SHARE + PLAY_SHARE * Math.min(1, time / (video.duration || 1)), 'bars');
    }, signal);
    stoppedIf(signal);

    // Playing skips pictures when the device is busy or the tab is in the background. A skipped
    // note would be missing, so holes are read picture by picture, as long as the browser answers.
    seen.push(video.duration);
    const holes = seen.slice(1).flatMap((time, i) => (time - seen[i] > HOLE ? [{ from: seen[i], to: time }] : []));
    const missing = holes.reduce((sum, hole) => sum + hole.to - hole.from, 0);
    let done = 0;
    const until = performance.now() + video.duration * HOLE_BUDGET * 1000;
    reading: for (const hole of holes) {
      for (let time = hole.from + STEP; time < hole.to; time += STEP) {
        if (performance.now() > until || !(await seek(video, time))) break reading;
        read(time);
        done += STEP;
        progress(SCOUT_SHARE + PLAY_SHARE + HOLE_SHARE * Math.min(1, done / missing), 'bars');
      }
    }
    const notes: Detected[] = tracker.finish();
    if (!notes.length) throw new VideoError('Die Klaviatur ist da, aber ich habe keine Balken darüber erkannt.');

    // The sound is the second opinion; without one the picture stands alone
    const soundFrom = SCOUT_SHARE + PLAY_SHARE + HOLE_SHARE;
    progress(soundFrom, 'sound');
    const samples = await soundOf(file);
    stoppedIf(signal);
    const checked = samples && await judge(notes, tracker.doubtful, samples, share => {
      stoppedIf(signal);
      progress(soundFrom + (1 - soundFrom) * share, 'sound');
    });
    return { notes: checked?.notes ?? notes, hearing: checked?.hearing ?? null, samples, fullKeyboard: map.fullKeyboard };
  } finally {
    close(video);
  }
}
