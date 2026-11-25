/**
 * rwaft keynote trailer: 19.2 s, 1920 × 1080, cut to the reference track.
 *
 * The track was measured, not guessed (onset analysis of the reference's
 * audio): 80.21 BPM, beat k (0-based) at 0.279 + 0.748·k s, every strong
 * onset within ±2 ms of that grid. Before the groove starts there is a quiet
 * intro (0–2.1 s), near silence (2.1–2.5 s) and three hits that pick up into
 * it (2.508, 2.772, 3.043 s). A drum fill lands at 12.694 s.
 *
 * Every cut sits on a beat (b), a half beat (h) or one of those measured hits.
 */

const SPB = 0.748
const OFFSET = 0.279
export const b = (k) => OFFSET + k * SPB
export const h = (k) => b(k) + SPB / 2

export const DURATION = 19.2
export const FPS = 60

export const HIT = [2.508, 2.772, 3.043]
export const FILL = 12.694

/**
 * The shot list, in order. Each shot owns [from, to). `label` is for the
 * preview timeline; `mirrors` is the reference shot it answers.
 */
export const SHOTS = [
	{ id: "type", from: 0, to: b(1), label: "prompt · wide", mirrors: "product turntable" },
	{ id: "macro", from: b(1), to: b(2), label: "prompt · macro", mirrors: "product close-up" },
	{ id: "send", from: b(2), to: HIT[0], label: "send → lights out", mirrors: "three phones / pause" },
	{ id: "hits", from: HIT[0], to: b(4), label: "mark assembles", mirrors: "the hit" },
	{ id: "smoke", from: b(4), to: b(5), label: "mark in smoke", mirrors: "phone in smoke" },
	{ id: "rim", from: b(5), to: b(6), label: "rim-lit window", mirrors: "rim-lit silhouette" },
	{ id: "chip", from: b(6), to: b(7), label: "build engine chip", mirrors: "A20 chip" },
	{ id: "card-real", from: b(7), to: b(8), label: "No spinners", mirrors: "Engineered for…" },
	{ id: "logs", from: b(8), to: b(9), label: "log field", mirrors: "vapor chamber" },
	{ id: "repair", from: b(9), to: b(10), label: "fixes its errors", mirrors: "thermally cooled" },
	{ id: "pages", from: b(10), to: b(11), label: "every page", mirrors: "battery" },
	{ id: "card-pages", from: b(11), to: b(12), label: "Up to 5 pages", mirrors: "45 hours" },
	{ id: "site", from: b(12), to: h(12), label: "live site", mirrors: "video in phone" },
	{ id: "card-dev", from: h(12), to: h(13), label: "developers", mirrors: "Pro camera system" },
	{ id: "repo", from: h(13), to: b(14), label: "repo field", mirrors: "variable aperture" },
	{ id: "stages", from: b(14), to: h(14), label: "Vite / CRA", mirrors: "creative range" },
	{ id: "pr", from: h(14), to: h(15), label: "pull request hero", mirrors: "camera hero" },
	{ id: "card-pr", from: h(15), to: FILL, label: "Pull requests", mirrors: "low-light" },
	{ id: "card-ci", from: FILL, to: h(17), label: "Fixes checks", mirrors: "depth of field" },
	{ id: "checks", from: h(17), to: b(18), label: "checks UI", mirrors: "camera UI" },
	{ id: "card-ask", from: b(18), to: b(19), label: "Change it by asking", mirrors: "Custom Pro controls" },
	{ id: "change", from: b(19), to: b(20), label: "change UI", mirrors: "controls UI" },
	{ id: "ai", from: b(20), to: b(21), label: "rwaft AI", mirrors: "Siri" },
	{ id: "card-plain", from: b(21), to: h(21), label: "Plain words", mirrors: "More personal" },
	{ id: "live", from: h(21), to: h(22), label: "Your site is live", mirrors: "AI card" },
	{ id: "gallery", from: h(22), to: h(23), label: "ring of built sites", mirrors: "PRO FURTHER" },
	{ id: "wordmark", from: h(23), to: h(24), label: "black wordmark", mirrors: "chrome PRO" },
	{ id: "end", from: h(24), to: DURATION, label: "mark", mirrors: "logo" },
]

/**
 * How each shot is entered: the transition across the cut into it, keyed by
 * the incoming shot. The cut itself stays on its beat; a transition only
 * shapes the frames either side (`pre` seconds before, `post` after).
 *
 *   push   zoom through: the outgoing frame rushes toward `focus` and blows out,
 *          the incoming one settles from slightly large
 *   whip   a fast slide (`dir` -1 left, 1 right), smeared by the motion blur
 *   blur   a defocus dissolve through near-black
 *   smoke  billows surge over the frame and clear into the next shot
 *   flash  a white bloom on the beat
 *   sweep  a band of light crosses the frame as it changes
 *   cut    nothing: the beat itself is the transition
 */
export const CUTS = {
	macro: { type: "push", focus: [1180, 610], pre: 0.16, post: 0.18 },
	send: { type: "whip", dir: -1, pre: 0.12, post: 0.16 },
	hits: { type: "cut" },
	smoke: { type: "smoke", pre: 0.16, post: 0.3 },
	rim: { type: "smoke", pre: 0.18, post: 0.24 },
	chip: { type: "push", focus: [960, 640], pre: 0.16, post: 0.18, flash: 0.5 },
	"card-real": { type: "push", focus: [960, 540], pre: 0.16, post: 0.16, flash: 0.7 },
	logs: { type: "blur", pre: 0.1, post: 0.16 },
	repair: { type: "smoke", pre: 0.2, post: 0.26 },
	pages: { type: "whip", dir: -1, pre: 0.12, post: 0.16 },
	"card-pages": { type: "blur", pre: 0.1, post: 0.14 },
	site: { type: "push", focus: [960, 540], pre: 0.14, post: 0.08 },
	"card-dev": { type: "blur", pre: 0.08, post: 0.12 },
	repo: { type: "push", focus: [960, 540], pre: 0.12, post: 0.12 },
	stages: { type: "whip", dir: -1, pre: 0.1, post: 0.12 },
	pr: { type: "whip", dir: -1, pre: 0.1, post: 0.14 },
	"card-pr": { type: "blur", pre: 0.1, post: 0.14 },
	"card-ci": { type: "flash", pre: 0.04, post: 0.22, flash: 0.75 },
	checks: { type: "push", focus: [960, 540], pre: 0.12, post: 0.12 },
	"card-ask": { type: "blur", pre: 0.08, post: 0.14 },
	change: { type: "push", focus: [960, 540], pre: 0.14, post: 0.16 },
	ai: { type: "sweep", pre: 0.16, post: 0.2 },
	"card-plain": { type: "blur", pre: 0.12, post: 0.14 },
	live: { type: "push", focus: [960, 540], pre: 0.12, post: 0.16 },
	gallery: { type: "smoke", pre: 0.2, post: 0.26 },
	wordmark: { type: "smoke", pre: 0.2, post: 0.3 },
	end: { type: "sweep", pre: 0.16, post: 0.2 },
}

/* ── The contract the preview transport and HUD read ─────────────────── */

const BEAT_COUNT = 26
export const grid = {
	bpm: 60 / SPB,
	spb: SPB,
	beatsPerBar: 4,
	beats: BEAT_COUNT,
	duration: DURATION,
	offset: OFFSET,
	beat: (n, fraction = 0) => OFFSET + (n - 1 + fraction) * SPB,
	beatAt: (t) => (t - OFFSET) / SPB + 1,
	position(t) {
		const index = Math.floor((t - OFFSET) / SPB)
		return { bar: Math.floor(index / 4) + 1, beat: (((index % 4) + 4) % 4) + 1, index: index + 1 }
	},
	wrap: (t) => ((t % DURATION) + DURATION) % DURATION,
}
export const B = grid.beat

export const SCENES = SHOTS.map((s) => ({ from: s.from, to: s.to, label: s.label }))
export const BEATS = Array.from({ length: BEAT_COUNT }, (_, i) => {
	const t = b(i)
	return SHOTS.find((s) => t >= s.from && t < s.to)?.label ?? ""
})
export const CUES = [...HIT.map((at) => ({ at, kind: "hit" })), { at: FILL, kind: "fill" }]
