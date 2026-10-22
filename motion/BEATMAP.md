# rwaft launch film: beat map and transition plan

120 BPM, 4/4. One beat = 0.5 s, one bar = 2 s. 32 beats = 8 bars = **16.0 s**, looping.
Beat `n` starts at `t = (n − 1) × 0.5`. Downbeats (bar starts) are beats 1, 5, 9, 13, 17, 21, 25, 29, and every
state change of the primary object begins on one of them or on the half-bar (beats 3, 7, 11, …).

The timings here are mirrored in code by `src/composition/beatmap.js`, which is the single source of truth
the composition, the debug timeline, the still renderer and the sound-effects track all read.

## Story in one line

The rwaft mark opens into a deploy box, a GitHub repo goes in, the real build streams, the build's
endpoint becomes a live `*.rwaft.live` link, the link opens the site, the site folds into "Your builds",
and the three builds condense back into the mark's three log lines and its live endpoint dot.

That last move is the brand argument ("three log lines resolving into one live endpoint") played literally.

## What is real and what is illustrative

| Element | Source |
|---|---|
| Mark, wordmark, palette, Geist / Geist Mono / Bricolage Grotesque | `frontend/app/_components/Icons.tsx`, `globals.css`, `DESIGN.md`, share card |
| Mode switch "Describe an app / GitHub repo", placeholder "Paste a public GitHub repository URL…" | `PromptBox.tsx` |
| Stage labels Setting up → Installing → Building → Publishing → Live | `lib/stages.ts` (deploy route) |
| Log lines (`Fetching repository files...`, `Installing dependencies…`, `Uploading 9 build artifacts...`, `Deployment <id> is live`) | `build-services` `jobLog` calls; npm and Vite output is streamed verbatim (`run.ts`) |
| Step dots: dashed pending ring, orange live ring, filled ink done disc | `globals.css` `.steps-dot` |
| Status pill Building / Live, address bar with state dot, Preview / Log tabs with line count, copy → check | `Workspace.tsx` |
| "Your site is live. Share the link with anyone." | `Workspace.tsx` |
| URL `https://<8-char id>.rwaft.live/` | `render.yaml` (`DEPLOYMENT_DOMAIN`), `genId()` |
| "Your builds" rows titled `owner/repo`, "Repo · just now" | `Home.tsx`, `buildTitle()` |
| Repo `nios-x/tiny-habits`, id `k7m2x9qa`, package counts, timings, the Tiny Habits site | **Illustrative** examples |
| "Ready" chip after paste, build-timeline tooltip | **Storytelling** elements; the product validates on submit and shows stages as a list |

## Beat map

| Beat | Time | Bar.beat | What happens | Cue |
|---:|---:|:---:|---|---|
| 1 | 0.00 | 1.1 | **Loop frame.** The rwaft mark at rest, camera tight. The violet endpoint dot pings once. | ping |
| 2 | 0.50 | 1.2 | The dark shell slides out from behind the mark, right edge leading; "rwaft" wipes in → floating pill. | whoosh |
| 3 | 1.00 | 1.3 | Pill stretches into the deploy card, lockup glides to the top-left, camera pulls back. | swell |
| 4 | 1.50 | 1.4 | Card drops open (bottom edge lags). Heading, mode switch, field, disabled Deploy cascade in. | – |
| 5 | 2.00 | 2.1 | Cursor enters from the lower right on a curve toward the field. | – |
| 6 | 2.50 | 2.2 | Click into the field: violet focus ring, halo, caret. | click |
| 7 | 3.00 | 2.3 | ⌘V: `github.com/nios-x/tiny-habits` pastes in with a left-to-right reveal. | keys |
| 8 | 3.50 | 2.4 | Validated: "Ready" chip, Deploy enables, cursor heads for Deploy. | tick |
| 9 | 4.00 | 3.1 | **Click Deploy.** Shell stretches into the build panel. The field becomes the repo chip, the Deploy pill becomes the orange "Building" pill. | click, whoosh |
| 10 | 4.50 | 3.2 | Stage timeline draws in toward a dim endpoint chip holding the reserved URL. `Starting deploy job`, `Fetching repository files...` | – |
| 11 | 5.00 | 3.3 | `Fetched 48 source files` ✓. Setting up done, Installing live. `Installing dependencies…` | tick |
| 12 | 5.50 | 3.4 | Cursor glides up toward the timeline. Elapsed time counts. | – |
| 13 | 6.00 | 4.1 | `added 214 packages in 17s` | – |
| 14 | 6.50 | 4.2 | `Dependencies installed` ✓. Installing done, Building live. | tick |
| 15 | 7.00 | 4.3 | `Building project...`, `vite v6.3.5 building for production...` | – |
| 16 | 7.50 | 4.4 | Cursor hovers the Installing node: tooltip **Installing · 214 packages · 17.2 s**. | tap |
| 17 | 8.00 | 5.1 | `✓ 1284 modules transformed.`, bundle-size line. | – |
| 18 | 8.50 | 5.2 | Tooltip retracts, cursor drifts down over the log. `✓ built in 3.42s` | – |
| 19 | 9.00 | 5.3 | `Build succeeded` ✓. Building done, Publishing live. `Uploading 9 build artifacts...` | tick |
| 20 | 9.50 | 5.4 | `Uploaded 9 artifacts`, `Deployment k7m2x9qa is live`. Endpoint turns green, pill becomes Live. | success |
| 21 | 10.00 | 6.1 | **The signature morph.** Log lines fold away, the timeline retracts into its last node, the panel compresses into the success card, the last log line rises to become the headline, the endpoint chip drops to become the URL. | whoosh |
| 22 | 10.50 | 6.2 | The node lands as the green check disc and the tick draws. "Your site is live." / "Share the link with anyone.", then Copy, Open and "Built from nios-x/tiny-habits in 0:24". | tick |
| 23 | 11.00 | 6.3 | Hold on the finished card. Cursor sets off toward the URL. | – |
| 24 | 11.50 | 6.4 | Cursor hovers the live URL: link underline. | – |
| 25 | 12.00 | 7.1 | **Click the URL.** The card expands into the preview panel, the URL rises into the address bar, tabs and icons arrive. | click, whoosh |
| 26 | 12.50 | 7.2 | The deployed site renders: nav, serif headline, streak grid in a diagonal wave. | – |
| 27 | 13.00 | 7.3 | Cursor travels to the copy button. | – |
| 28 | 13.50 | 7.4 | **Click copy.** Icon becomes a check, "Link copied" drops in. | click, tick |
| 29 | 14.00 | 8.1 | Preview folds up into "Your builds"; the address bar becomes the newest row. | whoosh |
| 30 | 14.50 | 8.2 | Older builds settle beneath it. Cursor returns home and fades. | – |
| 31 | 15.00 | 8.3 | Rows thin into the mark's three log lines; their Live dots converge into one endpoint. | whoosh |
| 32 | 15.50 | 8.4 | The white tile blooms behind the lines, the endpoint turns violet, camera pushes in → identical to beat 1 at 16.00. | ping |

## Transitions between adjacent states

Each row names the object that carries continuity, so no state is a slide replacing the previous one.

1. **Mark → pill (beat 2).** The shell starts exactly behind the tile, invisible. It inflates by 10 px on
   three sides and its right edge runs out ahead (lead spring 0.42 s), the left edge follows (0.55 s). The
   wordmark reveals through a mask tied to the right edge, so the text is uncovered, not faded.
2. **Pill → deploy card (beats 3–4).** Horizontal first: left and right edges spring out with a 60 ms
   offset. Vertical second: the top edge moves up quickly and the bottom edge lags (0.62 s, ζ 0.86). The
   lockup is its own spring target that shrinks from 25 px to 19 px and parks top-left.
3. **Card idle → focused → filled → ready (beats 6–8).** In-place state changes on one field: border
   colour, 4 px halo, caret, masked paste reveal, chip pop (ζ 0.72), button opacity 0.35 → 1.
4. **Deploy card → build panel (beat 9).** The field morphs into the header's repo chip (box springs to its
   new rect; "github.com/" collapses out). The Deploy pill morphs into the Building pill (fill colour and
   label swap mid-flight). Everything else in the card exits in 120 ms with 3 px blur. The panel's log area is
   revealed by the bottom edge, not faded in.
5. **Build progress (beats 10–20).** No layout moves. The timeline fill advances per stage with eased
   bursts, step dots change state, log lines enter one by one (opacity, 4 px rise, 2 px blur, 220 ms).
6. **Build panel → success card (beat 21).** The log folds out top-down (10 ms stagger) while the bottom
   edge rises, so the panel visibly compresses. The last stage node lifts off the track and the other nodes
   chase it and merge into it, turning white to green as it lands as the check disc. The card is built
   around the endpoint's line, so the endpoint chip grows in place into the URL field and does not cross
   the disc's path. The headline blurs in where the header was; the header exits in 120 ms.
7. **Success card → preview (beat 25).** The URL field rises and narrows into the address bar. The top
   edge leads up, the bottom edge lags further down, so the body opens like a sheet. Tabs slide in from the
   left, the reload icon inserts between copy and open. The site renders inside once the body is tall enough.
8. **Preview → Your builds (beat 29).** The bottom edge rises first (fold), the site scales to 0.96 and
   fades. The address bar springs to the first row's rect and restyles, then hands off to the row box at an
   identical frame. Rows 2–3 rise in with a 70 ms stagger.
9. **Your builds → mark (beats 31–32).** Row text blurs out. Each row box springs to one of the mark's line
   rects: height first on a fast spring (0.26 s), then length (0.38 s), rows staggered 25 ms. A row turns
   log-line grey only as it gets thin, so it never reads as a grey slab, and turns ink once the tile is
   behind it. The three Live dots converge on the endpoint and turn violet. The shell condenses to the tile, the white tile blooms behind the lines, the
   shell fades under it. Every spring is windowed to land exactly by 16.00 s, so frame 960 equals frame 0
   (measured: 90 dB PSNR between t = 0 and t = 15.9999).

## Camera

| State | Object (world px) | Scale |
|---|---|---:|
| Mark | 36 × 36 | 3.8 |
| Pill | ~146 × 56 | 3.2 |
| Deploy card | 640 × 320 | 1.8 |
| Build panel | 680 × 546 | 1.74 |
| Success card | 600 × 232 | 1.97 |
| Preview | 820 × 780 | 1.45 |
| Your builds | 560 × 288 | 2.1 |

When the object grows, the camera starts pulling back 80 ms *before* it on a 0.55 s spring, so nothing outruns
the frame. When it shrinks, the camera follows 40 ms *after* on a softer 0.95 s spring, so the object visibly leads.
The final push-in uses a 0.62 s spring so it lands before 16.00 s. A loop-periodic drift (periods 16 s and 8 s,
under 1.5 %) keeps the frame alive without breaking the loop.

## Sound

Cues above are generated procedurally by `scripts/sfx.mjs` from `beatmap.js`, mixed at −20 dBFS-ish peaks
so music sits on top. Pass `--music track.wav` to the renderer to lay a 120 BPM track underneath; beat 1 of
the track should land on t = 0.
