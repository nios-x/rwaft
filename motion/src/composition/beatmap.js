import { beatGrid } from "../engine/timeline.js"

/**
 * The beat map, in code. BEATMAP.md describes the same table in prose.
 * Every timed thing in the composition is placed relative to these beats,
 * and the debug timeline, still renderer and sound track read them too.
 */

export const grid = beatGrid({ bpm: 120, beats: 32 })
export const B = grid.beat
export const DURATION = grid.duration

/** Named moments. Fractions are of a beat: B(9, 0.5) is the "and" of beat 9. */
export const T = {
	ping: B(1),
	pill: B(2),
	widen: B(3),
	open: B(4),
	cursorIn: B(5),
	focus: B(6),
	paste: B(7),
	ready: B(8),
	deploy: B(9),
	timeline: B(10),
	fetched: B(11),
	inspectMove: B(12),
	added: B(13),
	installed: B(14),
	building: B(15),
	hover: B(16),
	modules: B(17),
	unhover: B(18),
	built: B(19),
	live: B(20),
	morph: B(21),
	landed: B(22),
	actions: B(23),
	urlHover: B(24),
	open2: B(25),
	render: B(26),
	toCopy: B(27),
	copy: B(28),
	fold: B(29),
	settle: B(30),
	collapse: B(31),
	resolve: B(32),
	end: DURATION,
}

/** One row per beat: what the viewer should notice. Shown in the debug HUD and timeline. */
export const BEATS = [
	"Loop frame · mark at rest, endpoint pings",
	"Shell slides out · wordmark",
	"Pill widens into the deploy card",
	"Card drops open · content cascades",
	"Cursor enters",
	"Click field · focus",
	"⌘V · repository URL",
	"Validated · Deploy enables",
	"Deploy · panel stretches",
	"Timeline draws · fetching",
	"Fetched · installing",
	"Cursor to timeline",
	"added 214 packages",
	"Installed · building",
	"vite building",
	"Hover node · tooltip",
	"Modules transformed",
	"Tooltip retracts · built",
	"Build succeeded · publishing",
	"Live · endpoint turns green",
	"Signature morph · log → card",
	"Check lands · Your site is live · actions",
	"Card holds · cursor heads for the URL",
	"Hover live URL",
	"Click URL · preview opens",
	"Site renders",
	"Cursor to copy",
	"Copy · Link copied",
	"Fold into Your builds",
	"Builds settle · cursor home",
	"Rows thin into log lines",
	"Mark resolves · loop",
]

export const SCENES = [
	{ id: "mark", label: "Mark", from: B(1), to: B(3) },
	{ id: "deploy", label: "Deploy card", from: B(3), to: B(9) },
	{ id: "build", label: "Build", from: B(9), to: B(21) },
	{ id: "live", label: "Live", from: B(21), to: B(25) },
	{ id: "preview", label: "Preview", from: B(25), to: B(29) },
	{ id: "builds", label: "Your builds", from: B(29), to: B(31) },
	{ id: "resolve", label: "Resolve", from: B(31), to: DURATION },
]

export const sceneAt = (t) => SCENES.find((scene) => t >= scene.from && t < scene.to) ?? SCENES[SCENES.length - 1]

/**
 * Sound cues. `scripts/sfx.mjs` synthesises each kind; levels are kept low
 * so a music bed can sit on top. Times are exact so clicks land on frames
 * where the pointer visibly presses.
 */
export const CUES = [
	{ at: T.ping, kind: "ping", gain: 0.5 },
	{ at: T.pill, kind: "whoosh", gain: 0.35 },
	{ at: T.widen, kind: "swell", gain: 0.3 },
	{ at: T.focus, kind: "click", gain: 0.6 },
	{ at: T.paste - 0.07, kind: "key", gain: 0.45 },
	{ at: T.paste, kind: "key", gain: 0.55 },
	{ at: T.ready, kind: "tick", gain: 0.4 },
	{ at: T.deploy, kind: "click", gain: 0.7 },
	{ at: T.deploy + 0.02, kind: "whoosh", gain: 0.35 },
	{ at: T.fetched, kind: "tick", gain: 0.25 },
	{ at: T.installed, kind: "tick", gain: 0.25 },
	{ at: T.hover + 0.05, kind: "tap", gain: 0.3 },
	{ at: T.built, kind: "tick", gain: 0.25 },
	{ at: T.live + 0.1, kind: "success", gain: 0.55 },
	{ at: T.morph, kind: "whoosh", gain: 0.4 },
	{ at: T.landed, kind: "tick", gain: 0.35 },
	{ at: T.open2, kind: "click", gain: 0.6 },
	{ at: T.open2 + 0.02, kind: "swell", gain: 0.35 },
	{ at: T.copy, kind: "click", gain: 0.65 },
	{ at: T.copy + 0.06, kind: "tick", gain: 0.4 },
	{ at: T.fold, kind: "whoosh", gain: 0.35 },
	{ at: T.collapse, kind: "whoosh", gain: 0.4 },
	{ at: T.resolve + 0.3, kind: "ping", gain: 0.45 },
]
