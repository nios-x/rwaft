#!/usr/bin/env node
/**
 * Original music for the product overview, synthesised from its beat map.
 *
 *   node scripts/music.mjs [--out out/overview-music.wav] [--drive 0]
 *
 * A 120 BPM beat in D minor in the style of modern product films: an 808 sub
 * bass with kick, clap and trap hats under electric-piano chords, a pad and a
 * plucked arpeggio. The arrangement follows the film: keys alone under the
 * opening text cards, the drop as the app window lands, drums out while rwaft
 * repairs its build, the arpeggio once the site is live, one last hit on the
 * tagline and a held chord under the end card. Every note is placed from the
 * overview's beat map and every noise source is seeded, so the track is the same
 * on every run and stays on the cuts if the film is retimed.
 *
 * Mastered to about −14 LUFS with peaks under −1 dBFS, ready to lay under the
 * UI sounds:
 *   node scripts/render.mjs --film overview --preset final --music out/overview-music.wav --music-gain 1
 */
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { parseArgs } from "node:util"
import { fileURLToPath } from "node:url"
import { DURATION, T, grid } from "../src/overview/beatmap.js"
import { seeded } from "../src/engine/math.js"
import { encodeWav } from "./sfx.mjs"

const TAU = Math.PI * 2
const SR = 48_000
const N = Math.round(DURATION * SR)

// ── Time ────────────────────────────────────────────────────────────────────

const BAR = grid.beatsPerBar * grid.spb
const STEP = grid.spb / 4
/** The drop lands with the app window; the music's bars count from there. */
const DROP = T.home
const at = (bar, step = 0) => DROP + bar * BAR + step * STEP

/** One chord per bar from the drop to the tagline, which gets the last hit. */
const GROOVE = ["Dm", "Bb", "F", "C", "Dm", "Bb", "F", "C", "Dm", "Bb", "C"]
if (Math.abs(at(GROOVE.length) - T.tagline) > 1e-6) throw new Error("GROOVE no longer ends on T.tagline; retime it")

/** While rwaft repairs its build the drums drop out, back on the next bar. */
const REPAIR_FROM = T.repair
const REPAIR_TO = at(Math.ceil((T.repair - DROP) / BAR))
const inRepair = (t) => t >= REPAIR_FROM && t < REPAIR_TO
/** The arpeggio arrives with the live site. */
const ARP_FROM = REPAIR_TO
/** A thirty-second of silence before each drop. */
const GAPS = [[DROP - STEP / 2, DROP], [T.tagline - STEP / 2, T.tagline]]

// ── Harmony ─────────────────────────────────────────────────────────────────

const PITCH = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 }
const hz = (note) => {
	const [, name, octave] = /^([A-G]b?)(\d)$/.exec(note)
	return 440 * 2 ** ((PITCH[name] + 12 * (Number(octave) + 1) - 69) / 12)
}

/** Root for the 808, a close voicing for keys and pad, four tones for the arpeggio. */
const CHORDS = {
	Dm: { root: "D2", keys: ["F3", "A3", "C4", "E4"], arp: ["A4", "D5", "F5", "A5"] },
	Bb: { root: "Bb1", keys: ["F3", "A3", "Bb3", "D4"], arp: ["A4", "Bb4", "D5", "F5"] },
	F: { root: "F2", keys: ["A3", "C4", "F4", "G4"], arp: ["A4", "C5", "F5", "A5"] },
	C: { root: "C2", keys: ["G3", "C4", "D4", "E4"], arp: ["G4", "C5", "E5", "G5"] },
	Fmaj9: { root: "F1", keys: ["F3", "A3", "C4", "E4", "G4"], arp: [] },
}

// ── DSP ─────────────────────────────────────────────────────────────────────

const smoothstep = (x) => x * x * (3 - 2 * x)

function voice(seconds, fn) {
	const out = new Float32Array(Math.ceil(seconds * SR))
	for (let i = 0; i < out.length; i++) out[i] = fn(i / SR, i)
	return out
}

/** RBJ biquad (low-pass, high-pass, or band-pass at 0 dB peak). `set` can be called again to sweep. */
function biquad(type, freq, q = 0.707) {
	let b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0
	const filter = {
		set(kind, f, quality = q) {
			const w = (TAU * Math.min(f, SR * 0.45)) / SR
			const cos = Math.cos(w)
			const alpha = Math.sin(w) / (2 * quality)
			const a0 = 1 + alpha
			const [n0, n1, n2] = kind === "lp" ? [(1 - cos) / 2, 1 - cos, (1 - cos) / 2]
				: kind === "hp" ? [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2]
				: [alpha, 0, -alpha]
			b0 = n0 / a0; b1 = n1 / a0; b2 = n2 / a0; a1 = (-2 * cos) / a0; a2 = (1 - alpha) / a0
			return filter
		},
		run(x) {
			const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
			x2 = x1; x1 = x; y2 = y1; y1 = y
			return y
		},
	}
	return filter.set(type, freq, q)
}

/** Band-limited saw (polyBLEP), phase in [0, 1). */
function saw(phase, dt) {
	let v = 2 * phase - 1
	if (phase < dt) {
		const x = phase / dt
		v -= x + x - x * x - 1
	} else if (phase > 1 - dt) {
		const x = (phase - 1) / dt
		v -= x * x + x + x + 1
	}
	return v
}

// ── Instruments ─────────────────────────────────────────────────────────────

/** 808: a pitch-dropped sine with some drive, so it still reads on phone speakers. Optionally glides in. */
function sub808(freq, length, { from = 0, glide = 0.06 } = {}) {
	let phase = 0
	return voice(length + 0.06, (t) => {
		const f = from && t < glide ? from * (freq / from) ** smoothstep(t / glide) : freq
		phase += (TAU * f * 2 ** ((9 * Math.exp(-t / 0.016)) / 12)) / SR
		const s = Math.sin(phase)
		// Drive and an octave keep it audible where the fundamental isn't (phones, laptops).
		const tone = (0.55 * Math.tanh(3.5 * s)) / Math.tanh(3.5) + 0.25 * s + 0.3 * Math.sin(2 * phase)
		const release = t > length ? Math.max(0, 1 - (t - length) / 0.06) : 1
		return tone * Math.min(1, t / 0.002) * (0.35 + 0.65 * Math.exp(-t / 0.7)) * release
	})
}

function kick(rand) {
	const click = biquad("hp", 2500)
	return voice(0.3, (t) =>
		Math.sin(TAU * (45 * t + 120 * 0.028 * (1 - Math.exp(-t / 0.028)))) * Math.exp(-t / 0.09) * Math.min(1, t / 0.001) +
		0.3 * click.run(rand() * 2 - 1) * Math.exp(-t / 0.003))
}

/** Three quick bursts and a tail, over a little body, with some sizzle on top. */
function clap(rand, tail = 0.13) {
	const bp = biquad("bp", 1900, 0.8)
	const sizzle = biquad("hp", 5000)
	return voice(0.5, (t) => {
		let burst = 0
		for (const start of [0, 0.009, 0.019]) if (t >= start) burst = Math.max(burst, Math.exp(-(t - start) / 0.006))
		const decay = t >= 0.025 ? Math.exp(-(t - 0.025) / tail) : 0
		const noise = rand() * 2 - 1
		return 1.5 * bp.run(noise) * (0.9 * burst + 0.55 * decay) + 0.8 * sizzle.run(noise) * (0.6 * burst + 0.4 * decay) +
			0.3 * Math.sin(TAU * 185 * t) * Math.exp(-t / 0.045)
	})
}

const HAT_PARTIALS = [452, 670, 813, 1150, 1188, 1760]
function hat(rand, decay) {
	const hp1 = biquad("hp", 7000, 0.7)
	const hp2 = biquad("hp", 7000, 0.7)
	return voice(decay * 7, (t) => {
		let metal = 0
		for (const f of HAT_PARTIALS) metal += Math.sin(TAU * f * t) > 0 ? 1 : -1
		return hp2.run(hp1.run(0.7 * (rand() * 2 - 1) + 0.05 * metal)) * Math.exp(-t / decay) * Math.min(1, t / 0.0004)
	})
}

/** Electric piano: one FM pair whose brightness falls away, with a short bell on the strike. */
function epiano(freq, length, velocity) {
	return voice(length + 0.5, (t) => {
		const index = velocity * (1.2 * Math.exp(-t / 0.3) + 0.2)
		const tone = Math.sin(TAU * freq * t + index * Math.sin(TAU * freq * t))
		const bell = 0.12 * velocity * Math.sin(TAU * freq * 4 * t) * Math.exp(-t / 0.05)
		const release = t > length ? Math.exp(-(t - length) / 0.1) : 1
		return (tone + bell) * Math.min(1, t / 0.003) * Math.exp(-t / 1.6) * release
	})
}

/** Pad: detuned saws, slow in and out; filtered on its bus. */
function padNote(freq, length, cents) {
	const phases = cents.map((_, k) => k / cents.length)
	const steps = cents.map((c) => (freq * 2 ** (c / 1200)) / SR)
	return voice(length + 1, (t) => {
		let s = 0
		for (let k = 0; k < phases.length; k++) {
			phases[k] += steps[k]
			if (phases[k] >= 1) phases[k] -= 1
			s += saw(phases[k], steps[k])
		}
		const release = t > length ? Math.exp(-(t - length) / 0.35) : 1
		return (s / phases.length) * Math.min(1, t / 0.35) * release
	})
}

/** Sixteenth-note shaker: a steady high shimmer between the hats. */
function shaker(rand) {
	const bp = biquad("bp", 7500, 1.5)
	return voice(0.12, (t) => bp.run(rand() * 2 - 1) * Math.min(1, t / 0.003) * Math.exp(-t / 0.022))
}

/** A soft sine under the intro chords, so the opening isn't thin before the 808 arrives. */
function softBass(freq, length) {
	return voice(length + 0.3, (t) => {
		const release = t > length ? Math.exp(-(t - length) / 0.08) : 1
		return (Math.sin(TAU * freq * t) + 0.25 * Math.sin(TAU * 2 * freq * t)) * Math.min(1, t / 0.25) * release
	})
}

function pluck(freq, velocity) {
	return voice(0.7, (t) =>
		velocity * Math.min(1, t / 0.0015) * Math.exp(-t / 0.18) * Math.sin(TAU * freq * t + 1.1 * Math.exp(-t / 0.04) * Math.sin(TAU * 2 * freq * t)))
}

function riser(rand, seconds) {
	const bp = biquad("bp", 350, 1.4)
	return voice(seconds, (t, i) => {
		const u = t / seconds
		if (i % 32 === 0) bp.set("bp", 350 * 20 ** (u ** 1.6), 1.4)
		return bp.run(rand() * 2 - 1) * u ** 2.2
	})
}

function crash(rand) {
	const hp = biquad("hp", 3500)
	const lp = biquad("lp", 12_000)
	return voice(2.4, (t, i) => {
		if (i % 64 === 0) lp.set("lp", 3000 + 9000 * Math.exp(-t / 0.5))
		return lp.run(hp.run(rand() * 2 - 1)) * Math.exp(-t / 0.55) * Math.min(1, t / 0.002)
	})
}

// ── Buses ───────────────────────────────────────────────────────────────────

const bus = () => ({ l: new Float32Array(N), r: new Float32Array(N) })
const bass = bus(), drums = bus(), keys = bus(), pad = bus(), arp = bus(), fx = bus(), send = bus()

/** Adds a mono voice to a bus (equal-power pan) and, scaled by `reverb`, to the reverb send. */
function place(target, start, data, gain = 1, pan = 0, reverb = 0) {
	const first = Math.round(start * SR)
	const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4)
	const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4)
	for (let i = 0; i < data.length; i++) {
		const j = first + i
		if (j < 0) continue
		if (j >= N) break
		target.l[j] += data[i] * gl
		target.r[j] += data[i] * gr
		if (reverb) {
			send.l[j] += data[i] * gl * reverb
			send.r[j] += data[i] * gr * reverb
		}
	}
}

let seed = 1
const rng = () => seeded(7000 + seed++)
const kicks = []

function chordKeys(name, start, length, velocity) {
	const notes = CHORDS[name].keys
	notes.forEach((note, k) => {
		const pan = notes.length > 1 ? -0.3 + (0.6 * k) / (notes.length - 1) : 0
		place(keys, start, epiano(hz(note), length, velocity), 0.135 * velocity, pan, 0.22)
	})
}

/** The pad doubles the keys an octave up, clear of the 808's harmonics. */
function chordPad(name, start, length, gain) {
	for (const note of CHORDS[name].keys) {
		place(pad, start, padNote(2 * hz(note), length, [-9, 0, 6]), 0.045 * gain, -0.65, 0.3)
		place(pad, start, padNote(2 * hz(note), length, [-5, 3, 10]), 0.045 * gain, 0.65, 0.3)
	}
}

function bassAndKick(t, freq, length, options) {
	place(bass, t, sub808(freq, length, options), 0.42)
	if (options?.from) return
	place(drums, t, kick(rng()), 0.45)
	kicks.push(t)
}

/** Claps in sixteenths, then thirty-seconds, rising into the silence before a drop. */
function buildRoll(from, to) {
	const end = to - STEP / 2
	const half = from + (end - from) / 2
	let t = from
	while (t < end - 1e-9) {
		const u = (t - from) / (end - from)
		place(drums, t, clap(rng(), 0.05), 0.2 + 0.45 * u ** 1.5, 0.05, 0.12)
		t += t < half ? STEP : STEP / 2
	}
	place(fx, from - BAR / 4, riser(rng(), end - from + BAR / 4), 0.16, -0.5, 0.2)
	place(fx, from - BAR / 4, riser(rng(), end - from + BAR / 4), 0.16, 0.5, 0.2)
}

// ── Arrangement ─────────────────────────────────────────────────────────────

// Intro: keys and pad alone under the text cards, then the roll into the drop.
const INTRO_SPLIT = DROP - BAR / 2
chordKeys("Bb", 0, INTRO_SPLIT - 0.08, 0.85)
chordPad("Bb", 0, INTRO_SPLIT, 0.9)
place(bass, 0, softBass(hz("Bb1"), INTRO_SPLIT - 0.05), 0.2)
chordKeys("C", INTRO_SPLIT, DROP - INTRO_SPLIT - STEP, 0.8)
chordPad("C", INTRO_SPLIT, DROP - STEP / 2 - INTRO_SPLIT, 1)
place(bass, INTRO_SPLIT, softBass(hz("C2"), DROP - STEP / 2 - INTRO_SPLIT), 0.2)
buildRoll(INTRO_SPLIT, DROP)
for (let t = INTRO_SPLIT; t < DROP - STEP / 2 - 1e-9; t += STEP) {
	place(drums, t, hat(rng(), 0.025), 0.12 + 0.25 * ((t - INTRO_SPLIT) / (DROP - INTRO_SPLIT)), 0.2)
}

GROOVE.forEach((name, bar) => {
	const chord = CHORDS[name]
	const start = at(bar)
	const turn = bar % 4 === 3
	const last = bar === GROOVE.length - 1
	const skip = (t) => inRepair(t)

	// 808 and kick, the 808 held until the next hit (or through the repair).
	const hits = turn ? [0, 6, 10, 14] : [0, 6, 10]
	hits.forEach((step, h) => {
		const t = at(bar, step)
		if (skip(t)) return
		const next = h + 1 < hits.length ? at(bar, hits[h + 1]) : at(bar + 1)
		const length = (next > REPAIR_FROM && t < REPAIR_FROM ? REPAIR_TO : last && h === hits.length - 1 ? GAPS[1][0] : next) - t - 0.02
		const root = hz(chord.root)
		if (turn && step === 14) bassAndKick(t, root * 2, length, { from: root })
		else bassAndKick(t, root, length)
	})

	// Clap on 2 and 4, a ghost before turnarounds; the last bar's second half builds instead.
	for (const step of last ? [4] : [4, 12]) if (!skip(at(bar, step))) place(drums, at(bar, step), clap(rng()), 0.7, 0, 0.2)
	if (turn && !skip(at(bar, 15))) place(drums, at(bar, 15), clap(rng(), 0.05), 0.2, 0.1, 0.1)
	if (last) buildRoll(at(bar, 8), T.tagline)

	// Hats: eighths, sixteenths late in odd bars, a thirty-second roll into turnarounds.
	const hatSteps = []
	for (let s = 0; s < 16; s += 2) hatSteps.push([s, s % 4 === 0 ? 1 : 0.6])
	if (bar % 4 === 1) hatSteps.push([13, 0.4], [15, 0.45])
	if (turn && bar !== 3) for (let k = 0; k < 8; k++) hatSteps.push([12 + k / 2, 0.35 + 0.5 * (k / 7)])
	for (const [s, v] of hatSteps) {
		const t = at(bar, s)
		if (skip(t) || (last && s >= 8)) continue
		place(drums, t, hat(rng(), 0.034), 0.7 * v, 0.2)
	}
	if (bar >= 4 && !turn && !last) place(drums, at(bar, 14), hat(rng(), 0.16), 0.32, -0.15, 0.1)
	for (let s = 0; s < (last ? 8 : 16); s++) if (!skip(at(bar, s))) place(drums, at(bar, s), shaker(rng()), s % 2 ? 0.5 : 0.3, -0.35)

	// Keys: stabs on the 808's rhythm, the second one held through the repair.
	const stabs = last ? [[0, 7, 0.8], [8, 7, 0.7]] : [[0, 5, 0.8], [6, 3, 0.55], [10, 5, 0.65]]
	for (const [step, steps, velocity] of stabs) {
		const t = at(bar, step)
		if (skip(t)) continue
		const length = t < REPAIR_FROM && t + steps * STEP > REPAIR_FROM - STEP ? REPAIR_TO - t - 0.05 : steps * STEP
		chordKeys(name, t, length, velocity)
	}

	chordPad(name, start, last ? GAPS[1][0] - start : BAR, bar >= 8 ? 0.95 : 0.65)

	// Arpeggio in eighths once the site is live.
	if (start >= ARP_FROM) {
		const order = [0, 1, 2, 3, 1, 2, 3, 2]
		order.forEach((k, i) => {
			const t = at(bar, i * 2)
			if (last && t >= GAPS[1][0]) return
			place(arp, t, pluck(hz(chord.arp[k]), i % 2 ? 0.65 : 0.95), 0.14, 0, 0.25)
		})
	}
})

// The last hit on the tagline, then the chord rings out under the end card.
const END = DURATION - T.tagline
bassAndKick(T.tagline, hz(CHORDS.Fmaj9.root), END)
place(bass, T.tagline, sub808(hz("F2"), 1.2), 0.15)
chordKeys("Fmaj9", T.tagline, 3.2, 0.9)
chordPad("Fmaj9", T.tagline, END, 1.1)
;["C6", "A5", "G5", "F5"].forEach((note, i) => place(arp, T.tagline + i * grid.spb / 2, pluck(hz(note), 0.8 - i * 0.1), 0.1, 0, 0.3))

for (const [t, gain] of [[DROP, 0.3], [REPAIR_TO, 0.18], [at(8), 0.26], [T.tagline, 0.5]]) {
	place(fx, t, crash(rng()), gain, -0.2, 0.35)
	place(fx, t, crash(rng()), gain, 0.2, 0.35)
}

// ── Processing ──────────────────────────────────────────────────────────────

/** Keys and pad open up through the intro and muffle while the build is broken. */
function toneAt(t) {
	if (t < DROP) return 1100 * (4000 / 1100) ** smoothstep(t / DROP)
	if (t >= REPAIR_FROM && t < REPAIR_TO) {
		const down = smoothstep(Math.min(1, (t - REPAIR_FROM) / 0.12))
		const up = smoothstep(Math.max(0, (t - (REPAIR_TO - grid.spb)) / grid.spb))
		return 7000 * (650 / 7000) ** (down * (1 - up))
	}
	return 7000
}

function highpass(target, cutoff) {
	const fl = biquad("hp", cutoff)
	const fr = biquad("hp", cutoff)
	for (let n = 0; n < N; n++) {
		target.l[n] = fl.run(target.l[n])
		target.r[n] = fr.run(target.r[n])
	}
}

function sweep(target, cutoffAt, q = 0.6) {
	const fl = biquad("lp", cutoffAt(0), q)
	const fr = biquad("lp", cutoffAt(0), q)
	for (let n = 0; n < N; n++) {
		if (n % 32 === 0) {
			const f = cutoffAt(n / SR)
			fl.set("lp", f, q)
			fr.set("lp", f, q)
		}
		target.l[n] = fl.run(target.l[n])
		target.r[n] = fr.run(target.r[n])
	}
}

/** Pumps a bus under every kick, the way producers sidechain pads to the kick. */
function duck(target, depth) {
	let k = 0
	for (let n = 0; n < N; n++) {
		const t = n / SR
		while (k + 1 < kicks.length && kicks[k + 1] <= t) k++
		const since = kicks.length && kicks[k] <= t ? t - kicks[k] : Infinity
		const env = since < 0.004 ? since / 0.004 : Math.exp(-(since - 0.004) / 0.15)
		const g = 1 - depth * env
		target.l[n] *= g
		target.r[n] *= g
	}
}

/** Dotted-eighth ping-pong for the arpeggio, darker on every repeat. */
function pingPong(source, mix = 0.35, feedback = 0.42) {
	const d = Math.round(grid.spb * 0.75 * SR)
	const wl = new Float32Array(N)
	const wr = new Float32Array(N)
	const tone = biquad("lp", 3800)
	for (let n = d; n < N; n++) {
		wl[n] = tone.run((source.l[n - d] + source.r[n - d]) / 2 + feedback * wr[n - d])
		wr[n] = wl[n - d]
	}
	for (let n = 0; n < N; n++) {
		source.l[n] += mix * wl[n]
		source.r[n] += mix * wr[n]
	}
}

/** Freeverb, with a 25 ms pre-delay and the lows kept out of it. */
function reverb(input, { room = 0.84, damp = 0.3, wet = 2.2 } = {}) {
	const scale = SR / 44_100
	const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]
	const ALLPASS = [556, 441, 341, 225]
	const fb = room * 0.28 + 0.7
	const d = damp * 0.4
	const line = (len) => ({ buf: new Float32Array(Math.round(len * scale)), i: 0, store: 0 })
	const channel = (spread) => ({ combs: COMBS.map((l) => line(l + spread)), allpass: ALLPASS.map((l) => line(l + spread)) })
	const step = (c, x) => {
		let out = 0
		for (const cb of c.combs) {
			const y = cb.buf[cb.i]
			cb.store = y * (1 - d) + cb.store * d
			cb.buf[cb.i] = x + cb.store * fb
			if (++cb.i >= cb.buf.length) cb.i = 0
			out += y
		}
		for (const ap of c.allpass) {
			const b = ap.buf[ap.i]
			ap.buf[ap.i] = out + b * 0.5
			if (++ap.i >= ap.buf.length) ap.i = 0
			out = b - out
		}
		return out
	}
	const left = channel(0)
	const right = channel(23)
	const hp = biquad("hp", 280)
	const pre = Math.round(0.025 * SR)
	const out = bus()
	for (let n = 0; n < N; n++) {
		const x = n >= pre ? hp.run((input.l[n - pre] + input.r[n - pre]) * 0.015) : 0
		out.l[n] = step(left, x) * wet
		out.r[n] = step(right, x) * wet
	}
	return out
}

/** Stereo-linked look-ahead limiter: gain ramps down over 5 ms before a peak, recovers over ~80 ms. */
function limit(master, ceiling) {
	const look = Math.round(0.005 * SR)
	const want = new Float32Array(N)
	for (let n = 0; n < N; n++) {
		const peak = Math.max(Math.abs(master.l[n]), Math.abs(master.r[n]))
		want[n] = peak > ceiling ? ceiling / peak : 1
	}
	// Minimum over the next `look` samples (monotonic deque), then averaged over the last `look`.
	const ahead = new Float32Array(N)
	const q = new Int32Array(N)
	let head = 0, tail = 0
	for (let n = N - 1; n >= 0; n--) {
		while (tail > head && want[q[tail - 1]] >= want[n]) tail--
		q[tail++] = n
		while (q[head] > n + look) head++
		ahead[n] = want[q[head]]
	}
	const release = 1 - Math.exp(-1 / (0.08 * SR))
	let sum = look // the window starts full of unity gain
	let g = 1
	for (let n = 0; n < N; n++) {
		sum += ahead[n] - (n >= look ? ahead[n - look] : 1)
		const ramp = Math.min(ahead[n], sum / look)
		g = ramp < g ? ramp : g + (ramp - g) * release
		master.l[n] *= g
		master.r[n] *= g
	}
}

export function compose({ drive = 0 } = {}) {
	sweep(keys, toneAt)
	sweep(pad, (t) => Math.min(toneAt(t), 2600), 0.5)
	highpass(keys, 140)
	highpass(pad, 320)
	duck(keys, 0.25)
	duck(pad, 0.5)
	duck(arp, 0.3)
	pingPong(arp)
	const wet = reverb(send)

	const master = bus()
	const gain = 10 ** (drive / 20)
	const hp = [biquad("hp", 28), biquad("hp", 28)]
	const fadeFrom = DURATION - 1.6
	const RAMP = 0.004
	/** Silent through each gap, with 4 ms ramps so the cut doesn't click. */
	const gate = (t) => {
		for (const [from, to] of GAPS) {
			if (t >= from - RAMP && t < from) return (from - t) / RAMP
			if (t >= from && t < to - RAMP) return 0
			if (t >= to - RAMP && t < to) return (t - (to - RAMP)) / RAMP
		}
		return 1
	}
	for (let n = 0; n < N; n++) {
		const t = n / SR
		let g = gain * Math.min(1, t / 0.005) * gate(t)
		if (t > fadeFrom) g *= Math.cos((Math.PI / 2) * Math.min(1, (t - fadeFrom) / 1.6)) ** 2
		const l = bass.l[n] + drums.l[n] + keys.l[n] + pad.l[n] + arp.l[n] + fx.l[n] + wet.l[n]
		const r = bass.r[n] + drums.r[n] + keys.r[n] + pad.r[n] + arp.r[n] + fx.r[n] + wet.r[n]
		master.l[n] = hp[0].run(l) * g
		master.r[n] = hp[1].run(r) * g
	}
	limit(master, 0.8)
	return { left: master.l, right: master.r, sampleRate: SR }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const { values } = parseArgs({
		options: {
			out: { type: "string", default: "out/overview-music.wav" },
			drive: { type: "string", default: "0" },
		},
	})
	const path = resolve(fileURLToPath(new URL("..", import.meta.url)), values.out)
	await mkdir(dirname(path), { recursive: true })
	await writeFile(path, encodeWav(compose({ drive: Number(values.drive) })))
	console.log(`wrote ${path}`)
}
