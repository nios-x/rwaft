import { createScene } from "./scene.js"
import * as map from "./beatmap.js"
import { CUES, DURATION, FPS, SHOTS, grid } from "./beatmap.js"
import { createHud } from "../preview/hud.js"
import { createControls } from "../preview/controls.js"

/**
 * Boot for the keynote trailer (trailer.html). Same contract as the other
 * films: ?render gives the exact-size stage the renderer drives through
 * window.__film; otherwise a preview with the transport. ?debug=1 shows the HUD.
 */

const params = new URLSearchParams(location.search)
const rendering = params.has("render")

const faces = [
	['400 16px "Geist"', "Aa"], ['500 16px "Geist"', "Aa"], ['600 16px "Geist"', "Aa"], ['650 16px "Geist"', "Aa"], ['700 16px "Geist"', "Aa"], ['800 16px "Geist"', "Aa"],
	['400 12px "Geist Mono"', "Aa0…✓"], ['500 12px "Geist Mono"', "Aa0"], ['italic 400 30px "Instrument Serif"', "Aa"],
]
await Promise.all(faces.map(([font, sample]) => document.fonts.load(font, sample)))
await document.fonts.ready

// the demo site's stills (scripts/site.mjs), decoded before any shot shows them
const stills = [
	...["home", "home-violet", "page-home", "page-works", "page-about", "page-contact"].map((n) => `assets/kaizen-${n}.jpg`),
	...["kaizen-home", "kaizen-works", "kaizen-about", "kaizen-contact", "cafe-home", "cafe-menu", "habits-today", "habits-stats", "rsvp-invite", "rsvp-form"].map((n) => `assets/gallery-${n}.jpg`),
]
await Promise.all(stills.map((src) => {
	const img = new Image()
	img.src = src
	return img.decode()
}))

const stage = document.getElementById("stage")
const scene = createScene(stage)
await Promise.all([...stage.querySelectorAll("img")].map((img) => img.decode().catch(() => {})))

const view = scene.view
const hud = createHud(stage, view, map)
const debug = params.get("debug") === "1"
hud.show(debug)
hud.guides(params.get("guides") === "1")

const seek = (t, options) => {
	const info = scene.seek(t, options)
	if (!options || options.gl !== false) hud.update({ t, scene: { label: `${info.shot} · ${info.label}` }, cam: { s: 1, cx: 960, cy: 540 }, cursor: { world: [0, 0], screen: [0, 0] } })
	return info
}

/**
 * Warm-up. Chrome rasterises an image or canvas lazily the first time it is
 * shown, so every shot is displayed for two real frames before anything is
 * captured; the first captured frame then matches any later one.
 */
const nextFrame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
for (const shot of SHOTS) {
	seek(shot.from + (shot.to - shot.from) * 0.5)
	await nextFrame()
}
seek(0)
await nextFrame()

window.__film = { seek, motion: scene.motion, duration: DURATION, fps: FPS, view, cues: CUES, bpm: grid.bpm }

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
