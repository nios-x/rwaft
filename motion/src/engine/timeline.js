/**
 * The beat grid. Everything in the composition is placed with `beat(n)` so a
 * tempo change, or a track whose first downbeat is late, is a one-line edit.
 */
export function beatGrid({ bpm, beatsPerBar = 4, beats, offset = 0 }) {
	const spb = 60 / bpm
	const duration = beats * spb
	return {
		bpm,
		spb,
		beatsPerBar,
		beats,
		duration,
		offset,
		/** Start time of beat n (1-based), plus an optional fraction of a beat. */
		beat: (n, fraction = 0) => offset + (n - 1 + fraction) * spb,
		/** Beat number (1-based, fractional) at time t. */
		beatAt: (t) => (t - offset) / spb + 1,
		/** { bar, beat } (both 1-based) at time t. */
		position(t) {
			const index = Math.floor((t - offset) / spb)
			return { bar: Math.floor(index / beatsPerBar) + 1, beat: (index % beatsPerBar) + 1, index: index + 1 }
		},
		/** Folds any time into the loop, so motion blur samples before 0 read the loop's end. */
		wrap: (t) => ((t % duration) + duration) % duration,
	}
}
