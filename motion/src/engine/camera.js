import { track, springs } from "./spring.js"

/**
 * The camera frames the primary object. It is a centre (in world px) and a
 * scale, each springing toward per-state targets slightly after the object
 * starts moving, so the object leads and the frame follows.
 *
 * Scale is tracked in log space: zooming 1.5× → 3× then reads as evenly
 * paced as 1× → 2×, instead of rushing at the small end.
 *
 * A drift built from sines whose periods divide the loop length keeps the
 * frame breathing without breaking the loop: drift(0) === drift(duration).
 */
export function cameraAt(t, keys, { duration, drift = 1 } = {}) {
	const [first, ...rest] = keys
	const motion = (k) => ({ at: k.at, spring: k.spring ?? springs.camera, delay: k.delay ?? 0.04 })
	const cx = track(t, first.cx, rest.map((k) => ({ ...motion(k), to: k.cx })))
	const cy = track(t, first.cy, rest.map((k) => ({ ...motion(k), to: k.cy })))
	const logS = track(t, Math.log(first.s), rest.map((k) => ({ ...motion(k), to: Math.log(k.s) })))

	const w = (2 * Math.PI) / duration
	const breath = drift * (0.006 * Math.sin(w * t + 0.6) + 0.004 * Math.sin(2 * w * t + 2.1))
	const dx = drift * (2.2 * Math.sin(w * t + 1.3) + 1.1 * Math.sin(2 * w * t))
	const dy = drift * (1.6 * Math.sin(w * t + 4.0) + 0.9 * Math.sin(2 * w * t + 0.7))

	return { cx: cx + dx, cy: cy + dy, s: Math.exp(logS) * (1 + breath) }
}

/** The scale that makes a w × h object fill `fill` of the view on its tighter axis. */
export const fitScale = (w, h, view, fill = 0.82) => Math.min((view.width * fill) / w, (view.height * fill) / h)

export const worldToScreen = (cam, x, y, view) => [view.width / 2 + (x - cam.cx) * cam.s, view.height / 2 + (y - cam.cy) * cam.s]

export const screenToWorld = (cam, x, y, view) => [cam.cx + (x - view.width / 2) / cam.s, cam.cy + (y - view.height / 2) / cam.s]

/** The world layer's CSS transform for this camera. */
export const cameraTransform = (cam, view) =>
	`translate(${(view.width / 2).toFixed(3)}px, ${(view.height / 2).toFixed(3)}px) scale(${cam.s.toFixed(5)}) translate(${(-cam.cx).toFixed(3)}px, ${(-cam.cy).toFixed(3)}px)`
