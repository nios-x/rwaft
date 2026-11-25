import { css, h } from "../engine/dom.js"
import { SHOTS } from "./beatmap.js"
import { SHOT_DEFS } from "./shots.js"
import { createGL, textMaps } from "./gl.js"
import { transitionAt, transitionSmoke } from "./transitions.js"

export const VIEW = { width: 1920, height: 1080 }

/**
 * Assembles the trailer. Inside a camera layer (`.cam`, which transitions
 * move): smoke behind, a WebGL layer for solid objects, the shots' DOM, and
 * smoke in front. Over it: film grain, a vignette, a light sweep and a flash.
 * Exactly one shot is displayed at a time; seek(t) picks it, lets it write its
 * styles, draws its GL passes and applies the transition state for t.
 * Nothing depends on the previous frame.
 */
export function createScene(stage, { dpr = window.devicePixelRatio || 1 } = {}) {
	stage.textContent = ""
	const cam = h("div", "layer cam", stage)
	const smokeBack = h("canvas", "layer gl-smoke", cam)
	const back = h("canvas", "layer gl-back", cam)
	const shotsEl = h("div", "layer shots", cam)
	const front = h("canvas", "layer gl-front", cam)
	const grainCanvas = h("canvas", "layer grain", stage)
	const vignette = h("div", "layer vignette", stage)
	const sweep = h("div", "layer sweep", stage)
	const flash = h("div", "layer flash", stage)

	// Smoke is soft: it renders at a lower pixel ratio than the solid objects.
	const smokeDpr = Math.min(dpr, 1.25)
	const glSmoke = createGL(smokeBack, { names: ["smoke"], dpr: smokeDpr })
	const glBack = createGL(back, { names: ["wash", "mark", "chrome", "arcs", "gradient"], dpr })
	const glFront = createGL(front, { names: ["smoke"], dpr: smokeDpr })
	const glGrain = createGL(grainCanvas, { names: ["grain"], dpr })

	const LETTERING = {
		name: { text: "rwaft", width: 2560, height: 690, font: '800 560px "Geist"', size: 560, stretch: 1.04, tracking: -18, blur: [5, 13], fill: 0.97 },
	}
	const ctx = {
		dpr,
		chromeText(kind) {
			const spec = LETTERING[kind]
			const maps = textMaps(spec.text, spec)
			return {
				u_mask: glBack.texture(maps.mask),
				u_h1: glBack.texture(maps.h1),
				u_h2: glBack.texture(maps.h2),
				u_texel: [1.6 / spec.width, 1.6 / spec.height],
			}
		},
	}

	const list = SHOTS.map((spec) => {
		const def = SHOT_DEFS[spec.id]
		if (!def) throw new Error(`No shot definition for "${spec.id}"`)
		const el = h("div", "shot", shotsEl)
		el.dataset.id = spec.id
		el.style.display = "none"
		el.style.visibility = "visible"
		const refs = def.build(el, ctx) ?? {}
		return { ...spec, def, el, refs }
	})

	let active = null
	const shotAt = (t) => list.find((s) => t >= s.from && t < s.to) ?? (t < 0 ? list[0] : list[list.length - 1])

	function applyCamera(tr) {
		const moved = Math.abs(tr.scale - 1) > 1e-4 || Math.abs(tr.tx) > 0.01 || Math.abs(tr.ty) > 0.01
		css(cam, {
			transform: moved ? `translate(${tr.tx.toFixed(2)}px, ${tr.ty.toFixed(2)}px) scale(${tr.scale.toFixed(4)})` : "none",
			transformOrigin: `${tr.ox}px ${tr.oy}px`,
			filter: tr.blur > 0.05 || Math.abs(tr.bright - 1) > 0.002 ? `blur(${tr.blur.toFixed(2)}px) brightness(${tr.bright.toFixed(3)})` : "none",
		})
		if (tr.sweep >= 0) {
			const x = -30 + 160 * tr.sweep
			css(sweep, { opacity: "1", background: `linear-gradient(105deg, transparent ${(x - 16).toFixed(2)}%, rgba(255,255,255,0.08) ${(x - 7).toFixed(2)}%, rgba(255,255,255,0.6) ${x.toFixed(2)}%, rgba(255,255,255,0.08) ${(x + 7).toFixed(2)}%, transparent ${(x + 16).toFixed(2)}%)` })
		} else css(sweep, { opacity: "0" })
	}

	function seek(t, { gl = true } = {}) {
		const shot = shotAt(t)
		if (active !== shot) {
			if (active) active.el.style.display = "none"
			shot.el.style.display = "block"
			active = shot
		}
		const u = t - shot.from
		shot.def.update(t, u, shot.refs, shot)
		const tr = transitionAt(t)
		applyCamera(tr)
		css(vignette, { opacity: String(shot.def.vignette ?? 1) })
		const f = Math.max(shot.def.flash ? shot.def.flash(t) : 0, tr.flash)
		css(flash, { opacity: f > 0.002 ? Math.min(1, f).toFixed(3) : "0" })

		if (gl) {
			const passes = shot.def.gl ? shot.def.gl(t, u, shot.refs) : {}
			const backPasses = passes.back ?? []
			glSmoke.begin("black")
			for (const [name, values, options] of backPasses) if (name === "smoke") glSmoke.draw(name, { u_time: t, ...values }, options)
			glSmoke.finish()
			glBack.begin("clear")
			for (const [name, values, options] of backPasses) if (name !== "smoke") glBack.draw(name, { u_time: t, ...values }, options)
			glBack.finish()
			const frontPasses = [...(passes.front ?? [])]
			if (tr.smoke) frontPasses.push(["smoke", transitionSmoke(tr.smoke)])
			if (frontPasses.length) {
				glFront.begin("clear")
				for (const [name, values, options] of frontPasses) glFront.draw(name, { u_time: t, ...values }, options)
				glFront.finish()
			} else glFront.begin("none")
			glGrain.begin("black")
			glGrain.draw("grain", { u_frame: Math.round(t * 60) % 977, u_amount: 0.1, u_px: 1.4 * dpr }, { blend: false })
			glGrain.finish()
		}
		return { t, shot: shot.id, label: shot.label, u }
	}

	/** Largest on-screen displacement of anything in the frame between t0 and t1 (CSS px). */
	function motion(t0, t1) {
		const snap = () => {
			const map = new Map()
			if (!active) return map
			for (const el of active.el.querySelectorAll("*")) {
				if (el instanceof SVGElement && el.tagName !== "svg") continue
				const r = el.getBoundingClientRect()
				if (r.width === 0 && r.height === 0) continue
				map.set(el, r)
			}
			return map
		}
		seek(t0, { gl: false })
		const shot0 = active
		const a = snap()
		seek(t1, { gl: false })
		if (active !== shot0) return 0
		const bMap = snap()
		let max = 0
		for (const [el, r0] of a) {
			const r1 = bMap.get(el)
			if (!r1) continue
			max = Math.max(max, Math.abs(r0.left - r1.left), Math.abs(r0.top - r1.top), Math.abs(r0.right - r1.right), Math.abs(r0.bottom - r1.bottom))
		}
		// the camera moves canvases too, which have no element rects to compare
		const c0 = transitionAt(t0)
		const c1 = transitionAt(t1)
		const camMove = Math.abs(c1.tx - c0.tx) + Math.abs(c1.scale - c0.scale) * 1100
		const hint = active.def.motion ? active.def.motion(t0, t1) : 0
		return Math.max(max, hint, camMove)
	}

	return { seek, motion, shots: list, view: VIEW }
}
