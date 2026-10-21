import { createHash, timingSafeEqual } from "node:crypto"
import type { NextFunction, Request, Response } from "express"
import { getRedisClient } from "./redis.ts"

/**
 * The admin panel's password. Hardcoded by request; ADMIN_PASSWORD overrides
 * it, and should, before this is shared with anyone. It is only ever checked
 * here on the API, never shipped to the browser.
 */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD?.trim() || "RWAFTADMIN"

/** Wrong guesses allowed per IP before it is locked out for the window. */
const MAX_FAILURES = 10
const FAILURE_WINDOW_SECONDS = 15 * 60
const failureKey = (ip: string) => `rwaft:admin:failures:${ip}`

/** Hashing first makes the comparison constant-time whatever the input's length. */
const digest = (value: string) => createHash("sha256").update(value).digest()

/**
 * Gate for /admin routes: the password travels in X-Admin-Password. Failures
 * are counted per IP rather than through the shared rate limiter, which keys
 * on the self-reported X-User-Id and so could be sidestepped by changing it.
 */
export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
	res.setHeader("Cache-Control", "no-store")
	const ip = req.ip || "unknown"
	try {
		const redis = await getRedisClient()
		const failures = Number(await redis.get(failureKey(ip)) || 0)
		if (failures >= MAX_FAILURES) {
			res.status(429).json({ status: "failed", message: "Too many wrong passwords. Try again in 15 minutes." })
			return
		}

		const given = req.header("x-admin-password") || ""
		if (!timingSafeEqual(digest(given), digest(ADMIN_PASSWORD))) {
			const count = await redis.incr(failureKey(ip))
			if (count === 1) await redis.expire(failureKey(ip), FAILURE_WINDOW_SECONDS)
			res.status(401).json({ status: "failed", message: "Wrong password" })
			return
		}
	} catch (error) {
		console.error("[admin] Password check failed:", (error as Error).message)
		res.status(503).json({ status: "failed", message: "Admin service unavailable" })
		return
	}
	next()
}

export interface AdminUser {
	id: string
	email: string
	name: string
	credits: number
	createdAt: string | null
}

export interface UserPage {
	totalUsers: number
	/** Across every matching account, not just this page. */
	totalCredits: number
	page: number
	pageSize: number
	pages: number
	users: AdminUser[]
}

/**
 * Every account, newest first, one page of it returned. Accounts are Redis
 * hashes with no index, so this scans them all: fine for an admin page at
 * this scale, and it is what makes the totals exact.
 */
export async function listUsers(page: number, pageSize: number, query: string): Promise<UserPage> {
	const redis = await getRedisClient()
	const keys: string[] = []
	for await (const batch of redis.scanIterator({ MATCH: "rwaft:user:g-*", COUNT: 500 })) {
		keys.push(...batch)
	}

	const users: AdminUser[] = []
	for (let index = 0; index < keys.length; index += 200) {
		const slice = keys.slice(index, index + 200)
		const multi = redis.multi()
		for (const key of slice) multi.hmGet(key, ["email", "name", "tokens", "createdAt"])
		const rows = await multi.exec() as unknown as Array<Array<string | null>>
		rows.forEach((row, offset) => {
			const [email, name, tokens, createdAt] = row
			users.push({
				id: slice[offset]!.slice("rwaft:user:".length),
				email: email || "",
				name: name || "",
				credits: Number(tokens || 0),
				createdAt: createdAt || null
			})
		})
	}

	const needle = query.trim().toLowerCase()
	const matching = needle
		? users.filter((user) => user.email.toLowerCase().includes(needle) || user.name.toLowerCase().includes(needle))
		: users
	matching.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))

	const pages = Math.max(1, Math.ceil(matching.length / pageSize))
	const current = Math.min(Math.max(1, page), pages)
	return {
		totalUsers: matching.length,
		totalCredits: matching.reduce((sum, user) => sum + user.credits, 0),
		page: current,
		pageSize,
		pages,
		users: matching.slice((current - 1) * pageSize, current * pageSize)
	}
}
