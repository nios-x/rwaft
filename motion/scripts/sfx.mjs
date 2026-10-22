#!/usr/bin/env node
/**
 * Procedural UI sound effects, generated from the beat map's CUES.
 *
 *   node scripts/sfx.mjs [--out out/sfx.wav] [--loops 1] [--metronome]
 *
 * Every sound is synthesised from sines and seeded noise, so the track is
 * identical on every run and sample-aligned with the frames. Levels peak
 * around −8 dBFS: present, but low enough for music to sit on top.
 * `--metronome` adds a quiet click on every beat (accented on downbeats)
 * for checking sync before a music track exists.
 */
import { writeFile, mkdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { parseArgs } from "node:util"
import { fileURLToPath } from "node:url"
import { CUES, DURATION, grid } from "../src/composition/beatmap.js"
import { seeded } from "../src/engine/math.js"

const TAU = Math.PI * 2

function voice(seconds, sampleRate, fn) {
	const out = new Float32Array(Math.ceil(seconds * sampleRate))
	for (let i = 0; i < out.length; i++) out[i] = fn(i / sampleRate, i)
	return out
}

/** One-pole filters, enough to shape noise into clicks and air. */
const highpass = (cutoff, sampleRate) => {
	const a = Math.exp((-TAU * cutoff) / sampleRate)
	let prevIn = 0
	let prevOut = 0
	return (x) => (prevOut = a * (prevOut + x - prevIn), prevIn = x, prevOut)
}

/** A state-variable band-pass whose centre can move per sample. */
const bandpass = (q, sampleRate) => {
	let low = 0
	let band = 0
	return (x, centre) => {
		const f = 2 * Math.sin((Math.PI * Math.min(centre, sampleRate / 6)) / sampleRate)
		low += f * band
		const high = x - low - q * band
		band += f * high
		return band
	}
}

const VOICES = {
	click(sr, rand) {
		const hp = highpass(2400, sr)
		return voice(0.06, sr, (t) =>
			0.55 * hp(rand() * 2 - 1) * Math.exp(-t / 0.0022) +
			0.32 * Math.sin(TAU * (2100 - 9000 * t) * t) * Math.exp(-t / 0.011) +
			0.22 * Math.sin(TAU * 150 * t) * Math.exp(-t / 0.018))
	},
	key(sr, rand) {
		const hp = highpass(1500, sr)
		return voice(0.05, sr, (t) =>
			0.32 * hp(rand() * 2 - 1) * Math.exp(-t / 0.0035) +
			0.2 * Math.sin(TAU * 820 * t) * Math.exp(-t / 0.014))
	},
	tap(sr) {
		return voice(0.25, sr, (t) => {
			const env = Math.min(1, t / 0.002) * Math.exp(-t / 0.055)
			return env * (0.42 * Math.sin(TAU * 1320 * t) + 0.08 * Math.sin(TAU * 2640 * t))
		})
	},
	tick(sr) {
		return voice(0.16, sr, (t) => {
			const env = Math.min(1, t / 0.0015) * Math.exp(-t / 0.03)
			return env * (0.3 * Math.sin(TAU * 2093 * t) + 0.08 * Math.sin(TAU * 4186 * t))
		})
	},
	ping(sr) {
		return voice(1.4, sr, (t) => {
			const env = Math.min(1, t / 0.005) * Math.exp(-t / 0.32)
			const wobble = 1 + 0.0015 * Math.sin(TAU * 5 * t)
			return env * (0.3 * Math.sin(TAU * 1567.98 * wobble * t) + 0.13 * Math.sin(TAU * 2349.32 * t) + 0.06 * Math.sin(TAU * 783.99 * t))
		})
	},
	success(sr) {
		const note = (t, start, freq, gain, decay) => {
			const u = t - start
			if (u < 0) return 0
			return gain * Math.min(1, u / 0.006) * Math.exp(-u / decay) * (Math.sin(TAU * freq * u) + 0.12 * Math.sin(TAU * freq * 2 * u))
		}
		return voice(1.6, sr, (t) =>
			note(t, 0, 1318.51, 0.28, 0.42) + note(t, 0.085, 1975.53, 0.24, 0.5) + note(t, 0.17, 2637.02, 0.12, 0.45) + note(t, 0.02, 659.25, 0.1, 0.6))
	},
	whoosh(sr, rand) {
		const bpL = bandpass(0.9, sr)
		const dur = 0.46
		return voice(dur, sr, (t) => {
			const u = t / dur
			const env = Math.sin(Math.PI * Math.min(1, u ** 0.75)) ** 2
			return 0.5 * env * bpL(rand() * 2 - 1, 450 + 2100 * u ** 1.3)
		})
	},
	swell(sr, rand) {
		const bp = bandpass(1.2, sr)
		const dur = 0.62
		return voice(dur, sr, (t) => {
			const u = t / dur
			const env = Math.sin(Math.PI * u) ** 2
			return env * (0.36 * bp(rand() * 2 - 1, 280 + 1100 * u) + 0.035 * Math.sin(TAU * 440 * t) + 0.02 * Math.sin(TAU * 660 * t))
		})
	},
	beat(sr) {
		return voice(0.05, sr, (t) => 0.25 * Math.sin(TAU * 1000 * t) * Math.exp(-t / 0.008))
	},
	downbeat(sr) {
		return voice(0.06, sr, (t) => 0.35 * Math.sin(TAU * 1500 * t) * Math.exp(-t / 0.01))
	},
}

/** Pans by kind: pointer sounds a touch right of centre, air a touch wide. */
const PAN = { click: 0.12, key: 0.08, tap: 0.1, tick: -0.05, ping: 0, success: 0, whoosh: -0.1, swell: 0.05, beat: 0, downbeat: 0 }

export function synthesize({ cues = CUES, duration = DURATION, bpm = grid.bpm, loops = 1, sampleRate = 48_000, metronome = false, peak = 0.4 } = {}) {
	const total = Math.round(duration * loops * sampleRate)
	const left = new Float32Array(total)
	const right = new Float32Array(total)
	const all = [...cues]
	const beats = Math.round((duration * bpm) / 60)
	if (metronome) for (let b = 1; b <= beats; b++) all.push({ at: ((b - 1) * 60) / bpm, kind: (b - 1) % 4 === 0 ? "downbeat" : "beat", gain: 1 })

	all.forEach((cue, index) => {
		const rand = seeded(1000 + index)
		const data = VOICES[cue.kind](sampleRate, rand)
		const pan = PAN[cue.kind] ?? 0
		const gl = cue.gain * Math.cos(((pan + 1) * Math.PI) / 4)
		const gr = cue.gain * Math.sin(((pan + 1) * Math.PI) / 4)
		for (let loop = 0; loop < loops; loop++) {
			const start = Math.round((cue.at + loop * duration) * sampleRate)
			for (let i = 0; i < data.length; i++) {
				// Tails that run past the end wrap to the start, so a looped file is seamless.
				const at = (start + i) % total
				left[at] += data[i] * gl
				right[at] += data[i] * gr
			}
		}
	})

	let max = 0
	for (let i = 0; i < total; i++) max = Math.max(max, Math.abs(left[i]), Math.abs(right[i]))
	const scale = max > 0 ? peak / max : 1
	for (let i = 0; i < total; i++) {
		left[i] *= scale
		right[i] *= scale
	}
	return { left, right, sampleRate }
}

export function encodeWav({ left, right, sampleRate }) {
	const frames = left.length
	const buffer = Buffer.alloc(44 + frames * 4)
	buffer.write("RIFF", 0)
	buffer.writeUInt32LE(36 + frames * 4, 4)
	buffer.write("WAVEfmt ", 8)
	buffer.writeUInt32LE(16, 16)
	buffer.writeUInt16LE(1, 20)
	buffer.writeUInt16LE(2, 22)
	buffer.writeUInt32LE(sampleRate, 24)
	buffer.writeUInt32LE(sampleRate * 4, 28)
	buffer.writeUInt16LE(4, 32)
	buffer.writeUInt16LE(16, 34)
	buffer.write("data", 36)
	buffer.writeUInt32LE(frames * 4, 40)
	for (let i = 0; i < frames; i++) {
		const l = Math.max(-1, Math.min(1, left[i]))
		const r = Math.max(-1, Math.min(1, right[i]))
		buffer.writeInt16LE(Math.round(l * 32767), 44 + i * 4)
		buffer.writeInt16LE(Math.round(r * 32767), 46 + i * 4)
	}
	return buffer
}

export async function writeSfx(path, options) {
	await mkdir(dirname(path), { recursive: true })
	await writeFile(path, encodeWav(synthesize(options)))
	return path
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const { values } = parseArgs({
		options: {
			out: { type: "string", default: "out/sfx.wav" },
			loops: { type: "string", default: "1" },
			metronome: { type: "boolean", default: false },
		},
	})
	const path = resolve(fileURLToPath(new URL("..", import.meta.url)), values.out)
	await writeSfx(path, { loops: Number(values.loops), metronome: values.metronome })
	console.log(`wrote ${path}`)
}
