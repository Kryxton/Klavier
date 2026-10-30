import { findKeyboard, type KeyMap } from './keyboard';
import { Tracker, type Detected } from './tracker';

const MAX_WIDTH = 960; // enough to tell the keys apart, and much faster than full size
const LOOKS = 12; // pictures tried to find the keyboard: intros and outros often don't show it
const SPEED = 1; // faster skips pictures: note starts get less exact and fast tempos are misread
const STEP = 1 / 30; // seconds between pictures when reading one by one
const HOLE = 0.05; // a longer time without a picture has to be read again
const SEEK_WAIT = 2000; // ms
const WATCH_MS = 250;
const STALL_MS = 3000;

export class VideoError extends Error {}

const once = (target: EventTarget, event: string) =>
  new Promise<void>(resolve => target.addEventListener(event, () => resolve(), { once: true }));

// Browsers don't always answer: a missing 'seeked' must not stop everything
async function seek(video: HTMLVideoElement, time: number) {
  const done = once(video, 'seeked');
  video.currentTime = time;
  await Promise.race([done, new Promise(resolve => setTimeout(resolve, SEEK_WAIT))]);
}

// Until the video has ended, or stands still for a while. The 'ended' event alone isn't reliable,
// and whatever was missed is read afterwards anyway.
const playedThrough = (video: HTMLVideoElement) =>
  new Promise<void>(resolve => {
    let last = -1;
    let still = 0;
    const timer = setInterval(() => {
      still = video.currentTime === last ? still + 1 : 0;
      last = video.currentTime;
      if (video.ended || still * WATCH_MS >= STALL_MS) {
        clearInterval(timer);
        resolve();
      }
    }, WATCH_MS);
  });

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
  // Screen recordings often don't state their length until the browser has looked at the end
  if (!Number.isFinite(video.duration)) {
    const known = once(video, 'durationchange');
    video.currentTime = 1e7;
    await known;
  }
  return video;
}

export async function readVideo(file: File, progress: (share: number) => void) {
  const video = await open(file);
  try {
    const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new VideoError('Dieser Browser kann das Video nicht lesen.');
    if (!('requestVideoFrameCallback' in video)) throw new VideoError('Dieser Browser ist zu alt für die Video-Erkennung.');

    let map: KeyMap | null = null;
    for (let i = 0; i < LOOKS; i++) {
      await seek(video, video.duration * (0.08 + (0.84 * i) / (LOOKS - 1)));
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const found = findKeyboard(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (found && (!map || found.keys.length > map.keys.length)) map = found;
      progress(0.1 * ((i + 1) / LOOKS));
    }
    if (!map) throw new VideoError('In diesem Video habe ich keine Klaviatur gefunden.');

    const keyboard = map;
    const tracker = new Tracker(keyboard);
    await seek(video, 0);
    video.playbackRate = SPEED;
    const read = (time: number) => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      tracker.add(ctx.getImageData(0, keyboard.scanY, canvas.width, 1), time);
    };
    const seen = [0];
    const onFrame: VideoFrameRequestCallback = (_, frame) => {
      read(frame.mediaTime);
      seen.push(frame.mediaTime);
      progress(0.1 + 0.6 * Math.min(1, frame.mediaTime / video.duration));
      video.requestVideoFrameCallback(onFrame);
    };
    video.requestVideoFrameCallback(onFrame);
    await video.play();
    await playedThrough(video);
    video.pause();

    // Playing is fast but skips pictures when the device is busy or the tab is in the background.
    // A skipped note would simply be missing, so every hole is read picture by picture afterwards.
    seen.push(video.duration);
    const holes = seen.slice(1).flatMap((time, i) => (time - seen[i] > HOLE ? [{ from: seen[i], to: time }] : []));
    const missing = holes.reduce((sum, hole) => sum + hole.to - hole.from, 0);
    let done = 0;
    for (const hole of holes) {
      for (let time = hole.from + STEP; time < hole.to; time += STEP) {
        await seek(video, time);
        read(time);
        done += STEP;
        progress(0.7 + 0.3 * Math.min(1, done / missing));
      }
    }
    const notes: Detected[] = tracker.finish();
    if (!notes.length) throw new VideoError('Die Klaviatur ist da, aber ich habe keine Balken darüber erkannt.');
    return { notes, fullKeyboard: keyboard.fullKeyboard };
  } finally {
    URL.revokeObjectURL(video.src);
    video.remove();
  }
}
