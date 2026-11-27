import { createHash, timingSafeEqual } from "node:crypto"
import type { NextFunction, Request, Response } from "express"
import { T, q } from "./db.ts"

/**
 * The admin panel's password. Hardcoded by request; ADMIN_PASSWORD overrides
 * it, and should, before this is shared with anyone. It is only ever checked
 * here on the API, never shipped to the browser.
 */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD?.trim() || "RWAFTADMIN"

/** Wrong guesses allowed per IP before it is locked out for the window. */
const MAX_FAILURES = 10
const FAILURE_WINDOW_MS = 15 * 60_000
/** Wrong guesses per IP, in memory: the API runs as one instance, and a restart only forgives early. */
const failures = new Map<string, { count: number; resetAt: number }>()

/** Hashing first makes the comparison constant-time whatever the input's length. */
const digest = (value: string) => createHash("sha256").update(value).digest()

/**
 * Gate for /admin routes: the password travels in X-Admin-Password. Failures
 * are counted per IP rather than through the shared rate limiter, which keys
 * on the self-reported X-User-Id and so could be sidestepped by changing it.
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
	res.setHeader("Cache-Control", "no-store")
	const ip = req.ip || "unknown"
	const now = Date.now()
	const entry = failures.get(ip)
	if (entry && entry.resetAt <= now) failures.delete(ip)
	if ((failures.get(ip)?.count ?? 0) >= MAX_FAILURES) {
		res.status(429).json({ status: "failed", message: "Too many wrong passwords. Try again in 15 minutes." })
		return
	}

	const given = req.header("x-admin-password") || ""
	if (!timingSafeEqual(digest(given), digest(ADMIN_PASSWORD))) {
		const current = failures.get(ip) ?? { count: 0, resetAt: now + FAILURE_WINDOW_MS }
		current.count++
		failures.set(ip, current)
		res.status(401).json({ status: "failed", message: "Wrong password" })
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

/** Every account, newest first, one page of it returned, with exact totals across all that match. */
export async function listUsers(page: number, pageSize: number, query: string): Promise<UserPage> {
	const rows = await q<{ id: string; email: string; name: string; tokens: number; created_at: Date | string | null }>(
		`select id, email, name, tokens, created_at from ${T.accounts} where id like 'g-%'`)
	const users: AdminUser[] = rows.map((row) => ({
		id: row.id,
		email: row.email || "",
		name: row.name || "",
		credits: Number(row.tokens || 0),
		createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
	}))

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
