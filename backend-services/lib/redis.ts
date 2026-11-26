import { createClient } from "redis"

const redisUrl = process.env.REDIS_URL
const PING_INTERVAL_MS = Math.max(0, Number(process.env.REDIS_PING_MS ?? 240_000))

/**
 * Builds a client with production-appropriate resilience.
 *
 * The previous implementation connected at module load behind a top-level await
 * and threw on failure, so a Redis blip during a deploy turned into a boot
 * crash-loop the platform could only answer by restarting forever. Here,
 * connection failures are retried in the background and the HTTP server stays
 * up (reporting "degraded") so health checks and static asset serving keep
 * working.
 */
export function createRedisClient() {
	if (!redisUrl) throw new Error("REDIS_URL is not configured")

	const client = createClient({
		url: redisUrl,
		socket: {
			reconnectStrategy(retries) {
				const delay = Math.min(500 * Math.pow(2, retries), 30_000)
				console.warn(`[redis] Reconnecting in ${delay}ms (attempt ${retries})`)
				return delay
			},
			connectTimeout: 10_000,
			// Managed Redis providers reap idle sockets; TCP keepalive probes keep
			// ours warm and, unlike PING, cost no commands.
			keepAlive: true,
			keepAliveInitialDelay: 30_000,
			...(redisUrl.startsWith("rediss://") ? { tls: true } : {})
		},
		// Managed Redis bills every command, PINGs included: minutes, not seconds.
		...(PING_INTERVAL_MS > 0 ? { pingInterval: PING_INTERVAL_MS } : {})
	})

	client.on("error", (error: Error) => {
		console.error("[redis] Connection error:", error.message)
	})

	return client
}

/** Inferred from the factory: node-redis' generics do not survive a hand-written alias. */
export type RedisClient = ReturnType<typeof createRedisClient>

let commandClient: RedisClient | null = null
let connecting: Promise<RedisClient> | null = null

/**
 * The shared command connection. Connects lazily and retries in the background
 * rather than blocking or crashing startup.
 */
export async function getRedisClient(): Promise<RedisClient> {
	if (commandClient?.isOpen) return commandClient
	if (!connecting) {
		connecting = (async () => {
			const client = createRedisClient()
			await client.connect()
			commandClient = client
			return client
		})().catch((error) => {
			connecting = null
			throw error
		})
	}
	return connecting
}

/** True when Redis is currently reachable — used by the health endpoint. */
export async function isRedisHealthy(): Promise<boolean> {
	try {
		const client = await getRedisClient()
		return (await client.ping()) === "PONG"
	} catch {
		return false
	}
}

export async function closeRedis(): Promise<void> {
	if (!commandClient) return
	try {
		await commandClient.quit()
	} catch { /* already closed */ }
	commandClient = null
	connecting = null
}
