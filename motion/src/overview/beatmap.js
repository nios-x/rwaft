import { beatGrid } from "../engine/timeline.js"

/**
 * rwaft product overview: 120 BPM, 58 beats = 29 s, 1920 × 1080.
 * One caption per scene, cuts on downbeats or half-bars, the cursor's clicks
 * on beats. Every timed thing in the overview is placed from this file.
 */

export const grid = beatGrid({ bpm: 120, beats: 58 })
export const B = grid.beat
export const DURATION = grid.duration

export const T = {
	open: B(1),
	promise: B(4),
	window: B(6, 0.7),
	home: B(7),
	chip: B(9),
	send: B(11),
	build: B(11, 0.3),
	buildCaption: B(12),
	logTab: B(17),
	repair: B(21),
	built: B(23, 0.9),
	live: B(24, 0.6),
	previewTab: B(25),
	share: B(29),
	copy: B(30),
	change: B(32),
	chatFocus: B(33),
	changeSend: B(35),
	changeLive: B(36),
	repo: B(37),
	repoMode: B(38),
	paste: B(39),
	repoSend: B(40),
	pricing: B(41),
	site: B(46),
	scroll: B(47, 0.4),
	tagline: B(51),
	end: B(54),
	finish: DURATION,
}

/**
 * Captions, in order. `key` is the phrase that gets the highlight; `at` and
 * `out` are when the words arrive and leave. `center` captions are the
 * text-only cards; the rest sit under the product.
 */
export const CAPTIONS = [
	{ at: B(1, 0.2), out: B(3, 0.8), text: "Every app starts as a sentence.", key: "sentence", center: true },
	{ at: B(4, 0.1), out: B(6, 0.3), text: "Yours can be live in minutes.", key: "live", center: true },
	{ at: B(7, 0.5), out: B(11, 0.7), text: "Describe it in plain words.", key: "plain words" },
	{ at: B(12, 0.2), out: B(16, 0.7), text: "Watch the real build.", key: "real" },
	{ at: B(17, 0.3), out: B(20, 0.7), text: "Every step, in the open.", key: "open" },
	{ at: B(21, 0.2), out: B(24, 0.7), text: "It fixes its own errors.", key: "fixes" },
	{ at: B(25, 0.2), out: B(28, 0.7), text: "Live at its own link.", key: "link" },
	{ at: B(29, 0.2), out: B(31, 0.7), text: "Share it with anyone.", key: "anyone" },
	{ at: B(32, 0.2), out: B(36, 0.7), text: "Change it by asking.", key: "asking" },
	{ at: B(37, 0.2), out: B(40, 0.7), text: "Or deploy a React repo.", key: "React repo" },
	{ at: B(41, 0.3), out: B(45, 0.7), text: "Start with 5 free chats.", key: "free", sub: "Failed builds are refunded.", subAt: B(42, 0.4) },
	{ at: B(46, 0.2), out: B(50, 0.6), text: "Start free at rwaft.live", key: "rwaft.live" },
	{ at: B(51, 0.3), out: B(53, 0.8), text: "Describe an app. Get a live link.", key: "live link", center: true },
]

export const SCENES = [
	{ id: "open", label: "Text cards", from: 0, to: T.window },
	{ id: "home", label: "Describe", from: T.window, to: T.build },
	{ id: "build", label: "Real build", from: T.build, to: T.logTab },
	{ id: "log", label: "Log", from: T.logTab, to: T.repair },
	{ id: "repair", label: "Repair", from: T.repair, to: T.previewTab },
	{ id: "live", label: "Live", from: T.previewTab, to: T.share },
	{ id: "share", label: "Share", from: T.share, to: T.change },
	{ id: "change", label: "Change", from: T.change, to: T.repo },
	{ id: "repo", label: "Repo", from: T.repo, to: T.pricing },
	{ id: "pricing", label: "Pricing", from: T.pricing, to: T.site },
	{ id: "site", label: "rwaft.live", from: T.site, to: T.tagline },
	{ id: "tagline", label: "Tagline", from: T.tagline, to: T.end },
	{ id: "end", label: "End card", from: T.end, to: DURATION },
]

export const sceneAt = (t) => SCENES.find((scene) => t >= scene.from && t < scene.to) ?? SCENES[SCENES.length - 1]

/** What each beat is for, shown in the debug HUD. */
export const BEATS = Array.from({ length: grid.beats }, (_, i) => {
	const t = B(i + 1)
	const caption = [...CAPTIONS].reverse().find((c) => t >= c.at - 0.3)
	return `${sceneAt(t).label}${caption ? ` · ${caption.text}` : ""}`
})

/** Sound cues: clicks land on the frames where the pointer presses. */
export const CUES = [
	{ at: T.window, kind: "swell", gain: 0.35 },
	{ at: T.chip, kind: "click", gain: 0.6 },
	...Array.from({ length: 9 }, (_, i) => ({ at: T.chip + 0.08 + i * 0.075, kind: "key", gain: 0.22 })),
	{ at: T.send, kind: "click", gain: 0.65 },
	{ at: T.build, kind: "whoosh", gain: 0.3 },
	{ at: T.logTab, kind: "click", gain: 0.55 },
	{ at: T.repair, kind: "tap", gain: 0.35 },
	{ at: T.built, kind: "tick", gain: 0.3 },
	{ at: T.live, kind: "success", gain: 0.5 },
	{ at: T.previewTab, kind: "click", gain: 0.55 },
	{ at: T.copy, kind: "click", gain: 0.6 },
	{ at: T.copy + 0.06, kind: "tick", gain: 0.35 },
	{ at: T.chatFocus, kind: "click", gain: 0.5 },
	...Array.from({ length: 10 }, (_, i) => ({ at: T.chatFocus + 0.12 + i * 0.07, kind: "key", gain: 0.25 })),
	{ at: T.changeSend, kind: "click", gain: 0.6 },
	{ at: T.changeLive, kind: "tick", gain: 0.35 },
	{ at: T.repo, kind: "whoosh", gain: 0.3 },
	{ at: T.repoMode, kind: "click", gain: 0.5 },
	{ at: T.paste, kind: "key", gain: 0.45 },
	{ at: T.repoSend, kind: "click", gain: 0.6 },
	{ at: T.pricing, kind: "whoosh", gain: 0.3 },
	{ at: T.site, kind: "whoosh", gain: 0.3 },
	{ at: T.tagline, kind: "swell", gain: 0.3 },
	{ at: T.end, kind: "ping", gain: 0.5 },
]
