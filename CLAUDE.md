# Klavier – notes for Claude

Piano site for the same user as Life OS (`C:\Users\tizia\Dev\lifeOS\lifeOSpublish`, read its
CLAUDE.md for who the user is and how they want to work: German replies, branch per feature, tests +
build green, mobile first 320–390 px, screenshots for visual choices). **The UI is German.**
Started 2026-10-30.

## Goal
The user plays by typing out YouTube tutorials with falling notes by hand, because those versions
are easier and sound nicer. No piano connected so far, only the screen. So the site is: write a
piece down from such a video, then practise it (falling notes like the video, or the score; slower,
one hand, bars in a loop). Only for the user (decided 2026-10-30), with cloud sync still to come.

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
- Pages: `Pieces` (list, backup file), `Write` (tap keys → Eintragen; „Sofort“ writes every tap; a
  tapped note can be changed: keys toggle the chord, „+“ puts a rest behind it to fill),
  `Practice` (Fallend / Noten).
- `utils/storage.ts`: everything in localStorage `klavier_pieces`, saved on every change, opened
  again on start. Failure shows a banner.
- `components/ui.tsx`: shared pieces, use them. Colors only through the tokens in `index.css`.

## Checking in the browser
Sound and VexFlow are mocked in `App.test.tsx`, so tests don't prove them; check in real Chrome.
Own server (`npx vite --port 5191 --strictPort`; it listens on `localhost`, not 127.0.0.1), own
headless Chrome driven over the DevTools protocol (see Latein's CLAUDE.md), real mouse events, seed
`klavier_pieces` in localStorage, look at screenshots at 320, 390 and 1024 px. Wait for
`.vf-stavenote` before measuring. Stop the server afterwards (TaskStop leaves vite running).
Long heredocs in the Bash tool break: write scripts to the scratchpad.

## Open
- Vercel, see Hosting. Then cloud sync (same Supabase project, own table, SQL file the user runs).
- Next for typing out videos: the YouTube video inside the Write page (slow, loop, step). Reading
  the notes out of a video automatically can't work on an embedded video (the browser doesn't give
  its pixels to the page).
- Not yet: triplets, slurs, dynamics, pedal, repeat signs, a second voice per hand, PNG/PDF export
  (the old site had PNG), keyboard shortcuts on the PC, installing as an app (manifest, icons,
  service worker), a sign for the tied note on a page break.
