/**
 * How often the worker talks to Redis when there is nothing to do.
 *
 * Managed Redis (Upstash) bills, and on the free plan caps, every command,
 * including the ones an idle worker sends just to wait. These rules keep the
 * idle cost to a few thousand commands a day without slowing real work down:
 * a job still starts the moment it is queued (BLMOVE wakes on the push), and a
 * pull request watch is still visited the moment it is due.
 *
 * Plain functions with no imports, so lib/pacing.test.ts can test them as-is.
 */

/** Pause between watch-loop passes while there is work in hand. */
export const BUSY_LOOP_MS = 5_000

/**
 * How long the check-watch loop waits before its next look at Redis: briefly
 * while due watches wait for a free slot, until the next watch falls due
 * otherwise, and never longer than idleMs (a safety net; in-process changes
 * wake the loop early anyway).
 */
export function watchLoopDelay(nextDue: number | null, now: number, busy: boolean, idleMs: number): number {
	if (busy) return BUSY_LOOP_MS
	if (nextDue === null) return idleMs
	return Math.min(idleMs, Math.max(BUSY_LOOP_MS, nextDue - now))
}

/** The next wait after a failed Redis read: doubles from `min`, capped at `max`. */
export function nextBackoff(previous: number, min: number, max: number): number {
	if (previous <= 0) return min
	return Math.min(max, Math.max(min, previous * 2))
}
