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
Design (user, 2026-10-30): luxury palette, modern and clean, no generic website.

## Hosting
- The rebuild was merged into `main` on 2026-10-30; the user said the old site and its pieces don't
  need keeping. Branch `alter-editor` = the old site, unchanged (don't delete).
- GitHub Pages (`kryxton.github.io/Klavier`) still serves the root of `main`, which is unbuilt source
  now, so it no longer shows the app. Real hosting = Vercel like Life OS: the user connects the repo
  (`vercel.json` is ready; its content security policy allows the samples on tonejs.github.io), then
  push to `main` = live, and Pages can be switched off.

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
- `src/video/`: video to notes, runs on the device, no server. `keyboard.ts` finds the keys in a
  picture from the 2-3 pattern of the black keys (88 keys: octave certain; fewer: guessed, the
  import page offers a correction). `tracker.ts` reads one pixel row just above the keys: a bar
  passing it = a note. Background = most frequent colour per place, not the median (held keys).
  A black key needs a bar on both sides of its middle, because white bars reach into it. Hands by
  hue only (tutorials use two shades per hand), one colour = split at middle C. `rhythm.ts`: tempo
  (fits a sixteenth grid, plain note values, near 100), bar 1, key signature, one voice per hand.
  `readVideo.ts`: plays at speed 1 (faster loses exact timing, 140 BPM was then read as 70), then
  reads every hole picture by picture; never waits on `ended` or `seeked` alone (both hung once).
- `utils/storage.ts`: everything in localStorage `klavier_pieces`, saved on every change, opened
  again on start. Failure shows a banner.
- `components/ui.tsx`: shared pieces, use them. Colors only through the tokens in `index.css`.
  Look: lacquer black, ivory paper, champagne accent; Instrument Serif + Hanken Grotesk (bundled);
  sharp corners, hairlines, no gradients, no filled chips. Inputs get their size from the parent
  (the iOS rule `max(16px, 1em)` in index.css beats `text-*` on the input itself).

## Checking in the browser
Sound and VexFlow are mocked in `App.test.tsx`, so tests don't prove them; check in real Chrome.
Own server (`npx vite --port 5191 --strictPort`; it listens on `localhost`, not 127.0.0.1), own
headless Chrome driven over the DevTools protocol (see Latein's CLAUDE.md), real mouse events, seed
`klavier_pieces` in localStorage, look at screenshots at 320, 390 and 1024 px. Wait for
`.vf-stavenote` before measuring. Stop the server afterwards (TaskStop leaves vite running).
Long heredocs in the Bash tool break: write scripts to the scratchpad.

## Checking the video reading
`scripts/makevideo.mjs` draws a tutorial with known notes as a real H.264 MP4 (`npm i --no-save
ffmpeg-static`), `scripts/video-check.mjs` uploads it through the page in headless Chrome and
compares the score note by note. Don't record test videos with MediaRecorder: in headless Chrome
the file had a 13 s hole, which looked exactly like a bug in the reading.

## Open
- **Never tried with a real YouTube tutorial or on iPhone/iPad/Safari.** All tests so far use
  generated videos in Chrome. First thing to do when the user sends a recording.
- Vercel, see Hosting. Then cloud sync (same Supabase project, own table, SQL file the user runs).
- Getting the video in: file upload only so far, a screen recording is the way from YouTube. On the
  PC reading the running tab (`getDisplayMedia`) would save that step. Pasting a YouTube link is
  not planned: needs a server that downloads from YouTube, against their terms and fragile.
- The reading always writes 4/4, sixteenths at the finest, one voice per hand. Missing: 3/4 and 6/8,
  triplets, rubato (shows „keinen gleichmäßigen Takt“), held notes under a melody.
- Not yet: slurs, dynamics, pedal, repeat signs, PNG/PDF export (the old site had PNG), keyboard
  shortcuts on the PC, installing as an app (manifest, icons, service worker).
