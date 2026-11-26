import { clamp, seeded } from "../engine/math.js"

/**
 * Particle smoke. A plume is a set of puffs: each is born at an emitter (a
 * point or a line), travels out along its own direction while slowing, rises,
 * and swells as it ages. The shader sums them as soft blobs, lets noise eat
 * their edges into wisps and lights them by the slope toward the light, so the
 * smoke billows and spreads instead of sliding. Every puff is a function of
 * film time and a seed, so any frame can be drawn on its own.
 */

export const MAX_PUFFS = 40
const ASP = 16 / 9

/**
 * @param {object} p
 *   from, to   emitter: a point, or a line from `from` to `to` (uv, y up)
 *   t0         when the first puff is born; `window` seconds later the last
 *   count      puffs (≤ MAX_PUFFS)
 *   angle      main direction in degrees (90 = up), `spread` ± degrees around it
 *   speed      [min, max] initial speed (uv per second), `drag` how fast it slows
 *   size       [min, max] radius at birth (uv), `grow` how fast it swells
 *   rise       extra upward drift per second
 *   alpha      peak opacity, `fade` [start, end] film times over which all puffs fade out
 */
export function plume({ seed = 1, from = [0.5, 0], to = null, t0 = 0, window = 0.5, count = 30, angle = 90, spread = 40, speed = [0.2, 0.5], drag = 1.6, size = [0.08, 0.16], grow = 0.7, rise = 0.05, alpha = 1, fade = null }, t, out = new Float32Array(MAX_PUFFS * 4), offset = 0) {
	const rnd = seeded(seed * 7919 + 13)
	const n = Math.min(count, MAX_PUFFS - offset)
	const fadeK = fade ? 1 - clamp((t - fade[0]) / (fade[1] - fade[0])) : 1
	for (let i = 0; i < n; i++) {
		const r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd(), r5 = rnd(), r6 = rnd()
		const birth = t0 + (i / Math.max(1, n - 1)) * window * (0.75 + 0.5 * r6)
		const age = t - birth
		const k = (offset + i) * 4
		if (age <= 0) {
			out[k] = out[k + 1] = out[k + 2] = out[k + 3] = 0
			continue
		}
		const ex = to ? from[0] + (to[0] - from[0]) * r1 : from[0] + (r1 - 0.5) * 0.04
		const ey = to ? from[1] + (to[1] - from[1]) * r1 : from[1] + (r2 - 0.5) * 0.04
		const a = ((angle + (r3 * 2 - 1) * spread) * Math.PI) / 180
		const v = speed[0] + (speed[1] - speed[0]) * r4
		const dist = (v * (1 - Math.exp(-age * drag))) / drag
		const x = ex + Math.cos(a) * dist
		const y = ey + Math.sin(a) * dist + rise * age
		const r0 = size[0] + (size[1] - size[0]) * r5
		const radius = r0 * (0.45 + 0.55 * Math.min(1, age * 4)) * (1 + grow * age)
		out[k] = x * ASP
		out[k + 1] = y
		out[k + 2] = radius
		out[k + 3] = alpha * Math.min(1, age * 5) * fadeK
	}
	return out
}

/** Several plumes into one puff list (they share the MAX_PUFFS slots). */
export function plumes(list, t) {
	const out = new Float32Array(MAX_PUFFS * 4)
	let offset = 0
	for (const p of list) {
		plume(p, t, out, offset)
		offset += Math.min(p.count ?? 30, MAX_PUFFS - offset)
	}
	return out
}

/** Uniforms for the smoke program: the puffs plus the look. */
export const smokeLook = (puffs, over = {}) => ({
	u_puffs: puffs,
	u_light: [0.5, 0.9],
	u_lit: [0.8, 0.82, 0.87],
	u_shade: [0.03, 0.033, 0.04],
	u_glow: 1.15,
	u_erode: 0.6,
	u_detail: 2.5,
	u_flow: [0.015, -0.06],
	u_density: 1.1,
	u_alpha: 1,
	u_seed: 3,
	u_opaque: 0,
	u_back: [0.5, 0.5, 0.3, 0],
	...over,
})
