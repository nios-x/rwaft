/**
 * Pure math for the motion system. Nothing here reads the clock or keeps
 * state: every function maps its inputs to one output, so a frame is a
 * function of time alone.
 */

export const clamp = (value, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, value))
export const lerp = (a, b, u) => a + (b - a) * u

/** Where `t` sits between t0 and t1, clamped to 0..1. The workhorse of every timed change. */
export const progress = (t, t0, t1) => (t1 === t0 ? (t >= t1 ? 1 : 0) : clamp((t - t0) / (t1 - t0)))

/** Clamped interpolation from one range to another, with an optional easing on the way. */
export const remap = (value, inLo, inHi, outLo, outHi, easing = ease.linear) =>
	lerp(outLo, outHi, easing(progress(value, inLo, inHi)))

export const smoothstep = (u) => {
	const x = clamp(u)
	return x * x * (3 - 2 * x)
}

export const smootherstep = (u) => {
	const x = clamp(u)
	return x * x * x * (x * (x * 6 - 15) + 10)
}

/** A bump that rises from 0 at u=0 to 1 at u=0.5 and back to 0 at u=1. */
export const bump = (u) => (u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u) ** 2)

export const ease = {
	linear: (u) => u,
	quadOut: (u) => 1 - (1 - u) * (1 - u),
	cubicOut: (u) => 1 - (1 - u) ** 3,
	cubicIn: (u) => u * u * u,
	cubicInOut: (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2),
	quartOut: (u) => 1 - (1 - u) ** 4,
	quintOut: (u) => 1 - (1 - u) ** 5,
	expoOut: (u) => (u >= 1 ? 1 : 1 - 2 ** (-10 * u)),
	expoInOut: (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? 2 ** (20 * u - 10) / 2 : (2 - 2 ** (-20 * u + 10)) / 2),
	sineInOut: (u) => -(Math.cos(Math.PI * u) - 1) / 2,
	/** Minimum-jerk: the velocity profile of a relaxed human reach. */
	minJerk: (u) => u * u * u * (10 + u * (-15 + 6 * u)),
}

/**
 * Piecewise interpolation through [time, value] stops, clamped at both ends.
 * Used for things that follow a schedule rather than a spring, such as the
 * build clock or a progress bar that advances in bursts.
 */
export function stops(t, points, easing = ease.linear) {
	if (t <= points[0][0]) return points[0][1]
	for (let i = 1; i < points.length; i++) {
		const [t1, v1] = points[i]
		if (t <= t1) {
			const [t0, v0] = points[i - 1]
			return lerp(v0, v1, easing(progress(t, t0, t1)))
		}
	}
	return points[points.length - 1][1]
}

/* ── Colour ───────────────────────────────────────────────────────────── */

const parsed = new Map()

/** "#rrggbb" or "rgba(r,g,b,a)" → [r, g, b, a] with a in 0..1. */
export function rgba(color) {
	if (Array.isArray(color)) return color
	let hit = parsed.get(color)
	if (hit) return hit
	if (color.startsWith("#")) {
		const hex = color.slice(1)
		const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex
		hit = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
		hit.push(full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1)
	} else {
		const nums = color.match(/[\d.]+/g).map(Number)
		hit = [nums[0], nums[1], nums[2], nums[3] ?? 1]
	}
	parsed.set(color, hit)
	return hit
}

/** Mixes two colours in linear light, so a dark-to-light change does not dip through mud. */
export function mixColor(a, b, u) {
	const ca = rgba(a)
	const cb = rgba(b)
	const x = clamp(u)
	const lin = (c) => (c / 255) ** 2.2
	const out = [0, 1, 2].map((i) => Math.round(255 * lerp(lin(ca[i]), lin(cb[i]), x) ** (1 / 2.2)))
	const alpha = lerp(ca[3], cb[3], x)
	return `rgba(${out[0]},${out[1]},${out[2]},${+alpha.toFixed(4)})`
}

export const withAlpha = (color, alpha) => {
	const [r, g, b, a] = rgba(color)
	return `rgba(${r},${g},${b},${+(a * alpha).toFixed(4)})`
}

/* ── Deterministic randomness ─────────────────────────────────────────── */

/** mulberry32: a seeded generator, so "human" irregularity is identical on every render. */
export function seeded(seed) {
	let s = seed >>> 0
	return () => {
		s = (s + 0x6d2b79f5) >>> 0
		let r = Math.imul(s ^ (s >>> 15), 1 | s)
		r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296
	}
}
