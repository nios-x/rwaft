# rwaft films

Three films, made entirely in HTML, CSS and JavaScript (plus WebGL for the trailer) and rendered frame by frame by the same engine and renderer.

| Film | What | Entry | Output |
|---|---|---|---|
| **Keynote trailer** | 19.2 s, 1920 × 1080 world, rendered at 4K. A monochrome teaser cut beat-for-beat to its music track: a dark-studio cold open, the mark assembling on three hits, the mark as a raymarched 3D object in billowing smoke, black-glass product close-ups, keynote text cards, a twisting-ribbon "rwaft AI" shot, a ring of built sites, glossy black lettering and the end mark over chrome arcs. | `trailer.html`, `src/trailer/` | `out/rwaft-trailer-4k.mp4`, `out/rwaft-trailer-1080p.mp4` |
| **Product overview** | 29 s, 1920 × 1080. The real rwaft UI in its dark theme, in a browser card on a white page, with one caption per beat: describe → real build → self-repair → live link → share → change by asking → React repo → pricing → rwaft.live → end card. | `overview.html`, `src/overview/` | `out/rwaft-overview.mp4` |
| **Launch loop** | 16 s, 1440 × 1440, dark, seamless loop. One morphing object: mark → deploy card → build panel → live URL → preview → builds → mark. | `index.html`, `src/composition/` | `out/rwaft-launch.mp4` |

Add `--film overview` to any render or stills command for the overview (the launch loop is the default):

```
npm run preview                                         # then open /overview.html or /index.html
node scripts/stills.mjs --film overview                 # out/overview-stills/beat-01.png … + contact.png
node scripts/render.mjs --film overview --preset preview
node scripts/render.mjs --film overview --preset final  # out/rwaft-overview.mp4, UI sounds only
npm run overview:music                                  # out/overview-music.wav, the original score
node scripts/render.mjs --film overview --preset final --music out/overview-music.wav --music-gain 0.89
```

The last line is how `out/rwaft-overview.mp4` is made for release (`npm run overview:render` runs both): the score under
the UI sounds, about −14 LUFS.

The overview's timing lives in [src/overview/beatmap.js](src/overview/beatmap.js) (captions, scenes, sound cues) and
its copy in [src/overview/content.js](src/overview/content.js): chat replies are rwaft's own plain-words notes
(`lib/stages.ts`), log lines are what the worker emits, pricing is the API's defaults (`lib/pricing.ts`). The app UI is
rebuilt with rwaft's dark-theme tokens and class structure ([src/styles/overview.css](src/styles/overview.css)), and
the camera zooms inside a fixed card, the way the reference product video frames its shots.

## Keynote trailer

Timing is measured from the track, not guessed: onset analysis gives 80.21 BPM with beat k at 0.279 + 0.748·k s (every
strong onset within ±2 ms), a quiet intro, near silence at 2.1–2.5 s, three pickup hits at 2.508 / 2.772 / 3.043 s and a fill
at 12.694 s. Every cut in [src/trailer/beatmap.js](src/trailer/beatmap.js) sits on one of those. Shots live in
[src/trailer/shots.js](src/trailer/shots.js); WebGL programs (dark studio, smoke, the 3D mark, black-glass lettering,
chrome arcs, corner gradient, grain) in [src/trailer/gl.js](src/trailer/gl.js). Copy follows FEATURES.md and the
product's own replies; no invented numbers.

- **Look.** Black, zinc and white, with violet only in the mark's endpoint and status colours where they mean something.
  Panels are black glass: a gradient reflection that drifts across them, a lit top edge, faint matte grain. Text cards
  are bold Geist filled white to zinc. The one burst of colour is "rwaft AI": a twisting ribbon (after VengeanceUI's
  Twisting Ribbon) over warm corner light.
- **Smoke** ([src/trailer/smoke.js](src/trailer/smoke.js)) is particles: each puff is born at an emitter, flies out,
  slows, rises and swells with age; the shader sums them as soft blobs eroded by noise into wisps and lights them toward
  the light. So it billows and spreads instead of sliding, and every frame is still a pure function of t.
- **Transitions** ([src/trailer/transitions.js](src/trailer/transitions.js)). Each cut has a type in `CUTS`: push (zoom
  through, with a bloom), whip, blur dissolve, smoke surge, flash or light sweep. Cuts stay on the beat; transitions shape
  the frames either side by moving the camera layer, so canvases and DOM move together.
- **End.** A ring of built sites (a native, time-driven take on VengeanceUI's Circular Gallery) around the 3D mark, the
  name in glossy black, and the mark over glossy black chrome arcs (a port of Louis Studios' Chrome Arcs shader).

The demo sites are illustrative builds in [site/](site/): KAIZEN (the film's prompt) plus a café menu, a habit tracker
and an RSVP page (the home screen's three example prompts), with Unsplash photos via picsum.photos (the source rwaft's
page writer falls back to). `node scripts/site.mjs` renders them: the KAIZEN home screen at 2.75× for 4K close-ups, the
same screen with a violet accent for the "change it by asking" shot, four KAIZEN pages for the plan list, and ten
thumbnails for the ring. It needs the network once, for the photos.

```
node scripts/site.mjs                                    # assets/kaizen-*.jpg and assets/gallery-*.jpg
npm run preview                                          # then open /trailer.html
node scripts/stills.mjs --film trailer                   # one still per shot + contact sheet → out/trailer-stills/
node scripts/render.mjs --film trailer --preset preview --music <track>
node scripts/render.mjs --film trailer --preset final --scale 2 --crf 14 --music <track> --music-gain 1 --keep --out out/rwaft-trailer-4k.mp4
node scripts/render.mjs --film trailer --preset final --encode-only --scale 1 --crf 16 --music <track> --music-gain 1 --out out/rwaft-trailer-1080p.mp4
```

With `--film trailer`, `--music` is the whole sound track (no UI sounds), faded over the last 0.22 s. The 1080p copy is
encoded from the kept 4K segments, so it is supersampled. WebGL needs a GPU-backed Chromium; with no Playwright build
installed, point `CHROMIUM_PATH` at an installed Chrome or Edge.

## Launch loop

A 16-second, 1440 × 1440 launch film for rwaft, made entirely in HTML, CSS and JavaScript and rendered frame by frame.
A GitHub repo goes in, the real build streams, the build's endpoint becomes a live `*.rwaft.live` link, the link opens the site,
and the site folds back into "Your builds", whose three rows condense into the rwaft mark's three log lines and live dot.
It loops seamlessly (frame 960 = frame 0).

- **Beat map and transition plan:** [BEATMAP.md](BEATMAP.md)
- **Timing source of truth:** [src/composition/beatmap.js](src/composition/beatmap.js)

## Commands

All from this folder, after `npm install` (installs `playwright-core` and the fonts; no browser download, see below).

| What | Command | Output |
|---|---|---|
| Browser preview with timeline | `npm run preview` → open http://127.0.0.1:4173/overview.html or /index.html | – |
| One still per beat + contact sheet | `npm run stills` | `out/stills/beat-01.png` … `beat-32.png`, `contact.png` |
| Stills at specific times / frames | `node scripts/stills.mjs --at 4.2,10.3` · `--frames 0,600` | `out/stills/` |
| Quick preview render | `npm run render:preview` | `out/rwaft-launch-preview.mp4` (720², 30 fps, ~30 s) |
| Final render | `npm run render` | `out/rwaft-launch.mp4` (1440², 60 fps, adaptive 1–16-sample motion blur) |
| No motion blur (debug motion) | `node scripts/render.mjs --preset sharp` | `out/rwaft-launch-sharp.mp4` |
| HUD burned in | `node scripts/render.mjs --preset debug` | `out/rwaft-launch-debug.mp4` |
| Sound effects only | `npm run sfx` (`--metronome` adds a beat click) | `out/sfx.wav` |

Render options: `--fps 60 --samples 16 --max-step 2.5 --uniform --shutter 0.5 --scale 1 --workers 5 --crf 14 --from 4 --to 10
--loops 3 --music track.wav --music-gain 0.85 --no-audio --metronome --format square|landscape|portrait --out file.mp4 --keep`.
`--scale 2` supersamples; `--loops 3` writes three seamless loops for social posts.

### Preview controls

Space play/pause · ←/→ one frame · Shift+←/→ one beat · `[` `]` previous/next scene · Home to start ·
D HUD · G guides (safe area, centre, primary-object bounds) · L loop. Type `7.25` or `b16` in *jump to* and press Enter.
URL parameters: `?t=10.2` opens at a time, `?debug=1` shows the HUD, `?guides=1` the guides, `?format=landscape` another frame.

The HUD shows timestamp, frame, beat number, bar and beat, what that beat is for, active scene, camera scale and
centre, cursor world and screen coordinates, and the primary object's size and radius.

## How it works

**Deterministic.** `seek(t)` in [src/composition/scene.js](src/composition/scene.js) computes every property from `t` alone and
writes it to a DOM built once. No CSS transitions, timers or previous-frame state drive anything; the preview's clock only
supplies a time. Seeking the same `t` always produces the same frame, which is what lets the renderer split the film across
workers and sample sub-frame times for motion blur.

**Motion system** ([src/engine](src/engine)):

| File | Provides |
|---|---|
| `spring.js` | Closed-form damped springs (`response`, damping ratio), `springAt`, superposed retargeting `track`, per-edge `rectTrack`. Every response is windowed to land exactly, so loops close. |
| `math.js` | Clamped interpolation (`progress`, `remap`, `stops`), smoothstep, easings incl. minimum-jerk, linear-light colour mixing, seeded randomness. |
| `transitions.js` | `enter` / `exit` / `presence` / `swap` with independent in and out clocks, blur and scale transitions. |
| `cursor.js` | Human pointer: bowed Bézier paths, skewed minimum-jerk timing, overshoot-and-correct, click press curves. |
| `camera.js` | Framing in log-scale space, leading on expansions and trailing on contractions, loop-periodic drift. |
| `count.js` | Number counting, the `m:ss` elapsed format, log timestamps. |
| `timeline.js` | The beat grid: `beat(n)`, `beatAt(t)`, bar and beat position, loop wrapping. |

**One object.** The shell is a single rectangle whose four edges spring independently (leading edge fast, trailing edge
heavier), so stretches feel liquid. Continuity is carried by objects that change role rather than being replaced:
URL field → repo chip; Deploy button → Building/Live pill; timeline → its last node → success disc; endpoint chip → URL →
address bar → newest build row → the mark's first line; build rows → the mark's lines; Live dots → the violet endpoint.
Where a thread must stay put, it holds still in world space and the container and camera reframe around it.

**Rendering** ([scripts/render.mjs](scripts/render.mjs)). Workers each open the film in their own Chromium and render a contiguous
run of frames, piping PNGs into their own FFmpeg. For motion blur each frame is drawn at several times spread over a
180° shutter and FFmpeg's `tmix` averages them. Sampling is adaptive: before each frame the page reports how far anything
visible moves on screen during the shutter (`__film.motion`), and the frame gets the fewest distinct samples (1, 2, 4, 8
or 16) that keep neighbouring samples within `--max-step` px. Fast moves become a smooth smear instead of four discrete
copies, and still frames cost a single capture. Segments are lossless FFV1; they are then concatenated and encoded once
to H.264 (BT.709, `aq-mode=3`, low dead zones, no fast P-skip, so dark gradients and faint blur tails survive) with the
sound track. `--keep` keeps the lossless segments and `--encode-only` re-encodes them in seconds, for trying encoder
settings without re-rendering. LCD text is disabled so glyphs carry no colour fringes into chroma subsampling.

**Frame-exact capture.** Chromium is launched with `--run-all-compositor-stages-before-draw` and `--disable-partial-raster`.
Without them, a page that has already drawn many frames can return a screenshot in which some 256 px raster tiles still
hold the previous frame; averaged motion-blur samples turn those into faint ghost lines. With them, a frame rendered after
a thousand others is bit-identical to the same frame rendered in a fresh page (verified: PSNR = ∞).

**Chromium.** [scripts/lib/browser.mjs](scripts/lib/browser.mjs) uses `CHROMIUM_PATH`, else the build playwright-core expects,
else the newest Chromium already in the Playwright cache, else an installed Chrome. If none exists:
`npx playwright-core install chromium-headless-shell`.

**Audio.** `scripts/sfx.mjs` synthesises subtle UI sounds (clicks, keys, taps, ticks, a success chime, air) from the beat
map's `CUES`, peaking near −8 dBFS. Add music with `--music`; its first downbeat should land at t = 0. To retime against a
track, change `bpm` or `offset` in `beatmap.js`; everything is placed with `B(n)`.

**Score (overview).** [scripts/music.mjs](scripts/music.mjs) composes an original 120 BPM, D-minor beat for the overview, synthesised
like the UI sounds and placed from its beat map: keys alone under the opening cards, the drop as the app window lands
(`T.home`), drums out while the build repairs itself (`T.repair`), an arpeggio once the site is live, a last hit on the
tagline (`T.tagline`) and a held chord under the end card. It is mastered to about −14 LUFS with a look-ahead limiter; the
renderer adds a safety limiter after mixing it with the UI sounds. Retiming the film moves the music with it; the script
refuses to run if its bars no longer end on the tagline.

**Other formats.** Layout is in world pixels and framed by the camera, so `?format=landscape` (1920 × 1080) and
`?format=portrait` (1080 × 1920) already work; tune `fill` per format in [src/composition/config.js](src/composition/config.js).

## What is real

UI, copy, stage names, log messages, status colours, icons, fonts and the `<id>.rwaft.live` URL pattern come from the
product (see the table in BEATMAP.md). The repository `nios-x/tiny-habits`, deployment id `k7m2x9qa`, timings, package
counts and the Tiny Habits site are illustrative. The "Ready" chip and the build-timeline tooltip are storytelling elements:
the product validates on submit and shows stages as a list.
