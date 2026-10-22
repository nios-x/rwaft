#!/usr/bin/env node
/**
 * Frame-by-frame renderer.
 *
 *   node scripts/render.mjs --preset final     1440², 60 fps, adaptive motion blur, crf 12 → out/rwaft-launch.mp4
 *   node scripts/render.mjs --preset preview   720², 30 fps, no blur, fast encode         → out/rwaft-launch-preview.mp4
 *   node scripts/render.mjs --preset sharp     1440², 60 fps, no blur (for debugging motion)
 *   node scripts/render.mjs --preset debug     720², 30 fps, HUD burned in
 *   add --film overview for the 1920×1080 product overview (→ out/rwaft-overview*.mp4)
 *
 * Overrides: --fps --samples --max-step --uniform --shutter --scale --workers --crf --x264-params
 *            --from --to --loops --format --music track.wav --music-gain 0.8 --no-audio --metronome
 *            --out file.mp4 --keep (keep the lossless segments) --encode-only (re-encode kept segments)
 *
 * How it works. Each worker opens the film in its own browser, renders a
 * contiguous run of frames by calling seek(t) for every temporal sample, and
 * pipes the PNGs straight into its own FFmpeg. FFmpeg averages each group of
 * samples (tmix) into one frame and writes a lossless FFV1 segment. The
 * segments are then concatenated and encoded once, with the sound track.
 *
 * Sample k of frame f is drawn at t = (f + shutter·((k + ½)/n − ½)) / fps,
 * i.e. spread evenly across a 180° shutter centred on the frame's own time.
 * Times outside the loop wrap, so frame 0's blur includes the loop's end.
 *
 * Sampling is adaptive. Before each frame the page reports how far anything
 * visible moves on screen during the shutter; the frame then gets the fewest
 * distinct samples (1, 2, 4, 8 or 16) that keep neighbouring samples within
 * --max-step px, so fast moves blur into a smooth smear instead of discrete
 * copies while still frames cost one capture. Every frame still hands FFmpeg
 * exactly --samples images (distinct samples repeated evenly), so one tmix
 * averages them all. --uniform turns this off.
 *
 * Encoding. The film is mostly near-black with soft gradients, where H.264
 * tends to band and smear low-contrast detail. The default x264 parameters
 * give dark flat areas more bits (aq-mode 3) and keep small residuals
 * (lower dead zones, no fast P-skip) so faint blur tails survive.
 *
 * Determinism. Frames depend only on t: scripts/lib/browser.mjs launches
 * Chromium so every raster tile is redrawn before a frame is captured, and a
 * frame rendered after a thousand others is bit-identical to one rendered
 * in a fresh page.
 */
import { spawn } from "node:child_process"
import { mkdir, readdir, rm, writeFile } from "node:fs/promises"
import { cpus } from "node:os"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { ROOT, startServer } from "./lib/server.mjs"
import { openFilm } from "./lib/browser.mjs"
import { writeSfx } from "./sfx.mjs"

const X264 = "aq-mode=3:aq-strength=0.9:no-fast-pskip=1:deadzone-inter=8:deadzone-intra=6"

const PRESETS = {
	final: { fps: 60, samples: 16, shutter: 0.5, scale: 1, crf: 12, x264: "slow", suffix: "" },
	sharp: { fps: 60, samples: 1, shutter: 0, scale: 1, crf: 14, x264: "medium", suffix: "-sharp" },
	preview: { fps: 30, samples: 1, shutter: 0, scale: 0.5, crf: 20, x264: "veryfast", suffix: "-preview" },
	debug: { fps: 30, samples: 1, shutter: 0, scale: 0.5, crf: 22, x264: "veryfast", debug: true, suffix: "-debug" },
}

/** The two films: the 16 s square launch loop and the 29 s product overview. */
const FILMS = {
	launch: { entry: "index.html", out: "out/rwaft-launch" },
	overview: { entry: "overview.html", out: "out/rwaft-overview" },
}

const { values } = parseArgs({
	options: {
		preset: { type: "string", default: "preview" },
		film: { type: "string", default: "launch" },
		fps: { type: "string" },
		samples: { type: "string" },
		shutter: { type: "string" },
		scale: { type: "string" },
		workers: { type: "string" },
		crf: { type: "string" },
		"x264-params": { type: "string", default: X264 },
		from: { type: "string" },
		to: { type: "string" },
		loops: { type: "string", default: "1" },
		format: { type: "string", default: "square" },
		music: { type: "string" },
		"music-gain": { type: "string", default: "0.85" },
		"no-audio": { type: "boolean", default: false },
		metronome: { type: "boolean", default: false },
		uniform: { type: "boolean", default: false },
		"max-step": { type: "string", default: "2.5" },
		debug: { type: "boolean" },
		out: { type: "string" },
		keep: { type: "boolean", default: false },
		"encode-only": { type: "boolean", default: false },
	},
})

const preset = PRESETS[values.preset]
if (!preset) throw new Error(`Unknown preset "${values.preset}". Use: ${Object.keys(PRESETS).join(", ")}`)
const film = FILMS[values.film]
if (!film) throw new Error(`Unknown film "${values.film}". Use: ${Object.keys(FILMS).join(", ")}`)
const num = (key, fallback) => (values[key] != null ? Number(values[key]) : fallback)
const cfg = {
	...preset,
	fps: num("fps", preset.fps),
	// A power of two, so every adaptive sample count divides it evenly.
	samples: 2 ** Math.floor(Math.log2(Math.max(1, num("samples", preset.samples)))),
	adaptive: !values.uniform,
	maxStep: Number(values["max-step"]),
	shutter: num("shutter", preset.shutter),
	scale: num("scale", preset.scale),
	crf: num("crf", preset.crf),
	debug: values.debug ?? preset.debug ?? false,
	loops: Math.max(1, Math.round(Number(values.loops))),
	out: resolve(ROOT, values.out ?? `${film.out}${preset.suffix}.mp4`),
}
if (cfg.samples > 1 && cfg.shutter <= 0) cfg.shutter = 0.5
const encodeOnly = values["encode-only"]

const run = (cmd, args, options = {}) => new Promise((done, fail) => {
	const child = spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"], ...options })
	child.on("error", fail)
	child.on("exit", (code) => (code === 0 ? done() : fail(new Error(`${cmd} exited with ${code}`))))
})

const work = join(ROOT, "out", ".render")
if (!encodeOnly) {
	await rm(work, { recursive: true, force: true })
	await mkdir(work, { recursive: true })
}

const { server, url } = await startServer()
const started = Date.now()

/** Renders frames [from, to) across workers into lossless segments, in order. */
async function renderSegments({ from, to, width, height }) {
	const total = to - from
	const workers = Math.max(1, Math.min(num("workers", Math.max(2, Math.floor(cpus().length / 3))), total))
	const sampling = cfg.samples > 1
		? `${cfg.adaptive ? `adaptive 1–${cfg.samples}` : cfg.samples} samples/frame (shutter ${cfg.shutter}${cfg.adaptive ? `, ≤${cfg.maxStep}px apart` : ""})`
		: "no motion blur"
	console.log(`rendering ${total} frames · ${width}×${height} · ${cfg.fps} fps · ${sampling} · ${workers} workers`)

	let done = 0
	let distinct = 0
	const tick = setInterval(() => {
		const elapsed = (Date.now() - started) / 1000
		const rate = done / Math.max(elapsed, 0.001)
		process.stdout.write(`\r  ${done}/${total} frames · ${rate.toFixed(1)} fps · eta ${rate > 0 ? Math.ceil((total - done) / rate) : "?"}s   `)
	}, 1000)

	const chunk = Math.ceil(total / workers)
	const segments = []
	await Promise.all(Array.from({ length: workers }, async (_, w) => {
		const first = from + w * chunk
		const last = Math.min(to, first + chunk)
		if (first >= last) return
		const segment = join(work, `seg-${String(w).padStart(3, "0")}.mkv`)
		segments[w] = segment

		const filter = cfg.samples > 1
			? `tmix=frames=${cfg.samples},select='eq(mod(n\\,${cfg.samples})\\,${cfg.samples - 1})',setpts=N/(${cfg.fps}*TB)`
			: `setpts=N/(${cfg.fps}*TB)`
		const ffmpeg = spawn("ffmpeg", [
			"-y", "-loglevel", "error",
			"-f", "image2pipe", "-framerate", String(cfg.fps * cfg.samples), "-c:v", "png", "-i", "-",
			"-vf", filter, "-r", String(cfg.fps), "-c:v", "ffv1", "-level", "3", "-g", "1", segment,
		], { stdio: ["pipe", "inherit", "inherit"] })
		const exited = new Promise((ok, fail) => ffmpeg.on("exit", (code) => (code === 0 ? ok() : fail(new Error(`segment ${w}: ffmpeg exited ${code}`)))))

		const page = await openFilm(url, { entry: film.entry, format: values.format, scale: cfg.scale, debug: cfg.debug })
		try {
			for (let f = first; f < last; f++) {
				let n = cfg.samples
				if (cfg.adaptive && cfg.samples > 1) {
					const half = cfg.shutter / 2 / cfg.fps
					const px = (await page.motion(f / cfg.fps - half, f / cfg.fps + half)) * cfg.scale
					const need = Math.ceil(px / cfg.maxStep)
					n = [1, 2, 4, 8, 16, 32].find((v) => v >= need && v <= cfg.samples) ?? cfg.samples
				}
				distinct += n
				for (let k = 0; k < n; k++) {
					const offset = cfg.samples > 1 ? cfg.shutter * ((k + 0.5) / n - 0.5) : 0
					const png = await page.frame((f + offset) / cfg.fps)
					for (let copy = 0; copy < cfg.samples / n; copy++) {
						if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once("drain", r))
					}
				}
				done++
			}
		} finally {
			ffmpeg.stdin.end()
			await page.close()
		}
		await exited
	}))
	clearInterval(tick)
	process.stdout.write(`\r  ${total}/${total} frames rendered in ${((Date.now() - started) / 1000).toFixed(1)}s · ${distinct} captures (${(distinct / total).toFixed(2)} per frame)          \n`)
	return segments.filter(Boolean)
}

/** Concatenates segments (repeating for --loops) and encodes them once, with sound. */
async function encode({ segments, from, to, width, height, meta }) {
	const list = join(work, "segments.txt")
	const lines = segments.map((s) => `file '${s.replace(/\\/g, "/")}'`)
	await writeFile(list, Array.from({ length: cfg.loops }, () => lines).flat().join("\n"))

	const inputs = ["-f", "concat", "-safe", "0", "-i", list]
	const audio = []
	const span = (to - from) / cfg.fps
	if (!values["no-audio"]) {
		const sfx = await writeSfx(join(work, "sfx.wav"), { cues: meta.cues, duration: meta.duration, bpm: meta.bpm, loops: cfg.loops, metronome: values.metronome })
		inputs.push("-ss", String(from / cfg.fps), "-t", String(span * cfg.loops), "-i", sfx)
		if (values.music) {
			inputs.push("-stream_loop", "-1", "-t", String(span * cfg.loops), "-i", resolve(values.music))
			// The limiter only catches a UI sound landing on a music peak; auto-level off, delay compensated so sync holds.
			audio.push("-filter_complex", `[2:a]volume=${values["music-gain"]}[m];[1:a][m]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.84:level=false:latency=true[a]`, "-map", "0:v", "-map", "[a]")
		} else audio.push("-map", "0:v", "-map", "1:a")
		audio.push("-c:a", "aac", "-b:a", "192k")
	}

	await mkdir(resolve(cfg.out, ".."), { recursive: true })
	await run("ffmpeg", [
		"-y", "-loglevel", "error", ...inputs,
		"-vf", `scale=${width}:${height}:flags=lanczos+accurate_rnd+full_chroma_int:out_color_matrix=bt709:out_range=tv,format=yuv420p`,
		"-c:v", "libx264", "-preset", cfg.x264, "-crf", String(cfg.crf), "-profile:v", "high",
		"-x264-params", values["x264-params"],
		"-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
		"-r", String(cfg.fps), "-movflags", "+faststart",
		...audio, cfg.out,
	])
	console.log(`wrote ${cfg.out}  (${((Date.now() - started) / 1000).toFixed(1)}s total)`)
}

try {
	// Probe the film once for its duration and pixel size.
	const probe = await openFilm(url, { entry: film.entry, format: values.format, scale: cfg.scale })
	const { duration, view } = probe.film
	const meta = probe.film
	await probe.close()

	const from = Math.round(num("from", 0) * cfg.fps)
	const to = Math.round(num("to", duration) * cfg.fps)
	const width = Math.round(view.width * cfg.scale)
	const height = Math.round(view.height * cfg.scale)

	let segments
	if (encodeOnly) {
		segments = (await readdir(work)).filter((name) => /^seg-\d+\.mkv$/.test(name)).sort().map((name) => join(work, name))
		if (segments.length === 0) throw new Error("No kept segments in out/.render. Render once with --keep first.")
		console.log(`encoding ${segments.length} kept segments`)
	} else {
		segments = await renderSegments({ from, to, width, height })
	}
	await encode({ segments, from, to, width, height, meta })
} finally {
	server.close()
	if (!values.keep && !encodeOnly) await rm(work, { recursive: true, force: true })
}
