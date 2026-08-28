import { createRedisClient, getRedisClient, type RedisClient } from "./redis.ts"
import { logChannel, logHistoryKey } from "./constants.ts"

/**
 * Per-user log fan-out.
 *
 * Redis puts a connection into subscriber mode, so a naive implementation needs
 * one Redis connection per connected browser — which exhausts a managed Redis
 * plan's connection limit almost immediately. Instead this module keeps ONE
 * subscriber connection for the whole process and multiplexes it: the first
 * listener for a user SUBSCRIBEs, the last one to leave UNSUBSCRIBEs.
 */

export type Listener = (payload: string) => void

const listeners = new Map<string, Set<Listener>>()

let subscriber: RedisClient | null = null
let subscriberReady: Promise<RedisClient> | null = null

async function getSubscriber(): Promise<RedisClient> {
	if (subscriber?.isOpen) return subscriber
	if (!subscriberReady) {
		subscriberReady = (async () => {
			const client = createRedisClient()
			await client.connect()
			subscriber = client
			// After a reconnect node-redis restores subscriptions itself, so
			// there is nothing to replay here.
			return client
		})().catch((error) => {
			subscriberReady = null
			throw error
		})
	}
	return subscriberReady
}

/**
 * Streams a user's log channel to `listener`.
 * Returns an unsubscribe function that is always safe to call twice.
 */
export async function subscribeToUserLogs(userId: string, listener: Listener): Promise<() => Promise<void>> {
	const channel = logChannel(userId)
	const client = await getSubscriber()

	let group = listeners.get(channel)
	if (!group) {
		group = new Set()
		listeners.set(channel, group)
		await client.subscribe(channel, (message: string) => {
			for (const fn of listeners.get(channel) ?? []) {
				try {
					fn(message)
				} catch (error) {
					console.error("[logstream] Listener threw:", (error as Error).message)
				}
			}
		})
	}
	group.add(listener)

	let released = false
	return async () => {
		if (released) return
		released = true
		const current = listeners.get(channel)
		if (!current) return
		current.delete(listener)
		if (current.size === 0) {
			listeners.delete(channel)
			// Last reader for this user left — stop paying for the subscription.
			await client.unsubscribe(channel).catch(() => { })
		}
	}
}

/**
 * Replays recent events so a browser that connects mid-build (or reconnects
 * after a dropped stream) sees what it missed instead of an empty console.
 */
export async function readLogHistory(userId: string, limit: number): Promise<string[]> {
	try {
		const client = await getRedisClient()
		return await client.lRange(logHistoryKey(userId), -limit, -1)
	} catch (error) {
		console.error("[logstream] Failed to read history:", (error as Error).message)
		return []
	}
}

/** Clears a user's retained history — backs the "clear console" action. */
export async function clearLogHistory(userId: string): Promise<void> {
	const client = await getRedisClient()
	await client.del(logHistoryKey(userId))
}

export async function closeLogStream(): Promise<void> {
	listeners.clear()
	if (!subscriber) return
	try {
		await subscriber.quit()
	} catch { /* already closed */ }
	subscriber = null
	subscriberReady = null
}
