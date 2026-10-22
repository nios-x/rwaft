import { createScene } from "./composition/scene.js"
import { FPS, formatFromQuery } from "./composition/config.js"
import * as map from "./composition/beatmap.js"
import { BEATS, CUES, DURATION, grid } from "./composition/beatmap.js"
import { createHud } from "./preview/hud.js"
import { createControls } from "./preview/controls.js"

/**
 * Boot. Two modes share one scene:
 *   preview (default)  the stage scaled to the window, with a transport
 *   ?render            the stage at its exact pixel size, nothing else on the
 *                      page; the renderer drives window.__film.seek(t)
 * Add ?debug=1 to show the HUD (in either mode) and ?t=3.5 to open at a time.
 */

const params = new URLSearchParams(location.search)
const rendering = params.has("render")
const view = formatFromQuery()

async function loadFonts() {
	const faces = [
		['400 16px "Geist"', "Aa"], ['500 16px "Geist"', "Aa"], ['600 16px "Geist"', "Aa"], ['650 16px "Geist"', "Aa"],
		['400 13px "Geist Mono"', "Aa0…"], ['400 13px "Geist Mono"', "│"],
		['700 25px "Bricolage Grotesque"', "rwaft"], ['400 40px "Instrument Serif"', "Small"],
	]
	await Promise.all(faces.map(([font, sample]) => document.fonts.load(font, sample)))
	await document.fonts.ready
}

await loadFonts()

const stage = document.getElementById("stage")
const scene = createScene(stage, view)
const hud = createHud(stage, view, map)
const debug = params.get("debug") === "1"
hud.show(debug)
hud.guides(params.get("guides") === "1")

const seek = (t) => {
	const info = scene.seek(t)
	hud.update(info)
	return info
}

/**
 * How far anything visible moves on screen between t0 and t1, in px. The
 * renderer uses it to decide how many temporal samples a frame needs for its
 * motion blur to be a smooth smear rather than a few discrete copies.
 */
const tracked = [...stage.querySelectorAll(".world div, .world span, .world i, .cursor, .click-ring")]
const snapshot = () => {
	const out = new Float64Array(tracked.length * 4)
	tracked.forEach((el, i) => {
		if (el.style.visibility === "hidden" || el.style.opacity === "0") {
			out[i * 4] = Number.NaN
			return
		}
		const r = el.getBoundingClientRect()
		out[i * 4] = r.left
		out[i * 4 + 1] = r.top
		out[i * 4 + 2] = r.right
		out[i * 4 + 3] = r.bottom
	})
	return out
}
const motion = (t0, t1) => {
	seek(t0)
	const a = snapshot()
	seek(t1)
	const b = snapshot()
	let max = 0
	for (let i = 0; i < a.length; i += 4) {
		if (Number.isNaN(a[i]) || Number.isNaN(b[i])) continue
		for (let k = 0; k < 4; k++) max = Math.max(max, Math.abs(a[i + k] - b[i + k]))
	}
	return max
}

window.__film = { seek, motion, duration: DURATION, fps: FPS, view, beats: BEATS, cues: CUES, bpm: grid.bpm }

if (rendering) {
	document.documentElement.classList.add("render")
	seek(Number(params.get("t")) || 0)
} else {
	document.documentElement.classList.add("preview")
	const frame = document.getElementById("frame")
	const fit = () => {
		const box = frame.getBoundingClientRect()
		const s = Math.min(box.width / view.width, box.height / view.height)
		stage.style.transform = `translate(${(box.width - view.width * s) / 2}px, ${(box.height - view.height * s) / 2}px) scale(${s})`
	}
	window.addEventListener("resize", fit)
	fit()
	const controls = createControls(document.getElementById("transport"), { seek, onFrame: () => {}, map })
	controls.hudToggle.checked = debug
	controls.guidesToggle.checked = params.get("guides") === "1"
	controls.hudToggle.onchange = () => hud.show(controls.hudToggle.checked)
	controls.guidesToggle.onchange = () => hud.guides(controls.guidesToggle.checked)
	controls.draw()
}

window.__film.ready = true
