import { clamp, ease, lerp, progress } from "./math.js"
import { springAt } from "./spring.js"

/**
 * Content transitions. Each returns an "fx" record:
 *   { o: opacity, x, y: offset in px, s: scale, blur: px }
 * which `fxStyle` turns into CSS. Outgoing and incoming content always get
 * their own clocks, so a swap is two independent motions, never a crossfade
 * of two overlapping texts.
 */

export const REST = Object.freeze({ o: 1, x: 0, y: 0, s: 1, blur: 0 })
export const GONE = Object.freeze({ o: 0, x: 0, y: 0, s: 1, blur: 0 })

const IN = { dur: 0.26, x: 0, y: 6, scale: 0.98, blur: 3, ease: ease.expoOut, spring: null }
const OUT = { dur: 0.14, x: 0, y: -3, scale: 0.985, blur: 3, ease: ease.cubicOut }

/**
 * Enter at `at`. Opacity runs ahead of position so text is legible before
 * it has finished settling, and blur clears in the first 60 % of the move.
 */
export function enter(t, at, options = {}) {
	const o = { ...IN, ...options }
	if (t <= at) return { o: 0, x: o.x, y: o.y, s: o.scale, blur: o.blur }
	const u = progress(t, at, at + o.dur)
	const m = o.spring ? springAt(t, at, o.spring) : o.ease(u)
	const fade = ease.quadOut(clamp(u * 1.5))
	const clear = ease.cubicOut(clamp(u / 0.6))
	return { o: fade, x: o.x * (1 - m), y: o.y * (1 - m), s: lerp(o.scale, 1, m), blur: o.blur * (1 - clear) }
}

/** Exit at `at`: quick, blurring and shrinking a touch, gone in ~140 ms. */
export function exit(t, at, options = {}) {
	const o = { ...OUT, ...options }
	if (t <= at) return REST
	const u = progress(t, at, at + o.dur)
	const m = o.ease(u)
	return { o: 1 - ease.quadOut(u), x: o.x * m, y: o.y * m, s: lerp(1, o.scale, m), blur: o.blur * m }
}

/** Combines two fx records: opacities and scales multiply, offsets and blur add. */
export function combine(a, b) {
	return { o: a.o * b.o, x: a.x + b.x, y: a.y + b.y, s: a.s * b.s, blur: a.blur + b.blur }
}

/**
 * Visible from `inAt` until `outAt` (either may be null for "always").
 * The most common lifecycle for a piece of content inside a morphing object.
 */
export function presence(t, inAt, outAt, inOptions, outOptions) {
	const a = inAt == null ? REST : enter(t, inAt, inOptions)
	const b = outAt == null ? REST : exit(t, outAt, outOptions)
	return combine(a, b)
}

/**
 * A content swap at `at`: the old layer leaves on its own clock and the new
 * one starts `gap` seconds later, after the old one is mostly gone.
 * Returns [outgoingFx, incomingFx].
 */
export function swap(t, at, { gap = 0.07, out = {}, in: incoming = {} } = {}) {
	return [exit(t, at, out), enter(t, at + gap, incoming)]
}

/** Blur that eases from `from` px to `to` px over a window. */
export const blurTransition = (t, at, dur, from, to, curve = ease.cubicOut) => lerp(from, to, curve(progress(t, at, at + dur)))

/** Scale that eases between two values, optionally on a spring. */
export const scaleTransition = (t, at, from, to, { dur = 0.3, curve = ease.expoOut, spring = null } = {}) =>
	lerp(from, to, spring ? springAt(t, at, spring) : curve(progress(t, at, at + dur)))

/** CSS for an fx record. Blur under 0.05 px is dropped so resting text is never filtered. */
export function fxStyle(fx, extraTransform = "") {
	const blur = fx.blur > 0.05 ? `blur(${fx.blur.toFixed(2)}px)` : "none"
	const moved = fx.x !== 0 || fx.y !== 0 || fx.s !== 1
	const transform = `${extraTransform}${moved ? ` translate(${fx.x.toFixed(2)}px, ${fx.y.toFixed(2)}px) scale(${fx.s.toFixed(4)})` : ""}`.trim()
	return {
		opacity: fx.o <= 0.001 ? "0" : fx.o >= 0.999 ? "1" : fx.o.toFixed(3),
		transform: transform || "none",
		filter: blur,
		visibility: fx.o <= 0.001 ? "hidden" : "visible",
	}
}
