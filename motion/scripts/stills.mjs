#!/usr/bin/env node
/**
 * Renders representative PNG frames for inspection.
 *
 *   node scripts/stills.mjs                 one still per beat (32) + a contact sheet
 *   node scripts/stills.mjs --at 3.1,10.25  specific times, in seconds
 *   node scripts/stills.mjs --frames 0,959  specific frame numbers at 60 fps
 *   --offset 0.42   where in each beat to sample (default: just before the next beat, when that beat's motion has settled)
 *   --debug         include the HUD      --scale 2   device pixel ratio      --format landscape
 *   --out out/stills   --film overview   (the product overview; default: the launch film)
 */
import { mkdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { parseArgs } from "node:util"
import { ROOT, startServer } from "./lib/server.mjs"
import { openFilm } from "./lib/browser.mjs"
import { FPS } from "../src/composition/config.js"

const { values } = parseArgs({
	options: {
		out: { type: "string" },
		at: { type: "string" },
		frames: { type: "string" },
		offset: { type: "string", default: "0.42" },
		debug: { type: "boolean", default: false },
		scale: { type: "string", default: "1" },
		format: { type: "string", default: "square" },
		film: { type: "string", default: "launch" },
		"no-contact": { type: "boolean", default: false },
	},
})

const FILMS = {
	launch: { entry: "index.html", out: "out/stills", beatmap: "../src/composition/beatmap.js" },
	overview: { entry: "overview.html", out: "out/overview-stills", beatmap: "../src/overview/beatmap.js" },
	trailer: { entry: "trailer.html", out: "out/trailer-stills", beatmap: "../src/trailer/beatmap.js" },
}
const film = FILMS[values.film]
if (!film) throw new Error(`Unknown film "${values.film}". Use: ${Object.keys(FILMS).join(", ")}`)
const { B, BEATS, grid, SHOTS } = await import(film.beatmap)
const out = resolve(ROOT, values.out ?? film.out)
await mkdir(out, { recursive: true })

const shots = []
if (values.at) for (const s of values.at.split(",")) shots.push({ name: `t-${Number(s).toFixed(3)}`, t: Number(s) })
if (values.frames) for (const f of values.frames.split(",")) shots.push({ name: `frame-${String(f).padStart(4, "0")}`, t: Number(f) / FPS })
const perShot = shots.length === 0 && Array.isArray(SHOTS)
if (perShot) {
	// One still per shot, 60 % of the way in (after its entrance has settled).
	SHOTS.forEach((shot, i) => shots.push({ name: `shot-${String(i + 1).padStart(2, "0")}`, t: shot.from + (shot.to - shot.from) * Number(values.offset === "0.42" ? 0.6 : values.offset), label: `${shot.id} · ${shot.label}` }))
}
const perBeat = shots.length === 0
if (perBeat) {
	const offset = Number(values.offset)
	for (let n = 1; n <= grid.beats; n++) shots.push({ name: `beat-${String(n).padStart(2, "0")}`, t: B(n) + offset, label: BEATS[n - 1] })
}

const { server, url } = await startServer()
const page = await openFilm(url, { entry: film.entry, format: values.format, scale: Number(values.scale), debug: values.debug })
try {
	for (const shot of shots) {
		const png = await page.frame(shot.t)
		await writeFile(join(out, `${shot.name}.png`), png)
		console.log(`${shot.name}.png  t=${shot.t.toFixed(3)}s${shot.label ? `  ${shot.label}` : ""}`)
	}
} finally {
	await page.close()
	server.close()
}

if (perShot && !values["no-contact"]) {
	const result = spawnSync("ffmpeg", [
		"-y", "-loglevel", "error", "-framerate", "1", "-i", join(out, "shot-%02d.png"),
		"-vf", `scale=480:-1:flags=lanczos,tile=7x${Math.ceil(SHOTS.length / 7)}:padding=6:margin=6:color=0x202024`, "-frames:v", "1", join(out, "contact.png"),
	], { stdio: "inherit" })
	if (result.status === 0) console.log(`contact sheet: ${join(out, "contact.png")}`)
}

if (perBeat && !values["no-contact"]) {
	const result = spawnSync("ffmpeg", [
		"-y", "-loglevel", "error", "-framerate", "1", "-i", join(out, "beat-%02d.png"),
		"-vf", `scale=420:-1:flags=lanczos,tile=8x${Math.ceil(grid.beats / 8)}:padding=6:margin=6:color=0x202024`, "-frames:v", "1", join(out, "contact.png"),
	], { stdio: "inherit" })
	if (result.status === 0) console.log(`contact sheet: ${join(out, "contact.png")}`)
}
