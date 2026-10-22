import { bump, clamp, ease, lerp, progress } from "./math.js"

/**
 * A human cursor, as a pure function of time.
 *
 * Moves follow a cubic Bézier bowed to one side of the straight line (hands
 * pivot at the wrist, so real pointer paths arc). Timing is minimum-jerk,
 * skewed so the hand accelerates quickly and spends longer decelerating, and
 * the last 30 % of a move carries a small overshoot-and-correct, the way a
 * pointer lands on a target. Clicks dip the pointer briefly; there are no
 * big click circles, only an optional faint ring.
 *
 * spec = {
 *   home: [x, y],                        // where it rests at t = 0 and at the end
 *   moves: [{ at, dur, to: [x, y], arc?, overshoot? }],
 *   clicks: [t, ...],
 *   shows: [{ at, dur, to: 0 | 1 }],     // opacity changes
 * }
 */

const human = (u) => ease.minJerk(clamp(u) ** 0.82)

function bezier(a, c1, c2, b, u) {
	const v = 1 - u
	const w0 = v * v * v
	const w1 = 3 * v * v * u
	const w2 = 3 * v * u * u
	const w3 = u * u * u
	return [w0 * a[0] + w1 * c1[0] + w2 * c2[0] + w3 * b[0], w0 * a[1] + w1 * c1[1] + w2 * c2[1] + w3 * b[1]]
}

function along(from, move, t) {
	const to = move.to
	const dx = to[0] - from[0]
	const dy = to[1] - from[1]
	const d = Math.hypot(dx, dy) || 1
	const dir = [dx / d, dy / d]
	const normal = [-dir[1], dir[0]]
	const arc = (move.arc ?? 0.14) * d
	// The bow peaks early (wrist rotation) and flattens into the target.
	const c1 = [from[0] + dx * 0.28 + normal[0] * arc, from[1] + dy * 0.28 + normal[1] * arc]
	const c2 = [from[0] + dx * 0.74 + normal[0] * arc * 0.45, from[1] + dy * 0.74 + normal[1] * arc * 0.45]
	const u = progress(t, move.at, move.at + move.dur)
	const point = bezier(from, c1, c2, to, human(u))
	const overshoot = (move.overshoot ?? 0.014) * Math.min(d, 420) * bump(progress(u, 0.62, 1))
	return [point[0] + dir[0] * overshoot, point[1] + dir[1] * overshoot]
}

export function cursorPath(spec) {
	const moves = [...spec.moves].sort((a, b) => a.at - b.at)
	// Resolve each move's start point once: the previous move's target.
	const starts = []
	let cursor = spec.home
	for (const move of moves) {
		starts.push(cursor)
		cursor = move.to
	}

	const position = (t) => {
		let at = spec.home
		for (let i = 0; i < moves.length; i++) {
			const move = moves[i]
			if (t < move.at) break
			at = t >= move.at + move.dur ? move.to : along(starts[i], move, t)
		}
		return at
	}

	const press = (t) => {
		let amount = 0
		for (const c of spec.clicks) {
			if (t < c - 0.06 || t > c + 0.22) continue
			const down = progress(t, c - 0.06, c)
			const up = progress(t, c + 0.04, c + 0.22)
			amount = Math.max(amount, ease.cubicOut(down) * (1 - ease.cubicInOut(up)))
		}
		return amount
	}

	const ring = (t) => {
		for (const c of spec.clicks) {
			const u = progress(t, c, c + 0.42)
			if (t >= c && u < 1) return { r: lerp(4, 22, ease.expoOut(u)), o: 0.28 * (1 - ease.quadOut(u)) }
		}
		return { r: 0, o: 0 }
	}

	const opacity = (t) => {
		let value = spec.shows[0]?.from ?? 0
		for (const s of spec.shows) {
			if (t <= s.at) break
			value = lerp(value, s.to, ease.cubicInOut(progress(t, s.at, s.at + (s.dur ?? 0.2))))
		}
		return value
	}

	return {
		moves,
		at(t) {
			const [x, y] = position(t)
			return { x, y, press: press(t), ring: ring(t), opacity: opacity(t) }
		},
	}
}
