import { T, q } from "./db.ts"

/**
 * Per-user build logs, from Postgres.
 *
 * The worker appends every event to the log_events table (in batches). A
 * browser following a build gets the user's recent history, then new rows as
 * they arrive: one poller per user, shared by every open stream for that user,
 * reading only rows newer than the last it sent, and only while someone is
 * watching. Nothing reads the table on a timer once the last stream closes,
 * so an idle database can suspend.
 */

export type Listener = (payload: string) => void

const POLL_MS = Number(process.env.LOG_POLL_MS || 1_000)
const POLL_BATCH = 500

interface Follower {
	listeners: Set<Listener>
	/** The newest log_events id already sent. */
	cursor: number
	timer: ReturnType<typeof setTimeout> | null
	polling: boolean
}

const followers = new Map<string, Follower>()

async function latestId(userId: string): Promise<number> {
	const rows = await q<{ id: number | string | null }>(`select max(id) as id from ${T.logEvents} where user_id = $1`, [userId])
	return Number(rows[0]?.id ?? 0) || 0
}

function schedule(userId: string, follower: Follower) {
	follower.timer = setTimeout(() => void poll(userId, follower), POLL_MS)
}

async function poll(userId: string, follower: Follower) {
	if (followers.get(userId) !== follower || follower.polling) return
	follower.polling = true
	try {
		const rows = await q<{ id: number | string; payload: string }>(
			`select id, payload from ${T.logEvents} where user_id = $1 and id > $2::bigint order by id limit ${POLL_BATCH}`,
			[userId, follower.cursor])
		for (const row of rows) {
			follower.cursor = Math.max(follower.cursor, Number(row.id))
			for (const listener of follower.listeners) {
				try {
					listener(row.payload)
				} catch (error) {
					console.error("[logstream] Listener threw:", (error as Error).message)
				}
			}
		}
	} catch (error) {
		console.error("[logstream] Poll failed:", (error as Error).message)
	} finally {
		follower.polling = false
		if (followers.get(userId) === follower && follower.listeners.size > 0) schedule(userId, follower)
	}
}

/**
 * Streams a user's new log events to `listener`, from now on.
 * Returns an unsubscribe function that is always safe to call twice.
 */
export async function subscribeToUserLogs(userId: string, listener: Listener): Promise<() => Promise<void>> {
	let follower = followers.get(userId)
	if (!follower) {
		follower = { listeners: new Set(), cursor: await latestId(userId), timer: null, polling: false }
		followers.set(userId, follower)
		schedule(userId, follower)
	}
	follower.listeners.add(listener)

	let released = false
	const mine = follower
	return async () => {
		if (released) return
		released = true
		mine.listeners.delete(listener)
		if (mine.listeners.size === 0 && followers.get(userId) === mine) {
			if (mine.timer) clearTimeout(mine.timer)
			followers.delete(userId)
		}
	}
}

/**
 * Replays recent events so a browser that connects mid-build (or reconnects
 * after a dropped stream) sees what it missed instead of an empty console.
 */
export async function readLogHistory(userId: string, limit: number): Promise<string[]> {
	try {
		const rows = await q<{ payload: string }>(
			`select payload from (select id, payload from ${T.logEvents} where user_id = $1 order by id desc limit $2::int) recent order by id`,
			[userId, limit])
		return rows.map((row) => row.payload)
	} catch (error) {
		console.error("[logstream] Failed to read history:", (error as Error).message)
		return []
	}
}

/** Clears a user's retained history — backs the "clear console" action. */
export async function clearLogHistory(userId: string): Promise<void> {
	await q(`delete from ${T.logEvents} where user_id = $1`, [userId])
}

export async function closeLogStream(): Promise<void> {
	for (const follower of followers.values()) if (follower.timer) clearTimeout(follower.timer)
	followers.clear()
}
