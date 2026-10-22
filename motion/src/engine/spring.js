import { clamp, smoothstep } from "./math.js"

/**
 * Closed-form damped springs.
 *
 * A spring is described the way designers tune them: `response` is the
 * period of the undamped oscillation in seconds (how quickly it gets there)
 * and `damping` is the damping ratio ζ (1 = no overshoot, 0.85 ≈ 0.6 %
 * overshoot, 0.75 ≈ 2.8 %). The step response is solved analytically, so the
 * value at any time is computed directly instead of integrated frame by frame.
 *
 * Retargeting is handled by superposition: the spring equation is linear, so
 * a value that is sent to A at t0 and then to B at t1 equals the response to
 * a step of size A at t0 plus a step of size (B − A) at t1. That keeps every
 * property a pure function of time, with velocity carried through each
 * retarget exactly as a simulated spring would.
 *
 * Each response is windowed so it lands exactly: once the oscillation is
 * below 0.05 % its residue is eased to zero. Without that a loop would end a
 * fraction of a pixel away from where it started.
 */

const SETTLE_EPSILON = 5e-4

function residualRaw(tau, w0, zeta) {
	if (tau <= 0) return 1
	if (zeta < 1) {
		const wd = w0 * Math.sqrt(1 - zeta * zeta)
		return Math.exp(-zeta * w0 * tau) * (Math.cos(wd * tau) + (zeta * w0 / wd) * Math.sin(wd * tau))
	}
	if (zeta === 1) return Math.exp(-w0 * tau) * (1 + w0 * tau)
	const wd = w0 * Math.sqrt(zeta * zeta - 1)
	return Math.exp(-zeta * w0 * tau) * (Math.cosh(wd * tau) + (zeta * w0 / wd) * Math.sinh(wd * tau))
}

function settleTime(w0, zeta) {
	if (zeta < 1) {
		const envelope = 1 / Math.sqrt(1 - zeta * zeta)
		return Math.log(envelope / SETTLE_EPSILON) / (zeta * w0)
	}
	// Overdamped and critical responses decay monotonically: find the crossing.
	let tau = 0
	while (residualRaw(tau, w0, zeta) > SETTLE_EPSILON && tau < 20) tau += 0.002
	return tau
}

/** Creates a spring preset. `response` in seconds, `damping` as the ratio ζ. */
export function spring(response, damping = 0.86) {
	const w0 = (2 * Math.PI) / response
	return { response, damping, w0, settle: settleTime(w0, damping) }
}

/**
 * The house springs. Different parts of an object use different presets so
 * a moving shape has a leading and a trailing side.
 */
export const springs = {
	/** Small UI parts: chips, icons, labels. */
	ui: spring(0.34, 0.86),
	/** Buttons and badges that may overshoot by a hair. */
	pop: spring(0.3, 0.74),
	/** The leading edge of the primary object. */
	lead: spring(0.42, 0.84),
	/** The trailing edge: arrives a beat behind the leading one. */
	trail: spring(0.56, 0.87),
	/** Lower edges that should feel heavier when a card stretches. */
	heavy: spring(0.64, 0.88),
	/** Morphing inner objects: a field becoming a chip, a chip becoming a URL. */
	morph: spring(0.48, 0.85),
	/** The camera: soft, no visible overshoot. */
	camera: spring(0.95, 0.97),
	/** Colour and opacity changes that should never overshoot. */
	fade: spring(0.3, 1),
}

/**
 * Normalised step response at time `t` for a step that starts at `t0`:
 * 0 before t0, rising to 1 (with the preset's overshoot), exactly 1 once settled.
 */
export function springAt(t, t0, preset = springs.ui) {
	const tau = t - t0
	if (tau <= 0) return 0
	const { w0, damping, settle } = preset
	if (tau >= settle) return 1
	const fadeStart = settle * 0.6
	const window = tau <= fadeStart ? 1 : 1 - smoothstep((tau - fadeStart) / (settle - fadeStart))
	return 1 - residualRaw(tau, w0, damping) * window
}

/**
 * A property driven by a sequence of spring retargets.
 *
 * `keys` is a list of `{ at, to, spring?, delay? }` in story order. The value
 * starts at `from` and every key adds the step from the previous target to
 * its own, released at `at + delay` with its own spring.
 */
export function track(t, from, keys) {
	let value = from
	let previous = from
	for (const key of keys) {
		const step = key.to - previous
		previous = key.to
		if (step !== 0) value += step * springAt(t, key.at + (key.delay ?? 0), key.spring ?? springs.ui)
	}
	return value
}

/**
 * Spring progress between two times: 0 → 1 on `forward`, back to 0 on
 * `back`. Handy for "on, then off again" states such as hover or focus.
 */
export function pulseTrack(t, on, off, preset = springs.ui, offPreset = preset) {
	return clamp(springAt(t, on, preset) - (off == null ? 0 : springAt(t, off, offPreset)), -0.2, 1.2)
}

/**
 * A rectangle whose four edges spring independently: `{ l, t, r, b, radius }`.
 * `states` is a list of `{ at, rect, edges?, radius? }`; `edges` may name a
 * preset and delay per edge, which is what makes a stretch look liquid.
 */
export function rectTrack(t, states) {
	const first = states[0].rect
	const out = {}
	for (const edge of ["l", "t", "r", "b", "radius"]) {
		const keys = []
		for (let i = 1; i < states.length; i++) {
			const state = states[i]
			const motion = state.edges?.[edge] ?? state.edges?.all ?? {}
			keys.push({ at: state.at, to: state.rect[edge], spring: motion.spring ?? springs.morph, delay: motion.delay ?? 0 })
		}
		out[edge] = track(t, first[edge], keys)
	}
	out.w = out.r - out.l
	out.h = out.b - out.t
	out.cx = (out.l + out.r) / 2
	out.cy = (out.t + out.b) / 2
	return out
}

/** Builds an edge rect from a centre and a size. */
export const rect = (cx, cy, w, h, radius) => ({ l: cx - w / 2, t: cy - h / 2, r: cx + w / 2, b: cy + h / 2, radius })
export const rectLTWH = (l, t, w, h, radius) => ({ l, t, r: l + w, b: t + h, radius })
