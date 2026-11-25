import { ease, progress } from "../engine/math.js"
import { CUTS, SHOTS } from "./beatmap.js"
import { plume, smokeLook } from "./smoke.js"

/**
 * Transitions across the trailer's cuts. Every cut keeps its beat; the
 * transition only shapes the frames either side of it, as a camera move on
 * the whole picture (scale, slide, defocus, exposure), a light overlay, or
 * smoke in front. Like everything else it is a pure function of film time.
 */

const P = progress
const E = ease

export const TRANSITIONS = SHOTS.slice(1).map((shot) => ({ at: shot.from, into: shot.id, ...(CUTS[shot.id] ?? { type: "cut" }) }))

const IDENTITY = () => ({ scale: 1, tx: 0, ty: 0, ox: 960, oy: 540, blur: 0, bright: 1, flash: 0, sweep: -1, smoke: null })

/** The transition state at time t: camera, exposure, flash, light sweep and smoke. */
export function transitionAt(t) {
	const s = IDENTITY()
	for (const c of TRANSITIONS) {
		if (c.type === "cut") continue
		const pre = c.pre ?? 0.12
		const post = c.post ?? 0.16
		if (t < c.at - pre || t >= c.at + post) continue
		const before = t < c.at
		// 0 at the edge of the window, 1 on the cut
		const a = before ? P(t, c.at - pre, c.at) : 1 - P(t, c.at, c.at + post)
		apply(c, a, before, s, t)
	}
	return s
}

function apply(c, a, before, s, t) {
	switch (c.type) {
		case "push": {
			if (before) {
				s.scale *= 1 + 0.85 * E.cubicIn(a)
				s.blur = Math.max(s.blur, 16 * E.cubicIn(a))
				s.bright *= 1 + 1.5 * a * a * a
				if (c.focus) [s.ox, s.oy] = c.focus
			} else {
				s.scale *= 1 + 0.16 * a * a
				s.blur = Math.max(s.blur, 12 * a * a)
				s.bright *= 1 + 0.9 * a * a
			}
			s.flash = Math.max(s.flash, (c.flash ?? 0.32) * a ** 4)
			break
		}
		case "whip": {
			const d = c.dir ?? -1
			s.tx += before ? d * 1150 * a * a * a : -d * 1150 * a * a * a
			s.blur = Math.max(s.blur, 5 * a)
			break
		}
		case "blur": {
			s.blur = Math.max(s.blur, 18 * a * a)
			s.bright *= 1 - 0.6 * a
			s.scale *= 1 + (before ? 0.04 : -0.035) * a
			break
		}
		case "smoke": {
			s.scale *= 1 + (before ? 0.05 : 0.03) * a
			s.smoke = { a, before, at: c.at, t, pre: c.pre ?? 0.12, post: c.post ?? 0.16 }
			break
		}
		case "flash": {
			s.flash = Math.max(s.flash, (c.flash ?? 0.6) * (before ? a * a * a : a ** 2.4))
			if (!before) s.scale *= 1 + 0.05 * a
			break
		}
		case "sweep": {
			const pre = c.pre ?? 0.12
			const post = c.post ?? 0.16
			s.sweep = P(t, c.at - pre, c.at + post)
			s.bright *= 1 + 0.45 * a * a
			break
		}
	}
}

/**
 * Smoke for a smoke transition: a wall of puffs launched from below just
 * before the cut, covering the frame on it, then rising away and thinning
 * into the next shot. The puffs are the same on both sides of the cut.
 */
export function transitionSmoke({ before, at, t, pre, post }) {
	const seed = 71 + (Math.round(at * 10) % 17)
	const puffs = plume({ seed, from: [-0.12, -0.32], to: [1.12, -0.32], t0: at - pre - 0.04, window: pre * 0.7, count: 40, spread: 22, speed: [3.4, 6.2], drag: 2.1, size: [0.22, 0.38], grow: 1.5, rise: 0.12, fade: [at + post * 0.1, at + post] }, t)
	return smokeLook(puffs, { u_light: [0.5, 1.1], u_lit: [0.82, 0.84, 0.88], u_shade: [0.04, 0.043, 0.05], u_seed: seed, u_glow: 1.0, u_erode: before ? 0.6 : 0.8, u_density: 1.25 })
}
