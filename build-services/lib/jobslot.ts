/**
 * Build concurrency limiter.
 *
 * The deploy and prompt queues are pumped by two independent loops running in
 * the same process, so before this existed two user builds could run at the
 * same time. Each one is an `npm install` plus a bundler, which are the two
 * hungriest things this service ever does, and on a single-container
 * deployment (see the root Dockerfile) they share their memory limit with the
 * API. Two at once is what turns a tight build into an OOM kill that takes the
 * API down with it.
 *
 * A slot count of 1 makes builds strictly serial: the second job waits instead
 * of competing for the same RAM. Raise BUILD_CONCURRENCY only on an instance
 * with headroom to match.
 */

import { jobLog } from "./joblog.ts"

const CONCURRENCY = Math.max(1, Number(process.env.BUILD_CONCURRENCY || 1))

let active = 0
const waiting: Array<() => void> = []

/** Runs `task` once a build slot is free. Always releases, even on throw. */
export async function withBuildSlot<T>(task: () => Promise<T>): Promise<T> {
	if (active >= CONCURRENCY) {
		jobLog("Another build is in progress - waiting for a free slot…")
		await new Promise<void>((resolve) => waiting.push(resolve))
	}
	active++
	try {
		return await task()
	} finally {
		active--
		// Hand the slot straight to the next waiter rather than letting every
		// waiter wake and race for it.
		waiting.shift()?.()
	}
}

/** Exposed for the health probe, so saturation is visible in production. */
export const buildSlotStats = () => ({ active, queued: waiting.length, limit: CONCURRENCY })
