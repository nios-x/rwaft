import { createHash, randomBytes } from "node:crypto"
import type { NextFunction, Request, Response } from "express"
import { EXPIRES_AT, T, q, tx } from "./db.ts"
import type { JobCharge } from "./constants.ts"
import type { GoogleProfile } from "./google.ts"
import { WEEKLY_CREDITS, nextRefillAt, refillParams, refillSql } from "./refill.ts"

/**
 * Accounts, sessions and the token balance, in Postgres (lib/db.ts).
 *
 * PROD=true turns metering on: a build needs a signed-in Google account and
 * costs tokens. PROD=false (the default) leaves every build free and keeps
 * anonymous use working, so local development needs no Google or Dodo setup.
 * Signing in still works in free mode when GOOGLE_CLIENT_ID is set.
 */
export const BILLING_ENABLED = process.env.PROD === "true"

export const TOKEN_COSTS = {
	deploy: Math.max(0, Number(process.env.DEPLOY_TOKEN_COST ?? 1)),
	// One message in the console is one prompt build.
	prompt: Math.max(0, Number(process.env.PROMPT_TOKEN_COST ?? 1)),
	// One AI change opened as a pull request on a GitHub repository.
	pr: Math.max(0, Number(process.env.PR_TOKEN_COST ?? 1))
}
/** Granted once, when an account is first created. */
export const SIGNUP_TOKENS = Math.max(0, Number(process.env.SIGNUP_TOKENS ?? 2))
/** Topped up to once a week (lib/refill.ts). */
export { WEEKLY_CREDITS }

const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS || 30 * 24 * 60 * 60)

export interface Account {
	id: string
	email: string
	name: string
	picture: string
	tokens: number
	/** The last weekly top-up (epoch ms), or null before the first. */
	refilledAt: number | null
	/** When the next top-up can happen, or null when none is waiting (see nextRefillAt). */
	nextRefillAt: number | null
}

/** A row of the accounts table as the client returns it (bigint can arrive as a string). */
export interface AccountRow {
	id: string
	email: string | null
	name: string | null
	picture: string | null
	tokens: number | string | null
	refilled_at: number | string | bigint | null
}

/** Account ids share the log-channel namespace with anonymous `u-` ids, so they get their own prefix. */
export const accountIdFor = (googleSub: string) => `g-${googleSub}`
export const isAccountId = (value: string) => value.startsWith("g-")

/**
 * Sessions are opaque random tokens. Only their SHA-256 is stored, so a leaked
 * database dump does not hand out live sessions.
 */
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex")

const ACCOUNT_COLUMNS = "id, email, name, picture, tokens, refilled_at"

/** `created` is true only for the sign-in that made the account, i.e. the sign-up. */
export async function upsertGoogleAccount(profile: GoogleProfile): Promise<{ account: Account; created: boolean }> {
	const id = accountIdFor(profile.sub)
	// The insert's conflict rule makes the signup grant once-only even if two
	// first logins race; `xmax = 0` is true only on the row this call inserted.
	// The sign-up grant starts the weekly refill clock.
	const [row] = await q<{ created: boolean }>(`insert into ${T.accounts} (id, email, name, picture, tokens, refilled_at)
		values ($1, $2, $3, $4, $5::int, $6::bigint)
		on conflict (id) do update set email = excluded.email, name = excluded.name, picture = excluded.picture
		returning (xmax = 0) as created`, [id, profile.email, profile.name, profile.picture, SIGNUP_TOKENS, Date.now()])
	const created = Boolean(row?.created)
	const account = await getAccount(id)
	if (!account) throw new Error("Account vanished after creation")
	if (created) console.log(`[auth] New account ${id} granted ${SIGNUP_TOKENS} credits`)
	return { account, created }
}

/** Reads an account, applying the weekly top-up first if it is due. One round trip. */
export async function getAccount(id: string): Promise<Account | null> {
	const now = Date.now()
	const rows = await q<AccountRow>(`with refilled as (${refillSql(T.accounts)})
		select ${ACCOUNT_COLUMNS} from refilled
		union all
		select ${ACCOUNT_COLUMNS} from ${T.accounts} where id = $1 and not exists (select 1 from refilled)`, [id, ...refillParams(now)])
	return rows[0] ? accountFromRow(rows[0], now) : null
}

export function accountFromRow(row: AccountRow, now: number): Account {
	const tokens = Number(row.tokens ?? 0) || 0
	const refilledAt = row.refilled_at !== null && row.refilled_at !== undefined && Number.isFinite(Number(row.refilled_at)) ? Number(row.refilled_at) : null
	return {
		id: row.id,
		email: row.email || "",
		name: row.name || "",
		picture: row.picture || "",
		tokens,
		refilledAt,
		nextRefillAt: nextRefillAt(tokens, refilledAt, now)
	}
}

export async function createSession(accountId: string): Promise<string> {
	const token = randomBytes(32).toString("base64url")
	await q(`insert into ${T.sessions} (token_hash, account_id, expires_at) values ($1, $2, ${EXPIRES_AT("$3")})`, [hashToken(token), accountId, SESSION_TTL_SECONDS])
	// Expired sessions are cleared as new ones are made, never on a timer.
	await q(`delete from ${T.sessions} where expires_at <= now()`).catch(() => { })
	return token
}

export async function destroySession(token: string): Promise<void> {
	await q(`delete from ${T.sessions} where token_hash = $1`, [hashToken(token)])
}

/** The account a session token belongs to, or null when it is unknown or expired. */
export async function accountForSession(token: string): Promise<string | null> {
	const rows = await q<{ account_id: string }>(`select account_id from ${T.sessions} where token_hash = $1 and expires_at > now()`, [hashToken(token)])
	return rows[0]?.account_id ?? null
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
				const accountId = await accountForSession(token)
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

export type SpendResult = { ok: true; balance: number } | { ok: false; balance: number }

/** Applies a due weekly top-up, then deducts only if the whole amount is there, in one transaction. */
export async function spendTokens(accountId: string, cost: number): Promise<SpendResult> {
	return await tx(async (run) => {
		await run(refillSql(T.accounts), [accountId, ...refillParams(Date.now())])
		const spent = await run<{ tokens: number }>(`update ${T.accounts} set tokens = tokens - $2::int where id = $1 and tokens >= $2::int returning tokens`, [accountId, cost])
		if (spent[0]) return { ok: true, balance: Number(spent[0].tokens) }
		const current = await run<{ tokens: number }>(`select tokens from ${T.accounts} where id = $1`, [accountId])
		return { ok: false, balance: Number(current[0]?.tokens ?? 0) }
	})
}

/** Adds credits to an account; the new balance, or null when there is no such account. */
export async function addTokens(accountId: string, amount: number): Promise<number | null> {
	const rows = await q<{ tokens: number }>(`update ${T.accounts} set tokens = tokens + $2::int where id = $1 returning tokens`, [accountId, amount])
	return rows[0] ? Number(rows[0].tokens) : null
}

/**
 * Credits `tokens` once for `key` (e.g. "refund:<jobId>", "payment:<id>"),
 * however many times it is called. True when this call credited them.
 */
export async function creditOnce(key: string, accountId: string, tokens: number, detail?: unknown): Promise<boolean> {
	return await tx(async (run) => {
		const inserted = await run(`insert into ${T.billingEvents} (key, account_id, tokens, detail) values ($1, $2, $3::int, $4::jsonb)
			on conflict (key) do nothing returning key`, [key, accountId, tokens, detail ?? null])
		if (inserted.length === 0) return false
		await run(`update ${T.accounts} set tokens = tokens + $2::int where id = $1`, [accountId, tokens])
		return true
	})
}

/** Returns a job's tokens. Safe to call more than once for the same job. */
export async function refundCharge(jobId: string, charge: JobCharge | undefined): Promise<void> {
	if (!charge || charge.tokens <= 0) return
	try {
		await creditOnce(`refund:${jobId}`, charge.userId, charge.tokens)
	} catch (error) {
		// Logged with enough detail to settle by hand; never worth failing a response over.
		console.error(`[billing] Refund of ${charge.tokens} tokens to ${charge.userId} for ${jobId} failed:`, (error as Error).message)
	}
}
