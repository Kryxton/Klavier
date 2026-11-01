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
  **Changing a note keeps the time** (the user asked for it 2026-11-01): what stands behind stays in
  its place, because a hand that shifts loses its bars and the other hand. Shorter leaves a rest,
  longer takes from what follows, „Teilen“ = two notes in the time of one, „+“ inside a hand comes
  out of the note, deleting leaves a rest. Only a selected rest moves a hand: „+“ adds time,
  deleting closes the gap. The end of a hand grows and shrinks freely. Bars: `insertBars` (both
  hands move, a hand not copied gets rests), `replaceBars` (only the chosen hands), `removeBars`
  (one hand: rests). All go through `cutAt`, which splits notes across the cut.
- `utils/player.ts`: `Player`, no React or audio inside, tested with a fake clock. Timers only wake
  it up; notes are placed on the audio clock (`LOOKAHEAD`), so timing stays exact. `start(tick, countIn)`
  counts a bar in (the picture stands still, clicks go over the audio clock too) and jumps when it
  is already playing. `audio.ts` = Tone (Salamander samples, synth until they have arrived).
  **Samples play through `ToneBufferSource`, not `Tone.Sampler`:** the Sampler can't take back a
  release it was given, so held notes went on sounding after a pause. All notes of a run go through
  one bus and `silence` drops it, which also reaches notes only planned so far. `usePlayer.ts` = the
  React side.
- `utils/pedal.ts`: the pedal, for the ear only (`withPedal` changes what the player hears, the
  score, the falling notes and the highlights keep the written notes). `harmonies` finds the best
  way through the chords over the whole piece with a price on every change (`CHANGE`, safe from 1.5
  to 4 on the long piece, 6 swallows real changes). Only major, minor and dominant seventh: Am7
  would hold Am and C alike. Notes foreign to the harmony keep their length: 58 semitone clashes on
  the long piece instead of 260, and wrong notes from the reading don't ring on.
- `components/Sheet.tsx`: VexFlow. `bars` marks whole bars and `onBar` makes a tap mean a bar: a layer
  of boxes above the lines, worked out from `measure`/`arrange`, so it needs no drawn line. Each line
  has `overflow: visible`, low notes reach into the next one.
  Both hands go through one `Formatter`, so notes that sound together
  stand above each other. **Long pieces are drawn line by line:** every line is its own SVG, made
  when it nears the screen (`IntersectionObserver`), one to a frame, so 119 bars open in 90 ms instead
  of blocking 500 and an edit redraws only those. Bar widths are estimated (`roomOf`, on the wide
  side), because asking VexFlow means building every note first. Ties over line ends are drawn as
  half ties from each side. Selected and sounding notes switch a class on just those notes. A tap
  goes to the nearest note within `TAP_RADIUS`, because noteheads are small. `PrintSheet` is the
  score for paper: its own layout for A4 whatever the screen is, drawn whole and at once when it
  appears, because a browser prints what is there at that moment. It stays after printing (not
  every browser has taken its picture when it says it is done), any change of the piece retires it.
  `@page` margin 0 keeps the browser's date and address off, the sheets bring their own margins and
  stop short of A4, because iPads may not give the whole sheet.
- `components/Falling.tsx`: the falling notes, dark stage on the black lacquer of a piano, keys and
  bars in one canvas (no React per note, no drift between them). What doesn't move is drawn once
  into layers. Only notes in view are looked at (`soundsBetween`, also used by `usePlayer`). Slim bars
  (`WHITE_BAR`), keys never wider than `WIDEST_KEY`: wider screens show more keys, not fat ones.
  Colours are in the `@theme static` block: Tailwind drops tokens no class uses, and `addColorStop`
  throws on an empty string. Dragging moves the notes with the finger (down = onward), holds the
  music and picks it up on letting go; a tap does nothing.
- Pages: `Pieces` (home, list, backup file), `Import` (video to piece), `Write` = „Notenblatt“: the
  score; „Korrigieren“ or tapping a note brings the tools and keys (keys toggle the chord; the
  button with note symbols shows what „Teilen“ makes of the note, on the last note it copies),
  „Takte“ = `components/BarTools.tsx`: tap the first and last bar, choose the hands, copy to where
  it should begin or to the end; `Practice` (Noten, Fallend as the extra): a tapped bar plays from
  there, the loop button then two tapped bars set a loop (from Fallend it goes to the notes for
  that and comes back), keeps the screen on (`utils/wakeLock.ts`).
- Installed app: `public/sw.js` as in Life OS and Latein (starts from the cache, fetches the current
  version behind it, `utils/update.ts` offers a reload), plus a cache of its own for the piano samples,
  which lie on another address: without it the app would be silent offline. The icons are renders
  of `scripts/icon.svg`. Each installed app on iOS has its own storage: pieces in Safari don't show
  up there, they move by backup file.
- `src/video/`: video to notes, runs on the device, no server.
  - `keyboard.ts`: finds the keys from the 2-3 pattern of the black keys (88 keys: octave certain;
    fewer: guessed, the import page corrects it). The top edge is found straight up from the black
    keys, because hands hide their lower part. `scanY` = 3 key widths above: right over the keys
    landing notes flash and glow.
  - `tracker.ts`: follows whole bars through the row, the key comes from the bar's middle (exact
    to a pixel or two; widths change with glow). Background = most frequent colour per pixel.
    Two looks: the first learns how bright a solid bar is here (black and white keys apart), the
    second takes only pixels with `SOLID` of that, because sparks between two bars joined them into
    one wrong note somewhere between their keys (that was the "comically wrong" sound: 21 notes out
    of key, now 3). Many videos write the note's name into the bar: small gaps across a bar are
    closed (`LETTER_GAP`), gaps along it bridged (`bridged`: the lane never falls back to background,
    `BRIDGE_LEVEL` tells that apart from two notes in a row), the colour comes from the most
    colourful pixel, and dimmer pixels of a letter's inside join its bright strokes
    (`LETTER_WIDTH`): else a bar on E is read as the D sharp beside it. `secondShade`: some videos
    draw one hand's black keys as dark as sparks, but always alike (one colour, one brightness);
    sparks vary. Sparks must never pass that test.
    Dropped: faint things (dust, compared with long bars nearby), colourless things (the player's
    pause symbol, text), pieces inside a long bar, pictures without a keyboard (transitions, ads).
    What the first look saw and the second didn't goes to `doubtful`, for the sound to judge.
    Limits in seconds, not frames: browsers deliver other frame rates than a 30 fps test.
    Note times come from `passed`: when the lane crossed half of the bar's brightness, between two
    pictures. Where a limit is crossed depends on the bar, and that broke the count of a whole piece.
    Hands by hue only (two shades per hand are common).
  - `hands.ts`: one colour for both hands: `handLine`, a line that moves with the music between the
    two groups of notes, moves as little as it can and asks no hand to stretch too far. A fixed
    split at middle C is wrong for one note in five, because left-hand chords reach above it; the
    line for one in 25, measured against the hand colours of the second recording.
  - `rhythm.ts`: **machine-made pieces get one grid for all of it** (`findGrid`, `stepsOnGrid`):
    `gridFit` says how tightly note starts sit on a grid, independent of the picture rate (19 pictures
    a second still give exactly 130 BPM and no note off). Each note finds its step by itself; only
    many notes missing on one side in a row mean a new tempo. Never count on from note to note: a
    few milliseconds lost an eighth and every bar line after it. A chain of beats doesn't do
    for such pieces either: over running eighths it slides to the other eighth and pays little
    for it. **Played music** has `findPulse` (autocorrelation) and `trackBeats`, the best chain of
    beats through the whole piece, four sixteenths to each beat. A beat is tied to the one before
    it, not to one pulse for the piece: the pulse differed from run to run (62 to 70), and a chain
    tied to it pushed in or dropped beats. A second pass knows its place in the bar (`bassCurve`:
    new bass notes want to fall on the one): that took the same recording from 46 to 81 % of bass
    changes on the one, in all runs alike. `countNotes` is cached per list of notes, because the
    choices on the import page change only the writing. Rolled chords are grouped, short
    chords held to the next. One voice per hand. **Bars come from the bass**
    (`bassPlace`): the lowest note of a stretch one bar long keeps falling on the same place, the
    one. That tells 12 from 16 sixteenths by far (8.9 against 3.5 times chance, 12.3 against 4) and
    where bars start. 3/4 or 6/8 can't be told from the notes, so it goes by tempo, and the import
    page lets the user choose. The tempo may drift: Cinnamon Girl goes from 1.0 s to about 0.9 s
    per beat, so 64 BPM and 41 bars are right for it.
  - `sound.ts`: **the picture proposes, the sound decides.** `soundOf` decodes the file's sound
    (no sound or unreadable = null, then the picture stands alone). `judge` finds the delay between
    bar and sound (0.36 s here), learns what each key sounds like from where the picture says it is
    played, splits the sound into keys (non-negative factorisation, sparse templates, 4 to 7 s on
    a PC) and then: adds doubtful bars that clearly sound, moves silent notes outside the
    key to the neighbour that sounds, drops silent flickers. Notes that fit the key stay: overtones
    pose as neighbours and it had replaced right notes. Only keys with a learned sound count (bass rumble looks
    like rarely used keys). Solid bars it can't hear stay: quiet inner notes can't be heard out.
    Blind test on the real recording: 62 % of notes made wrong repaired or removed, 81 % of hidden
    notes found again, about 1 % of right notes changed; none of the 40 added notes is out of key,
    though many of the 670 doubtful ones are. Deliberately careful: it won't find every error.
  - `utils/recordings.ts`, `useRecording.ts`: the video's sound (16 bit, 11025 Hz, in IndexedDB by
    piece id, about 2.5 MB; backups don't carry it) and `Piece.source`: `moments` (tick against
    seconds, for the bars and the switch „Original“ under „Üben“, which plays the recording through
    `Player.setRecording` from the same place, with loop and speed) and `unsure` (events where
    picture and sound disagree, about 2 %: brown in correction mode, „Nächste“ and „Stimmt“).
  - `readVideo.ts`: a fast run for the keyboard (8×, then 2× if that found nothing), then a fresh
    video element at speed 1, slower if fewer than `ENOUGH` pictures a second arrive. **No seeking
    in the main path:** Chrome on Windows stops answering after the first seek in iPhone recordings
    (HEVC). Holes are only an extra, with a time budget; recordings have uneven frames, so small
    gaps are no holes. **Canvas readback decides how many pictures arrive:** `willReadFrequently`
    made each picture come down from the graphics card whole (30 ms a row, 11 pictures a second,
    every bar under 0.1 s lost: the old gap of 700 against 850 notes). Without it and reading only
    the two rows: 27 a second, 860 notes, and two runs agree on 849 of them.
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
`.vf-stavenote` before measuring. Stop the server afterwards (TaskStop leaves vite running; netstat
says ABHÖREN here, take `Get-NetTCPConnection` for the port).
Long heredocs in the Bash tool break: write scripts to the scratchpad.
**Sound can be measured:** patch `AudioNode.prototype.connect` before the page loads
(`Page.addScriptToEvaluateOnNewDocument`) to tap what reaches the destination with an analyser; that
also works on the live address. Compare with a note that should have stopped, not only with one
that plays. Polling every 200 ms misses a click, poll in the page.
**Printing:** `Page.printToPDF` with `preferCSSPageSize` makes the real PDF, pdf.js in the test Chrome
turns its pages into pictures (`pdftoppm` is missing here). Measure speed on `vite preview`, the
dev server is two to five times slower. Offline: stop the server and reload; for the samples start
Chrome with `--host-resolver-rules=MAP tonejs.github.io 127.0.0.1:9`.

## Checking the video reading
**Yardstick: `node scripts/messlatte.mjs`, 15 s, before every change to `src/video` goes out.** It runs
what real Chrome saw of the user's recordings (`.messung/<name>/`, gitignored, made with
`scripts/messlatte-aufnahme.mjs`) through the real reading and compares with `.messung/grenzen.json`.
It stopped three of my own "fixes". Judge by the written rhythm and by holes, never by the number of
notes: a fix for one recording once made another worse, and the note count even went up. Reading the
same notes one frame later or earlier decides whether a bar line holds.
`scripts/makevideo.mjs` draws a tutorial with known notes as a real H.264 MP4 (`npm i --no-save
ffmpeg-static`), `scripts/video-check.mjs` uploads it through the page and compares note by note.
`scripts/recording-check.mjs` runs a real recording through the page with screenshots at all sizes.
`scripts/row-strip.mjs` stacks one pixel row of every frame into a picture: the best way to see
what the reading sees. Compare with the sound (ffmpeg extracts it): notes out of key that the sound
denies pointed straight at the sparks. Stop the dev server before `npm test`: running both breaks
vitest with "Cannot read properties of undefined (reading 'config')". Real recordings found everything generated ones didn't, always try one.
Don't record test videos with MediaRecorder: the file had a 13 s hole that looked like a bug.
The user's recordings lie in the project folder; video files are gitignored and must stay out of
this public repo. Cinnamon Girl (portrait, one bar colour, hands, smoke, played freely) and a
landscape recording rotated by metadata (machine-exact, two hand colours, letters in the bars, dark
bars on some black keys, 130 BPM, 1600 notes). Any change to the tracker must be checked on both.
`.messung/` holds grossformat and three runs of the first recording (cinnamon, cinnamon2, cinnamon3):
results differ from run to run, so a fix has to hold on all of them. `--jedes=2` or `=3` drops
pictures, as a slow device does, and `--liste` names the holes. On the second recording the note
names written in the bars show what is true: `ffmpeg` a crop of the bar and look.
**To find missing notes without an original,** read a second row higher up: the same bars pass it
later, so what only one row sees is a mistake (the second recording: 1590 of 1612 agree). Rows saved
from real Chrome replay the tracker in seconds instead of minutes.
**Speed:** check with a long piece and `Emulation.setCPUThrottlingRate` 4; a PC hides everything.

## Open
- **For played music note lengths and some starts are still guesses:** chords falling apart into
  sixteenths, rolled octaves. The sound isn't used for timing yet (its long look is too blurred).
  Bars and pitches are checked on two recordings only. Needs the user's ear, then more recordings.
- Not tried in Safari on iPhone/iPad at all: neither the frame rate nor `decodeAudioData` on these
  files. Reading takes about the length of the video, plus 5 to 30 s for the sound. Only checked
  with a throttled CPU in Chrome: falling notes 60 fps, score while playing 47.
- Cloud sync (same Supabase project, own table, SQL file the user runs).
- Getting the video in: the user records the tutorial and uploads the file (decided 2026-10-31).
  A YouTube link was discussed and declined: reading the running tab works only on the PC, a
  download server is against YouTube's terms and fragile.
- The reading writes sixteenths at the finest and one voice per hand. Missing: triplets, held notes
  under a melody. Tidier note values for played music.
- **What is planned next, in this order (the user asked for all of it):** 1. two voices per hand
  (`hands` has one list per hand; 60 of 218 long notes in Cinnamon Girl sound on while the hand plays
  on and get cut; touches types, score, Sheet, edit, rhythm, so last and alone). 2. Decoding with
  WebCodecs instead of playing (every picture, same result each run; needs an MP4 demuxer, HEVC is
  reported as supported in Chrome, Safari unknown). 3. Tidier note values in played music.
- The switch „Original“, the brown notes, cancelling and the live site were checked up to commit
  903de64 on the branch `vergleich`; the beat chain with its place in the bar came after that and
  is checked by the yardstick and tests, not yet with both recordings on the live address.
- At 11 pictures a second the tempo reading of machine-made pieces still fails (19 are fine).
  `ENOUGH` slows the video down well before that.
- Not yet: slurs, dynamics, repeat signs, keyboard shortcuts on the PC, a pedal written in the score.
