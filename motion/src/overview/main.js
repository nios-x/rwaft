import { createScene, VIEW } from "./scene.js"
import * as map from "./beatmap.js"
import { CUES, DURATION, grid } from "./beatmap.js"
import { FPS } from "../composition/config.js"
import { createHud } from "../preview/hud.js"
import { createControls } from "../preview/controls.js"

/**
 * Boot for the product overview (overview.html). Same contract as the launch
 * film: ?render for the exact-size stage the renderer drives through
 * window.__film, otherwise a preview with the transport; ?debug=1 for the HUD.
 */

const params = new URLSearchParams(location.search)
const rendering = params.has("render")

async function loadFonts() {
	const faces = [
		['400 16px "Geist"', "Aa"], ['500 16px "Geist"', "Aa"], ['600 16px "Geist"', "Aa"], ['700 16px "Geist"', "Aa"],
		['400 12px "Geist Mono"', "Aa0…"], ['400 12px "Geist Mono"', "│"],
		['700 50px "Bricolage Grotesque"', "What"], ['400 40px "Instrument Serif"', "Small"],
	]
	await Promise.all(faces.map(([font, sample]) => document.fonts.load(font, sample)))
	await document.fonts.ready
	await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => (img.onload = img.onerror = r)))))
}

const stage = document.getElementById("stage")
await loadFonts()
const BITMAPS = ["assets/demo-site-top.png", "assets/building-dark-still.png", "assets/live-check-still.png"]
window.__bitmaps = Object.fromEntries(await Promise.all(BITMAPS.map(async (src) => {
	const image = new Image()
	image.src = src
	await image.decode()
	return [src, image]
})))
const scene = createScene(stage)
await Promise.all([...stage.querySelectorAll("img")].map((img) => (img.complete ? img.decode().catch(() => {}) : new Promise((r) => (img.onload = img.onerror = r)))))
const view = VIEW
const hud = createHud(stage, view, map)
const debug = params.get("debug") === "1"
hud.show(debug)
hud.guides(params.get("guides") === "1")

const seek = (t) => {
	const info = scene.seek(t)
	hud.update(info)
	return info
}

/** Largest on-screen displacement of any visible element between t0 and t1 (see src/main.js). */
const tracked = [...stage.querySelectorAll(".ov-world *, .cap *, .end *, .ov-cursor, .ov-ring")].filter((el) => !(el instanceof SVGElement))
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

/**
 * Warm-up. Chrome sets up a bitmap's on-screen backing lazily, so the first
 * frame in which a canvas becomes visible would render it blank. Showing every
 * moment that contains one, for two real frames each, before anything is
 * captured makes the first captured frame identical to any later one.
 */
const nextFrame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
for (const t of [5.6, 12.1, 12.8, 17.8, 18.4]) {
	seek(t)
	await nextFrame()
}
seek(0)
await nextFrame()

window.__film = { seek, motion, duration: DURATION, fps: FPS, view, cues: CUES, bpm: grid.bpm }

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
