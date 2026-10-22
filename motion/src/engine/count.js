import { ease, lerp, progress } from "./math.js"

/** A number that counts from `from` to `to` between t0 and t1. */
export const countTo = (t, t0, t1, from, to, curve = ease.cubicOut) => lerp(from, to, curve(progress(t, t0, t1)))

/** Whole-number counter, the form every on-screen count takes. */
export const countInt = (t, t0, t1, from, to, curve) => Math.round(countTo(t, t0, t1, from, to, curve))

/** Seconds as m:ss, the format rwaft's elapsed timer uses (`formatElapsed`). */
export const elapsed = (seconds) => {
	const s = Math.max(0, Math.floor(seconds))
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/** A wall-clock timestamp, HH:MM:SS, offset from a base time of day in seconds. */
export const clock = (baseSeconds, offset) => {
	const total = Math.floor(baseSeconds + offset)
	const hh = Math.floor(total / 3600) % 24
	const mm = Math.floor(total / 60) % 60
	const ss = total % 60
	return [hh, mm, ss].map((n) => String(n).padStart(2, "0")).join(":")
}
