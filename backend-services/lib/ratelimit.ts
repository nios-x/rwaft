import type { NextFunction, Request, Response } from "express"

/**
 * Fixed-window rate limiter, in memory.
 *
 * /deploy and /prompt each start a container build and, for prompts, a chain of
 * paid AI calls. Leaving them unmetered on a public URL is the fastest way to
 * turn this project into someone else's free build farm. The API runs as one
 * instance, so counters live in this process: a restart only resets windows
 * early, and checking a limit costs no database or Redis request.
 */
export interface RateLimitOptions {
	/** Bucket name, so different routes get independent budgets. */
	name: string
	limit: number
	windowSeconds: number
}

/**
 * Client identity: the signed-in account when there is one (it cannot be
 * forged), else the self-reported user id, else the IP.
 */
function clientKey(req: Request, res: Response): string {
	if (typeof res.locals.accountId === "string") return `account:${res.locals.accountId}`
	const userId = (req.header("x-user-id") || (req.body as { userId?: string } | undefined)?.userId || "").trim()
	if (userId) return `user:${userId}`
	// `trust proxy` is enabled on the app, so req.ip is the real client IP.
	return `ip:${req.ip || "unknown"}`
}

const windows = new Map<string, { count: number; resetAt: number }>()
let lastSweep = 0

/** Forgets finished windows now and then, so the map can't grow without bound. */
function sweep(now: number) {
	if (now - lastSweep < 60_000) return
	lastSweep = now
	for (const [key, window] of windows) if (window.resetAt <= now) windows.delete(key)
}

export function rateLimit({ name, limit, windowSeconds }: RateLimitOptions) {
	return (req: Request, res: Response, next: NextFunction) => {
		const key = `${name}:${clientKey(req, res)}`
		const now = Date.now()
		sweep(now)
		let window = windows.get(key)
		if (!window || window.resetAt <= now) {
			window = { count: 0, resetAt: now + windowSeconds * 1_000 }
			windows.set(key, window)
		}
		window.count++

		const remaining = Math.max(0, limit - window.count)
		res.setHeader("X-RateLimit-Limit", String(limit))
		res.setHeader("X-RateLimit-Remaining", String(remaining))

		if (window.count > limit) {
			const retryAfter = Math.max(1, Math.ceil((window.resetAt - now) / 1_000))
			res.setHeader("Retry-After", String(retryAfter))
			res.status(429).json({
				status: "failed",
				message: `Too many requests. Try again in ${retryAfter}s.`
			})
			return
		}

		next()
	}
}
