import { getRedisClient } from "./redis.ts"
import { BUILD_ACTIVE, BUILD_WAITING } from "./constants.ts"

/**
 * Place in line.
 *
 * Builds run one at a time per worker slot, so while someone else's build is
 * running a new job just sits at "queued" with nothing to show for it. This
 * tracks every job in one line across both queues: the API adds a job when it
 * is enqueued, and the worker moves it from WAITING to ACTIVE when its build
 * starts and drops it when the job ends. Worker slots are handed out FIFO, so
 * rank by enqueue time is the job's real position.
 */

const STATUS_TTL_MS = Number(process.env.STATUS_TTL_SECONDS || 24 * 60 * 60) * 1_000
/**
 * A crashed worker never removes its running job. Anything ACTIVE for longer
 * than a job is allowed to run is one of those and stops being counted.
 */
const ACTIVE_STALE_MS = Number(process.env.BUILD_ACTIVE_STALE_MS || 60 * 60_000)

export async function joinLine(id: string): Promise<void> {
	const redis = await getRedisClient()
	await redis.zAdd(BUILD_WAITING, { score: Date.now(), value: id })
}

export async function leaveLine(id: string): Promise<void> {
	const redis = await getRedisClient()
	await redis.zRem(BUILD_WAITING, id)
}

export interface LinePosition {
	/** 1-based place among waiting jobs, or null once the job is no longer waiting. */
	position: number | null
	waiting: number
	running: number
}

export async function linePosition(id: string): Promise<LinePosition> {
	const redis = await getRedisClient()
	const now = Date.now()
	await redis.zRemRangeByScore(BUILD_WAITING, "-inf", now - STATUS_TTL_MS)
	await redis.zRemRangeByScore(BUILD_ACTIVE, "-inf", now - ACTIVE_STALE_MS)
	const [rank, waiting, running] = await Promise.all([
		redis.zRank(BUILD_WAITING, id),
		redis.zCard(BUILD_WAITING),
		redis.zCard(BUILD_ACTIVE)
	])
	return { position: rank === null ? null : rank + 1, waiting, running }
}
