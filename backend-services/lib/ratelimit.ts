import type { NextFunction, Request, Response } from "express"
import { getRedisClient } from "./redis.ts"

/**
 * Redis-backed fixed-window rate limiter.
 *
 * /deploy and /prompt each start a container build and, for prompts, a chain of
 * paid AI calls. Leaving them unmetered on a public URL is the fastest way to
 * turn this project into someone else's free build farm. The counter lives in
 * Redis so the limit holds across multiple API instances.
 */
export interface RateLimitOptions {
	/** Bucket name, so different routes get independent budgets. */
	name: string
	limit: number
	windowSeconds: number
}

/** Best-effort client identity: the per-user id when present, else the IP. */
function clientKey(req: Request): string {
	const userId = (req.header("x-user-id") || (req.body as { userId?: string } | undefined)?.userId || "").trim()
	if (userId) return `user:${userId}`
	// `trust proxy` is enabled on the app, so req.ip is the real client IP.
	return `ip:${req.ip || "unknown"}`
}

export function rateLimit({ name, limit, windowSeconds }: RateLimitOptions) {
	return async (req: Request, res: Response, next: NextFunction) => {
		const key = `rwaft:ratelimit:${name}:${clientKey(req)}`

		try {
			const redis = await getRedisClient()
			const count = await redis.incr(key)
			if (count === 1) {
				await redis.expire(key, windowSeconds)
			}

			const remaining = Math.max(0, limit - count)
			res.setHeader("X-RateLimit-Limit", String(limit))
			res.setHeader("X-RateLimit-Remaining", String(remaining))

			if (count > limit) {
				const ttl = await redis.ttl(key)
				const retryAfter = ttl > 0 ? ttl : windowSeconds
				res.setHeader("Retry-After", String(retryAfter))
				res.status(429).json({
					status: "failed",
					message: `Too many requests. Try again in ${retryAfter}s.`
				})
				return
			}
		} catch (error) {
			// Redis being down must not take the API down with it. Log and allow;
			// the deploy handler itself will fail loudly if Redis is truly gone.
			console.error(`[ratelimit] Bypassed (${name}):`, (error as Error).message)
		}

		next()
	}
}
