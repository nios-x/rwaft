import { createHash, randomBytes } from "node:crypto"
import type { NextFunction, Request, Response } from "express"
import { getRedisClient } from "./redis.ts"
import { refundKey, sessionKey, userKey, type JobCharge } from "./constants.ts"
import type { GoogleProfile } from "./google.ts"

/**
 * Accounts, sessions and the token balance.
 *
 * PROD=true turns metering on: a build needs a signed-in Google account and
 * costs tokens. PROD=false (the default) leaves every build free and keeps
 * anonymous use working, so local development needs no Google or Stripe setup.
 * Signing in still works in free mode when GOOGLE_CLIENT_ID is set.
 *
 * Everything lives in Redis next to the queues. That instance runs with
 * `noeviction` (see render.yaml) and append-only persistence (see
 * docker-compose.yml) precisely because balances must never be evicted.
 */
export const BILLING_ENABLED = process.env.PROD === "true"

export const TOKEN_COSTS = {
	deploy: Math.max(0, Number(process.env.DEPLOY_TOKEN_COST ?? 1)),
	// One message in the console is one prompt build.
	prompt: Math.max(0, Number(process.env.PROMPT_TOKEN_COST ?? 1))
}
/** Granted once, when an account is first created. */
export const SIGNUP_TOKENS = Math.max(0, Number(process.env.SIGNUP_TOKENS ?? 5))

const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS || 30 * 24 * 60 * 60)
/** How long a refund marker is kept; longer than any job can stay in the queue. */
const REFUND_MARKER_TTL_SECONDS = 7 * 24 * 60 * 60

export interface Account {
	id: string
	email: string
	name: string
	picture: string
	tokens: number
}

/** Account ids share the log-channel namespace with anonymous `u-` ids, so they get their own prefix. */
export const accountIdFor = (googleSub: string) => `g-${googleSub}`
export const isAccountId = (value: string) => value.startsWith("g-")

/**
 * Sessions are opaque random tokens. Only their SHA-256 is stored, so a leaked
 * Redis dump does not hand out live sessions.
 */
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex")

export async function upsertGoogleAccount(profile: GoogleProfile): Promise<Account> {
	const id = accountIdFor(profile.sub)
	const key = userKey(id)
	const redis = await getRedisClient()
	await redis.hSet(key, { email: profile.email, name: profile.name, picture: profile.picture })
	// HSETNX makes the signup grant once-only even if two first logins race.
	await redis.hSetNX(key, "tokens", String(SIGNUP_TOKENS))
	await redis.hSetNX(key, "createdAt", new Date().toISOString())
	const account = await getAccount(id)
	if (!account) throw new Error("Account vanished after creation")
	return account
}

export async function getAccount(id: string): Promise<Account | null> {
	const redis = await getRedisClient()
	const fields = await redis.hGetAll(userKey(id))
	if (!fields || Object.keys(fields).length === 0) return null
	return {
		id,
		email: fields.email || "",
		name: fields.name || "",
		picture: fields.picture || "",
		tokens: Number(fields.tokens || 0)
	}
}

export async function createSession(accountId: string): Promise<string> {
	const token = randomBytes(32).toString("base64url")
	const redis = await getRedisClient()
	await redis.set(sessionKey(hashToken(token)), accountId, { EX: SESSION_TTL_SECONDS })
	return token
}

export async function destroySession(token: string): Promise<void> {
	const redis = await getRedisClient()
	await redis.del(sessionKey(hashToken(token)))
}

/** The bearer token on this request, if any. */
export function readSessionToken(req: Request, { allowQuery = false } = {}): string | undefined {
	const header = req.header("authorization") || ""
	const bearer = /^Bearer\s+(\S+)$/i.exec(header)?.[1]
	if (bearer) return bearer
	// EventSource cannot set headers, so the log stream alone may pass it in the URL.
	const query = req.query.access_token
	return allowQuery && typeof query === "string" && query ? query : undefined
}

/**
 * Resolves the session, if one was presented, into `res.locals.accountId`.
 * Never rejects on its own: routes decide whether an account is required.
 */
export const authenticate = (options: { allowQuery?: boolean } = {}) =>
	async (req: Request, res: Response, next: NextFunction) => {
		const token = readSessionToken(req, options)
		if (token) {
			try {
				const redis = await getRedisClient()
				const accountId = await redis.get(sessionKey(hashToken(token)))
				if (accountId) {
					res.locals.accountId = accountId
					res.locals.sessionToken = token
				}
			} catch (error) {
				console.error("[auth] Session lookup failed:", (error as Error).message)
			}
		}
		next()
	}

/** With billing on, a build can only be started from a signed-in account. */
export const requireAccountWhenBilling = (_req: Request, res: Response, next: NextFunction) => {
	if (BILLING_ENABLED && !res.locals.accountId) {
		res.status(401).json({ status: "failed", code: "sign_in_required", message: "Sign in with Google to start a build" })
		return
	}
	next()
}

/** Deducts only if the whole amount is there, in one atomic step. Returns the new balance, or -1. */
const SPEND_SCRIPT = `
local balance = tonumber(redis.call('HGET', KEYS[1], 'tokens') or '0')
local cost = tonumber(ARGV[1])
if balance < cost then return -1 end
return redis.call('HINCRBY', KEYS[1], 'tokens', -cost)
`

/** Credits a refund at most once per job. Returns the new balance, or -1 if already refunded. */
const REFUND_SCRIPT = `
if redis.call('SET', KEYS[1], '1', 'NX', 'EX', ARGV[2]) then
	return redis.call('HINCRBY', KEYS[2], 'tokens', ARGV[1])
end
return -1
`

export type SpendResult = { ok: true; balance: number } | { ok: false; balance: number }

export async function spendTokens(accountId: string, cost: number): Promise<SpendResult> {
	const redis = await getRedisClient()
	const reply = Number(await redis.sendCommand(["EVAL", SPEND_SCRIPT, "1", userKey(accountId), String(cost)]))
	if (reply < 0) {
		const account = await getAccount(accountId)
		return { ok: false, balance: account?.tokens ?? 0 }
	}
	return { ok: true, balance: reply }
}

/** Returns a job's tokens. Safe to call more than once for the same job. */
export async function refundCharge(jobId: string, charge: JobCharge | undefined): Promise<void> {
	if (!charge || charge.tokens <= 0) return
	try {
		const redis = await getRedisClient()
		await redis.sendCommand([
			"EVAL", REFUND_SCRIPT, "2", refundKey(jobId), userKey(charge.userId),
			String(charge.tokens), String(REFUND_MARKER_TTL_SECONDS)
		])
	} catch (error) {
		// Logged with enough detail to settle by hand; never worth failing a response over.
		console.error(`[billing] Refund of ${charge.tokens} tokens to ${charge.userId} for ${jobId} failed:`, (error as Error).message)
	}
}
