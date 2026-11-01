# Klavier – notes for Claude

Piano site for the same user as Life OS (`C:\Users\tizia\Dev\lifeOS\lifeOSpublish`, read its
CLAUDE.md for who the user is and how they want to work: German replies, branch per feature, tests +
build green, mobile first 320–390 px, screenshots for visual choices). **The UI is German.**
Started 2026-10-30.

## Goal
**A tutorial video with falling notes goes in, a finished score comes out.** The user plays from
such YouTube tutorials and doesn't want to type them out (said clearly 2026-10-30; the first
version missed this and only made typing faster). The user doesn't make videos. Falling notes to
watch are an extra, never the focus. Only for the user, with cloud sync still to come.
Design (user, 2026-10-31): clear and tidy above all, smooth and satisfying to use, must look like
no AI made it (the black-gold version with spaced capitals and serif italics was rejected, tabs
especially), and work on phone, iPad and laptop.

## Hosting
- Live on Vercel: https://klavier-phi.vercel.app (push to `main` = live, the repo was connected
  before this file was written). GitHub Pages still serves the unbuilt root of `main`, so
  `kryxton.github.io/Klavier` shows nothing and can be switched off. Branch `alter-editor` = the old
  site (don't delete).
- **`vercel.json` sets a content security policy that the dev server doesn't.** Anything new that
  loads something (a media file, a script, a request) has to be checked on the live address, not
  only locally: without `media-src blob:` no video could be opened there, and no local test showed it.

## Stack (same as Latein, no Supabase yet)
React 19 + TypeScript + Vite (single file) + Tailwind 4, lucide-react, Vitest. VexFlow 4 for the
score (4, not 5: 5 loads its fonts differently), Tone.js for sound. `npm test`, `npm run build`.

## Code map
- `src/types.ts`: `Piece` with `hands.right/left`, each a list of `Ev` (keys = MIDI numbers, empty =
  rest; duration, dotted, tie, `spell` = a black key written against the key signature).
- `utils/notes.ts`: spelling (`spell`, follows the key signature; German `label`, H and B),
  `signFor` (which sign to print in a bar), `keyBox` (position of a key, shared by `Keyboard` and
  `Falling`, so the bars land on their keys).
- `utils/score.ts`: `PPQ` 48 ticks; `toBars` splits events over barlines into tied `Printed` notes
  (`continued` = no sign of its own), `timeline` joins ties into `Sound`s.
- `utils/edit.ts`: plain functions piece → piece. `App.tsx` `change` keeps undo/redo (100 steps).
- `utils/player.ts`: `Player`, no React or audio inside, tested with a fake clock. Timers only wake
  it up; notes are placed on the audio clock (`LOOKAHEAD`), so timing stays exact. `audio.ts` = Tone
  (Salamander samples, synth until they have arrived), `usePlayer.ts` = the React side.
- `components/Sheet.tsx`: VexFlow. Both hands go through one `Formatter`, so notes that sound together
  stand above each other. Redraws only when notes or width change; selected and sounding notes just
  switch a class. A tap goes to the nearest note within `TAP_RADIUS`, because noteheads are small.
- Pages: `Pieces` (home, list, backup file), `Import` (video to piece), `Write` = „Notenblatt“: the
  score; „Korrigieren“ or tapping a note brings the tools and keys (keys toggle the chord, „+“
  puts a rest behind the note to fill), `Practice` (Noten, Fallend as the extra).
- `src/video/`: video to notes, runs on the device, no server.
  - `keyboard.ts`: finds the keys from the 2-3 pattern of the black keys (88 keys: octave certain;
    fewer: guessed, the import page corrects it). The top edge is found straight up from the black
    keys, because hands hide their lower part. `scanY` = 3 key widths above: right over the keys
    landing notes flash and glow.
  - `tracker.ts`: follows whole bars through the row, the key comes from the bar's middle (exact
    to a pixel or two; widths change with glow). Background = most frequent colour per pixel.
    Dropped: faint things (dust, compared with long bars nearby), colourless things (the player's
    pause symbol, text), pieces inside a long bar, pictures without a keyboard (transitions, ads).
    Limits in seconds, not frames: browsers deliver other frame rates than a 30 fps test.
    Hands by hue only (two shades per hand are common), one colour = split at middle C.
  - `rhythm.ts`: `follow` for machine-made tutorials (notes within `EXACT`). Otherwise played music:
    `findPulse` (autocorrelation), `countAlong` (a grid that notes only nudge), rolled chords are
    grouped, short chords held to the next. One voice per hand, always 4/4.
  - `readVideo.ts`: a fast run for the keyboard (8×, then 2× if that found nothing), then a fresh
    video element at speed 1. **No seeking in the main path:** Chrome on Windows stops answering
    after the first seek in iPhone recordings (HEVC). Holes are only an extra, with a time budget;
    recordings have uneven frames, so small gaps are no holes.
- `utils/storage.ts`: everything in localStorage `klavier_pieces`, saved on every change, opened
  again on start. Failure shows a banner.
- `components/ui.tsx`: shared pieces, use them. Colors only through the tokens in `index.css`.
  Look: white surfaces on warm grey, piano black, one accent: the red felt of a piano (Apple Music
  feel). System font, sentence case, real note symbols for lengths (`NoteIcons.tsx`). `Choice` =
  segmented control with a sliding thumb. Navigation is one element: bottom bar, from `lg` a sidebar
  (upright iPads keep the width for the score). Pages cross-fade (`utils/smooth.ts`), tools slide
  up. Inputs get their size from the parent (the iOS rule `max(16px, 1em)` beats `text-*` on them).

## Checking in the browser
Sound and VexFlow are mocked in `App.test.tsx`, so tests don't prove them; check in real Chrome.
Own server (`npx vite --port 5191 --strictPort`; it listens on `localhost`, not 127.0.0.1), own
headless Chrome driven over the DevTools protocol (see Latein's CLAUDE.md), real mouse events, seed
`klavier_pieces` in localStorage, look at screenshots at 320, 390 and 1024 px. Wait for
`.vf-stavenote` before measuring. Stop the server afterwards (TaskStop leaves vite running).
Long heredocs in the Bash tool break: write scripts to the scratchpad.

## Checking the video reading
`scripts/makevideo.mjs` draws a tutorial with known notes as a real H.264 MP4 (`npm i --no-save
ffmpeg-static`), `scripts/video-check.mjs` uploads it through the page and compares note by note.
`scripts/recording-check.mjs` runs a real recording through the page with screenshots at all sizes.
`scripts/row-strip.mjs` stacks one pixel row of every frame into a picture: the best way to see
what the reading sees. Real recordings found everything generated ones didn't, always try one.
Don't record test videos with MediaRecorder: the file had a 13 s hole that looked like a bug.
The user's recording (Cinnamon Girl, portrait, HEVC, one bar colour, hands, smoke) lies in the
project folder; video files are gitignored and must stay out of this public repo.

## Open
- **Accuracy on real videos is unproven:** no original to compare with. For the Cinnamon Girl
  recording the browser finds about 690 notes, the same code on ffmpeg frames about 850; the
  reason is unknown (the first bars agree). Needs the user's ear, then more recordings.
- Not tried in Safari on iPhone/iPad at all. Reading takes about the length of the video.
- Cloud sync (same Supabase project, own table, SQL file the user runs).
- Getting the video in: the user records the tutorial and uploads the file (decided 2026-10-31).
  A YouTube link was discussed and declined: reading the running tab works only on the PC, a
  download server is against YouTube's terms and fragile.
- The reading always writes 4/4, sixteenths at the finest, one voice per hand. Missing: 3/4 and 6/8,
  triplets, held notes under a melody. Tidier note values for played music.
- Not yet: slurs, dynamics, pedal, repeat signs, PNG/PDF export (the old site had PNG), keyboard
  shortcuts on the PC, installing as an app (manifest, icons, service worker).
