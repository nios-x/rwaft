import fs from "node:fs/promises"
import { randomBytes } from "node:crypto"
import os from "node:os"
import path from "node:path"
import { Readable } from "node:stream"
import express from "express"
import type { Request, Response } from "express"
import { simpleGit } from "simple-git"
import "dotenv/config"

import { genId, genUserId, getAllFileNames, isDeploymentId, isUserId, validateRepositoryUrl } from "./lib/utils.ts"
import { uploadFile } from "./lib/upload.ts"
import { getRawAssetUrl } from "./lib/cloudinary.ts"
import { closeRedis, getRedisClient, isRedisHealthy } from "./lib/redis.ts"
import { corsmiddlewares, securityHeaders } from "./lib/middleware.ts"
import { withBadge } from "./lib/badge.ts"
import { rateLimit } from "./lib/ratelimit.ts"
import { clearLogHistory, closeLogStream, readLogHistory, subscribeToUserLogs } from "./lib/logstream.ts"
import {
	DEPLOY_QUEUE,
	DEPLOYMENT_STATUS_PREFIX,
	PROMPT_QUEUE,
	PR_QUEUE,
	githubPrKey,
	githubPushKey,
	prResultKey,
	prTokenKey,
	userKey,
	type JobCharge
} from "./lib/constants.ts"
import {
	BILLING_ENABLED,
	SIGNUP_TOKENS,
	TOKEN_COSTS,
	authenticate,
	createSession,
	destroySession,
	getAccount,
	isAccountId,
	refundCharge,
	requireAccountWhenBilling,
	spendTokens,
	upsertGoogleAccount
} from "./lib/accounts.ts"
import { GOOGLE_CLIENT_ID, verifyGoogleIdToken } from "./lib/google.ts"
import {
	CURRENCY,
	TOKEN_PACKS,
	createCheckoutSession,
	fulfilPayment,
	isCheckoutConfigured,
	verifyDodoSetup,
	verifyDodoSignature,
	type DodoPayment
} from "./lib/billing.ts"
import { joinLine, leaveLine, linePosition } from "./lib/queue.ts"
import { listUsers, requireAdmin } from "./lib/admin.ts"
import { notifySignup, verifySignupAlert } from "./lib/alerts.ts"
import {
	GitHubError,
	authorizeUrl,
	exchangeCode,
	getRepository,
	isGitHubConfigured,
	isPublicRepository,
	isRepositoryName,
	markSnapshotPushed,
	parseRepository,
	pushToNewRepository,
	readSnapshot,
	readSnapshotFiles,
	revokeToken,
	sealToken,
	type RepositoryInfo,
	type RepositoryRef
} from "./lib/github.ts"

const app = express()
const PORT = Number(process.env.PORT || 3000)
const HOST = process.env.HOST || "0.0.0.0"
// Each in-flight upload holds a read stream, a TLS session and an SDK call. In
// the combined image (see the root Dockerfile) this runs in the same container
// as the build worker, so a staging upload burst competes for memory with a
// bundler. Modest and tunable beats fast and fatal.
const UPLOAD_BATCH_SIZE = Number(process.env.UPLOAD_BATCH_SIZE || 4)
const STATUS_TTL_SECONDS = Number(process.env.STATUS_TTL_SECONDS || 24 * 60 * 60)
const MAX_PROMPT_CHARS = Number(process.env.MAX_PROMPT_CHARS || 8_000)
const SSE_HEARTBEAT_MS = Number(process.env.SSE_HEARTBEAT_MS || 25_000)
const SSE_HISTORY_LIMIT = Number(process.env.SSE_HISTORY_LIMIT || 300)
const CLONE_TIMEOUT_MS = Number(process.env.CLONE_TIMEOUT_MS || 120_000)
/**
 * Per-hour build caps. In free mode they are the only meter, so they stay
 * tight. With billing on, credits are the meter and the cap only stops bursts:
 * a new account must be able to spend its free credits in one sitting.
 */
const PROMPT_RATE_LIMIT = Number(process.env.PROMPT_RATE_LIMIT || (BILLING_ENABLED ? 20 : 3))
const DEPLOY_RATE_LIMIT = Number(process.env.DEPLOY_RATE_LIMIT || (BILLING_ENABLED ? 20 : 5))

/**
 * Staging area for cloned repositories. Kept in the OS temp dir: the app
 * directory on a PaaS instance is small, and a repo clone plus its upload
 * buffer can be hundreds of megabytes.
 */
const stagingRoot = process.env.STAGING_ROOT || path.join(os.tmpdir(), "rwaft-staging")

/**
 * Deployment URL shape.
 *
 * Subdomain URLs (`<id>.example.com`) require a wildcard DNS record and a
 * wildcard TLS certificate. That is NOT available on a default `*.onrender.com`
 * hostname, so the previous unconditional subdomain URLs were dead links in
 * production. Path-based URLs are the default and work anywhere; subdomains are
 * opt-in once real wildcard DNS is configured.
 */
const DEPLOYMENT_DOMAIN = process.env.DEPLOYMENT_DOMAIN?.replace(/\/+$/, "") || ""
const USE_WILDCARD_SUBDOMAINS = process.env.DEPLOYMENT_WILDCARD === "true" && Boolean(DEPLOYMENT_DOMAIN)

/** Express sits behind the platform's TLS terminator; trust its forwarded headers. */
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 1))
app.disable("x-powered-by")

app.use(securityHeaders)

/**
 * The wildcard DNS record that sends `<id>.<domain>` here also catches `www`
 * unless www has a record of its own, and "www" is not a deployment id, so it
 * answered 404 where people expect the console. Send it to the bare domain.
 */
if (USE_WILDCARD_SUBDOMAINS) {
	const wwwHost = `www.${DEPLOYMENT_DOMAIN.toLowerCase()}`
	app.use((req, res, next) => {
		if (req.hostname.toLowerCase() !== wwwHost) return next()
		res.redirect(301, `https://${DEPLOYMENT_DOMAIN}${req.originalUrl}`)
	})
}

/**
 * The origin allowlist guards the API, not the static hosting.
 *
 * It exists so another site cannot drive /deploy and /prompt from a visitor's
 * browser and burn the build and AI budget. Deployed sites are public files
 * that anyone can already fetch without a browser, so an origin check protects
 * nothing there — and mounted globally it actively broke them: Vite marks its
 * bundles `crossorigin`, module scripts are always fetched in CORS mode, and a
 * CORS-mode request carries an Origin header even when it is same-origin, so
 * every deployed site's own CSS and JS came back 403 while the HTML (a
 * navigation, which sends no Origin) still returned 200 and rendered blank.
 *
 * Scoping the middleware to the API routes keeps that protection exactly where
 * it earns its keep and leaves the catch-all deployment proxy below ungated, so
 * it cannot be broken again by however the platform's proxies rewrite Host or
 * X-Forwarded-Proto.
 */
app.use(["/health", "/healthz", "/session", "/status", "/queue", "/logs", "/deploy", "/prompt", "/auth", "/billing/checkout", "/billing/test-credits", "/github", "/admin"], corsmiddlewares)

// ── Dodo Payments webhook ───────────────────────────────────────────────────
//
// Registered ahead of the JSON parser: the signature covers the exact bytes
// Dodo sent, so this route needs the raw body. Server-to-server, so it sits
// outside the browser origin allowlist.
app.post("/billing/webhook", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
	const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
	const signed = verifyDodoSignature(raw, {
		id: req.header("webhook-id"),
		timestamp: req.header("webhook-timestamp"),
		signature: req.header("webhook-signature")
	})
	if (!signed) {
		res.status(401).json({ status: "failed", message: "Invalid signature" })
		return
	}

	let event: { type?: string; data?: DodoPayment }
	try {
		event = JSON.parse(raw.toString("utf-8"))
	} catch {
		res.status(400).json({ status: "failed", message: "Invalid payload" })
		return
	}

	// Every other event is acknowledged and ignored. Refunds are handled by
	// hand: the credits may already be spent.
	if (event.type === "payment.succeeded") {
		const payment = event.data
		if (!payment?.payment_id) {
			res.status(400).json({ status: "failed", message: "Event carried no payment" })
			return
		}
		try {
			const result = await fulfilPayment(payment)
			console.log(`[billing] ${event.type} ${payment.payment_id}: ${result}`)
		} catch (error) {
			// A non-2xx makes Dodo retry, which is what we want when Redis blips.
			console.error(`[billing] Fulfilment of ${payment.payment_id} failed:`, (error as Error).message)
			res.status(503).json({ status: "failed" })
			return
		}
	}
	res.json({ received: true })
})

// A repo URL or a prompt is small; a large body here is either a mistake or an
// attempt to exhaust memory.
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "64kb" }))
app.use(["/auth", "/deploy", "/prompt", "/billing/checkout", "/billing/test-credits", "/github"], authenticate())
app.use("/logs", authenticate({ allowQuery: true }))

const publicOrigin = (req: Request): string => {
	const configured = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "")
	if (configured) return configured
	return `${req.protocol}://${req.get("host")}`
}

const buildDeploymentUrl = (req: Request, id: string): string =>
	USE_WILDCARD_SUBDOMAINS
		? `https://${id}.${DEPLOYMENT_DOMAIN}/`
		: `${publicOrigin(req)}/${id}/`

/**
 * The base path the built site's assets are served from.
 *
 * Vite and CRA bake absolute asset URLs into index.html at build time. Under
 * path-based hosting those must be prefixed with the deployment id, or every
 * `/assets/*.js` request 404s and the deployed page renders blank — the exact
 * failure mode the previous version shipped with. The worker applies this.
 */
const assetBaseFor = (id: string): string => (USE_WILDCARD_SUBDOMAINS ? "/" : `/${id}/`)

/**
 * Whose log channel a build reports to. A signed-in request always uses its
 * account; an anonymous one may name its own id, but never an account's, or it
 * could stream its build output into someone else's console.
 */
const resolveUserId = (req: Request, res: Response): string | undefined => {
	if (typeof res.locals.accountId === "string") return res.locals.accountId
	const candidate = (req.header("x-user-id") || (req.body as { userId?: string } | undefined)?.userId || "").trim()
	return isUserId(candidate) && !isAccountId(candidate) ? candidate : undefined
}

/**
 * Takes a build's tokens up front, so two concurrent submissions cannot both
 * spend the same balance. Answers the request itself and returns null when
 * the account cannot pay; returns undefined when nothing needs charging.
 */
const chargeForBuild = async (res: Response, kind: keyof typeof TOKEN_COSTS): Promise<JobCharge | undefined | null> => {
	const cost = TOKEN_COSTS[kind]
	const accountId = res.locals.accountId as string | undefined
	if (!BILLING_ENABLED || cost === 0 || !accountId) return undefined

	try {
		const result = await spendTokens(accountId, cost)
		if (!result.ok) {
			res.status(402).json({
				status: "failed",
				code: "insufficient_tokens",
				message: `You're out of credits: this costs ${cost} and you have ${result.balance}. Buy more to keep building.`,
				balance: result.balance,
				cost
			})
			return null
		}
		return { userId: accountId, tokens: cost }
	} catch (error) {
		console.error("[billing] Charge failed:", (error as Error).message)
		res.status(503).json({ status: "failed", message: "Billing is temporarily unavailable" })
		return null
	}
}

// ── Static asset proxy ──────────────────────────────────────────────────────

const CONTENT_TYPES: Record<string, string> = {
	html: "text/html; charset=utf-8",
	css: "text/css; charset=utf-8",
	js: "application/javascript; charset=utf-8",
	mjs: "application/javascript; charset=utf-8",
	json: "application/json; charset=utf-8",
	txt: "text/plain; charset=utf-8",
	map: "application/json; charset=utf-8",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	avif: "image/avif",
	svg: "image/svg+xml",
	ico: "image/x-icon",
	woff: "font/woff",
	woff2: "font/woff2",
	ttf: "font/ttf",
	otf: "font/otf",
	wasm: "application/wasm"
}

/**
 * Minimal structural view of a fetch response.
 *
 * `Response` in this project's type environment (Bun types, `lib` without DOM)
 * does not expose the standard members, and `express.Response` shares the name.
 * Describing only what we use keeps this honest instead of casting to `any`.
 */
type FetchResponse = {
	ok: boolean
	status: number
	headers: { get(name: string): string | null }
	body: ReadableStream<Uint8Array> | null
	text(): Promise<string>
}

const sendCloudinaryFile = async (id: string, filePath: string, res: Response) => {
	const url = getRawAssetUrl(`rwaft-dist/${id}/${filePath}`)
	const response = await fetch(url) as unknown as FetchResponse
	if (!response.ok) throw new Error(`Cloudinary returned ${response.status}`)

	const extension = path.extname(filePath).slice(1).toLowerCase()
	res.type(CONTENT_TYPES[extension] || "application/octet-stream")
	res.setHeader("Content-Disposition", "inline")
	// Deployed artifacts are public static files that anyone can already fetch
	// without a browser, so there is nothing here for an origin check to
	// protect. Saying so explicitly keeps `crossorigin` bundles and cross-origin
	// font loads working whatever origin the page was served from.
	res.setHeader("Access-Control-Allow-Origin", "*")
	// Hashed build assets are immutable; HTML must always be revalidated so a
	// redeploy is visible immediately.
	res.setHeader(
		"Cache-Control",
		extension === "html" ? "no-cache" : "public, max-age=31536000, immutable"
	)
	// Pages are small and need the badge spliced in, so they are buffered;
	// `send` sets the length of what is actually sent.
	if (extension === "html") {
		res.send(withBadge(await response.text()))
		return
	}
	// Only forward the upstream length when the upstream body was not encoded.
	// `fetch` transparently decodes gzip/br, so Cloudinary's content-length
	// describes the COMPRESSED bytes while the body streamed below is the
	// decompressed ones. Copying it made Node stop writing at the compressed
	// size, truncating every text asset mid-file (a 643-byte index.html was
	// served as its 290 brotli bytes). Without the header Node uses chunked
	// encoding, which is correct for a proxied stream of unknown length.
	const encoded = Boolean(response.headers.get("content-encoding"))
	const length = response.headers.get("content-length")
	if (length && !encoded) res.setHeader("Content-Length", length)

	if (!response.body) {
		res.end()
		return
	}
	// Stream rather than buffering: a large bundle should not sit in memory.
	await new Promise<void>((resolve, reject) => {
		Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])
			.on("error", reject)
			.on("end", resolve)
			.pipe(res)
	})
}

// ── Health ──────────────────────────────────────────────────────────────────

app.get(["/health", "/healthz"], async (_req, res) => {
	const redisOk = await isRedisHealthy()
	// Report 200 while degraded so the platform keeps the instance in rotation:
	// static asset serving still works without Redis.
	res.status(200).json({
		status: redisOk ? "healthy" : "degraded",
		service: "backend",
		redis: redisOk ? "connected" : "disconnected",
		timestamp: new Date().toISOString()
	})
})

// ── Session: hand every visitor a unique id ─────────────────────────────────

app.get("/session", (_req, res) => {
	res.setHeader("Cache-Control", "no-store")
	res.json({ userId: genUserId() })
})

// ── Accounts: Google sign-in and the token balance ──────────────────────────

/** Everything the frontend needs to decide what to render; it holds no secrets. */
app.get("/auth/config", (_req, res) => {
	res.setHeader("Cache-Control", "no-store")
	res.json({
		billing: BILLING_ENABLED,
		googleClientId: GOOGLE_CLIENT_ID || null,
		signupTokens: SIGNUP_TOKENS,
		costs: TOKEN_COSTS,
		currency: CURRENCY,
		// The packs are always listed with billing on, so recharging is visible
		// even before a payment provider is connected; `payments` says whether
		// they can actually be bought.
		packs: BILLING_ENABLED ? TOKEN_PACKS : [],
		payments: BILLING_ENABLED && isCheckoutConfigured ? "dodo" : null,
		testCredits: TEST_CREDITS_ENABLED,
		github: isGitHubConfigured
	})
})

app.post(
	"/auth/google",
	rateLimit({ name: "auth", limit: Number(process.env.AUTH_RATE_LIMIT || 30), windowSeconds: 10 * 60 }),
	async (req, res) => {
		const credential = (req.body as { credential?: unknown } | undefined)?.credential
		if (typeof credential !== "string" || !credential) {
			res.status(400).json({ status: "failed", message: "A Google credential is required" })
			return
		}
		if (!GOOGLE_CLIENT_ID) {
			res.status(503).json({ status: "failed", message: "Google sign-in is not configured on this server" })
			return
		}

		let profile
		try {
			profile = await verifyGoogleIdToken(credential)
		} catch (error) {
			console.warn("[auth] Rejected Google credential:", (error as Error).message)
			res.status(401).json({ status: "failed", message: "Google sign-in could not be verified" })
			return
		}

		try {
			const { account, created } = await upsertGoogleAccount(profile)
			if (created) void notifySignup(account)
			const token = await createSession(account.id)
			res.setHeader("Cache-Control", "no-store")
			res.json({ status: "success", token, account, created })
		} catch (error) {
			console.error("[auth] Sign-in failed:", (error as Error).message)
			res.status(503).json({ status: "failed", message: "Sign-in is temporarily unavailable" })
		}
	}
)

app.get("/auth/me", async (_req, res) => {
	res.setHeader("Cache-Control", "no-store")
	const accountId = res.locals.accountId as string | undefined
	if (!accountId) {
		res.status(401).json({ status: "failed", message: "Not signed in" })
		return
	}
	try {
		const account = await getAccount(accountId)
		if (!account) {
			res.status(401).json({ status: "failed", message: "Account not found" })
			return
		}
		res.json({ status: "success", account })
	} catch (error) {
		console.error("[auth] Account lookup failed:", (error as Error).message)
		res.status(503).json({ status: "failed", message: "Account service unavailable" })
	}
})

app.post("/auth/logout", async (_req, res) => {
	const token = res.locals.sessionToken as string | undefined
	if (token) await destroySession(token).catch(() => { })
	res.json({ status: "success" })
})

// ── Test top-up (local development only) ────────────────────────────────────

/**
 * Lets you exercise the whole recharge flow before a payment provider exists.
 * It is off unless ALLOW_TEST_CREDITS=true, and it switches itself off the
 * moment real checkout is configured, so a production deployment can never
 * hand out free credits through it.
 */
const TEST_CREDITS_ENABLED = BILLING_ENABLED && process.env.ALLOW_TEST_CREDITS === "true" && !isCheckoutConfigured
const TEST_CREDIT_AMOUNT = 5
/** Ceiling on a test balance, so a stuck button cannot inflate it without bound. */
const TEST_CREDIT_CAP = 100

if (TEST_CREDITS_ENABLED) {
	console.warn(`[billing] ALLOW_TEST_CREDITS is on: signed-in users can add ${TEST_CREDIT_AMOUNT} free test credits (up to ${TEST_CREDIT_CAP}). Never enable this in production.`)
}

app.post(
	"/billing/test-credits",
	rateLimit({ name: "test-credits", limit: 20, windowSeconds: 60 * 60 }),
	async (_req, res) => {
		const accountId = res.locals.accountId as string | undefined
		if (!TEST_CREDITS_ENABLED) {
			res.status(404).json({ status: "failed", message: "Test credits are not enabled" })
			return
		}
		if (!accountId) {
			res.status(401).json({ status: "failed", code: "sign_in_required", message: "Sign in to add credits" })
			return
		}
		try {
			const account = await getAccount(accountId)
			if (!account) {
				res.status(401).json({ status: "failed", message: "Account not found" })
				return
			}
			const added = Math.max(0, Math.min(TEST_CREDIT_AMOUNT, TEST_CREDIT_CAP - account.tokens))
			const redis = await getRedisClient()
			const balance = added > 0 ? await redis.hIncrBy(userKey(accountId), "tokens", added) : account.tokens
			res.json({ status: "success", added, balance })
		} catch (error) {
			console.error("[billing] Test top-up failed:", (error as Error).message)
			res.status(503).json({ status: "failed", message: "Could not add credits right now" })
		}
	}
)

// ── Buy tokens ──────────────────────────────────────────────────────────────

app.post("/billing/checkout", async (req, res) => {
	const accountId = res.locals.accountId as string | undefined
	if (!accountId) {
		res.status(401).json({ status: "failed", code: "sign_in_required", message: "Sign in to buy credits" })
		return
	}
	if (!BILLING_ENABLED || !isCheckoutConfigured) {
		res.status(404).json({ status: "failed", message: "Credit purchases are not enabled" })
		return
	}

	const packId = (req.body as { pack?: unknown } | undefined)?.pack
	const pack = TOKEN_PACKS.find((candidate) => candidate.id === packId)
	if (!pack) {
		res.status(400).json({ status: "failed", message: "Unknown credit pack" })
		return
	}

	// Dodo sends the buyer back to the page they came from. The Origin header
	// has already passed the CORS allowlist above, so this cannot be pointed at
	// an arbitrary site.
	const returnOrigin = (req.header("origin") || (process.env.FRONTEND_ORIGIN || "").split(",")[0] || "")
		.trim()
		.replace(/\/+$/, "")
	if (!/^https?:\/\//.test(returnOrigin)) {
		res.status(400).json({ status: "failed", message: "Cannot determine where to return after checkout" })
		return
	}

	try {
		const account = await getAccount(accountId)
		if (!account) {
			res.status(401).json({ status: "failed", message: "Account not found" })
			return
		}
		const url = await createCheckoutSession(account, pack, returnOrigin)
		res.json({ status: "success", url })
	} catch (error) {
		console.error("[billing] Checkout creation failed:", (error as Error).message)
		res.status(502).json({ status: "failed", message: "Could not start checkout" })
	}
})

// ── Place in the build line ─────────────────────────────────────────────────

app.get("/queue/:id", async (req, res) => {
	const { id } = req.params
	if (!isDeploymentId(id)) {
		res.status(400).json({ status: "failed", message: "Invalid deployment id" })
		return
	}
	try {
		const redis = await getRedisClient()
		const [status, line] = await Promise.all([
			redis.get(`${DEPLOYMENT_STATUS_PREFIX}${id}`),
			linePosition(id)
		])
		res.setHeader("Cache-Control", "no-store")
		res.json({ id, status: status || "unknown", ...line })
	} catch (error) {
		console.error("[queue] Lookup failed:", (error as Error).message)
		res.status(503).json({ status: "failed", message: "Queue service unavailable" })
	}
})

// ── Deployment status polling (fallback for when SSE is unavailable) ────────

app.get("/status/:id", async (req, res) => {
	const { id } = req.params
	if (!isDeploymentId(id)) {
		res.status(400).json({ status: "failed", message: "Invalid deployment id" })
		return
	}
	try {
		const redis = await getRedisClient()
		const status = await redis.get(`${DEPLOYMENT_STATUS_PREFIX}${id}`)
		res.setHeader("Cache-Control", "no-store")
		res.json({
			id,
			status: status || "unknown",
			url: buildDeploymentUrl(req, id)
		})
	} catch (error) {
		console.error("[status] Lookup failed:", (error as Error).message)
		res.status(503).json({ status: "failed", message: "Status service unavailable" })
	}
})

// ── Live logs over Server-Sent Events ───────────────────────────────────────

/**
 * Anonymous channels are guarded only by their unguessable id, as before. An
 * account's channel carries its builds and prompts, so only that account's
 * session may read or clear it.
 */
const canReadLogs = (userId: string, res: Response): boolean =>
	!isAccountId(userId) || res.locals.accountId === userId

/**
 * Streams the build log for one user.
 *
 * SSE rather than WebSockets: the traffic is one-way, it survives ordinary
 * HTTP proxies, and the browser's EventSource reconnects on its own. Each
 * connection replays recent history first so a reconnect is seamless, then
 * follows the user's Redis pub/sub channel live.
 */
app.get("/logs/:userId", async (req, res) => {
	const { userId } = req.params
	if (!isUserId(userId)) {
		res.status(400).json({ status: "failed", message: "Invalid user id" })
		return
	}
	if (!canReadLogs(userId, res)) {
		res.status(401).json({ status: "failed", message: "Sign in to view this build log" })
		return
	}

	res.writeHead(200, {
		"Content-Type": "text/event-stream; charset=utf-8",
		"Cache-Control": "no-cache, no-transform",
		Connection: "keep-alive",
		// Tells nginx-style proxies not to buffer the stream.
		"X-Accel-Buffering": "no"
	})
	res.flushHeaders?.()
	// SSE connections are long-lived by design; disable the socket idle timeout.
	req.socket.setTimeout(0)
	req.socket.setNoDelay(true)
	req.socket.setKeepAlive(true)

	// Ask the browser to wait 3s before reconnecting after a drop.
	res.write("retry: 3000\n\n")

	const send = (payload: string) => {
		// Guard against a malformed payload breaking the SSE framing.
		const data = payload.replace(/\n/g, " ")
		res.write(`data: ${data}\n\n`)
	}

	let unsubscribe: (() => Promise<void>) | undefined
	try {
		// Subscribe BEFORE replaying history, so nothing published in between is
		// lost. Duplicates are possible instead, which the client de-dupes on seq.
		unsubscribe = await subscribeToUserLogs(userId, send)

		const history = await readLogHistory(userId, SSE_HISTORY_LIMIT)
		for (const entry of history) send(entry)
		send(JSON.stringify({ type: "ready", ts: Date.now() }))
	} catch (error) {
		console.error("[logs] Failed to attach stream:", (error as Error).message)
		send(JSON.stringify({ type: "error", message: "Log stream unavailable", ts: Date.now() }))
		res.end()
		return
	}

	// Comment frames keep intermediaries from closing an idle connection.
	const heartbeat = setInterval(() => res.write(": ping\n\n"), SSE_HEARTBEAT_MS)

	const cleanup = () => {
		clearInterval(heartbeat)
		void unsubscribe?.()
	}
	req.on("close", cleanup)
	res.on("close", cleanup)
})

/** Lets a user clear their own retained log history. */
app.delete("/logs/:userId", async (req, res) => {
	const { userId } = req.params
	if (!isUserId(userId)) {
		res.status(400).json({ status: "failed", message: "Invalid user id" })
		return
	}
	if (!canReadLogs(userId, res)) {
		res.status(401).json({ status: "failed", message: "Sign in to view this build log" })
		return
	}
	try {
		await clearLogHistory(userId)
		res.json({ status: "success" })
	} catch (error) {
		console.error("[logs] Clear failed:", (error as Error).message)
		res.status(503).json({ status: "failed", message: "Log service unavailable" })
	}
})

// ── Deploy a Git repository ─────────────────────────────────────────────────

/**
 * Queues a job and puts it in the build line. Undoes both, and refunds, if the
 * push fails, so a user is never charged for a job that does not exist.
 */
const enqueueJob = async (queue: string, job: { id: string; charge?: JobCharge } & Record<string, unknown>) => {
	const redis = await getRedisClient()
	await redis.set(`${DEPLOYMENT_STATUS_PREFIX}${job.id}`, "queued", { EX: STATUS_TTL_SECONDS })
	await joinLine(job.id)
	try {
		await redis.rPush(queue, JSON.stringify(job))
	} catch (error) {
		await leaveLine(job.id).catch(() => { })
		throw error
	}
}

app.post(
	"/deploy",
	requireAccountWhenBilling,
	rateLimit({ name: "deploy", limit: DEPLOY_RATE_LIMIT, windowSeconds: 60 * 60 }),
	async (req, res) => {
		const validation = validateRepositoryUrl((req.body as { url?: unknown } | undefined)?.url)
		if (!validation.ok) {
			res.status(400).json({ status: "failed", message: validation.reason })
			return
		}

		const userId = resolveUserId(req, res)
		const id = genId()
		const outputPath = path.join(stagingRoot, id)
		const deploymentUrl = buildDeploymentUrl(req, id)

		try {
			await getRedisClient()
		} catch (error) {
			console.error("[deploy] Redis unavailable:", (error as Error).message)
			res.status(503).json({ status: "failed", message: "Deployment service is temporarily unavailable" })
			return
		}

		// Charged before the clone, which is the expensive part of this request.
		// Every failure below refunds.
		const charge = await chargeForBuild(res, "deploy")
		if (charge === null) return

		try {
			await fs.mkdir(stagingRoot, { recursive: true })
			// Shallow clone: history is irrelevant to a build and full history on a
			// large repo is the slowest, heaviest part of this request.
			await simpleGit({ timeout: { block: CLONE_TIMEOUT_MS } })
				.clone(validation.url, outputPath, ["--depth", "1", "--single-branch"])
		} catch (error) {
			await fs.rm(outputPath, { recursive: true, force: true }).catch(() => { })
			await refundCharge(id, charge)
			console.error("[deploy] Clone failed:", (error as Error).message)
			res.status(400).json({ status: "failed", message: "Failed to clone repository. Check that the URL is public and correct." })
			return
		}

		try {
			const fileNames = await getAllFileNames(outputPath)
			if (fileNames.length === 0) throw new Error("Repository is empty")

			for (let index = 0; index < fileNames.length; index += UPLOAD_BATCH_SIZE) {
				const batch = fileNames.slice(index, index + UPLOAD_BATCH_SIZE)
				await Promise.all(batch.map(async (fileName) => {
					try {
						return await uploadFile(fileName, outputPath, `rwaft/${id}`)
					} catch (error) {
						const detail = error as { message?: string; http_code?: number }
						throw new Error(`Failed to upload ${path.relative(outputPath, fileName)}: ${detail.message ?? String(error)}${detail.http_code ? ` (HTTP ${detail.http_code})` : ""}`)
					}
				}))
			}
		} catch (error) {
			await refundCharge(id, charge)
			console.error("[deploy] Repository upload failed:", error)
			res.status(500).json({ status: "failed", message: "Failed to stage repository files" })
			return
		} finally {
			await fs.rm(outputPath, { recursive: true, force: true }).catch(() => { })
		}

		try {
			await enqueueJob(DEPLOY_QUEUE, {
				id,
				userId,
				url: validation.url,
				deploymentUrl,
				assetBase: assetBaseFor(id),
				charge
			})
		} catch (error) {
			await refundCharge(id, charge)
			console.error("[deploy] Queue push failed:", (error as Error).message)
			res.status(503).json({ status: "failed", message: "Failed to queue deployment" })
			return
		}

		res.status(202).json({ status: "success", id, userId, url: deploymentUrl, charged: charge?.tokens ?? 0 })
	}
)

// ── Generate an app from a prompt ───────────────────────────────────────────

app.post(
	"/prompt",
	requireAccountWhenBilling,
	rateLimit({ name: "prompt", limit: PROMPT_RATE_LIMIT, windowSeconds: 60 * 60 }),
	async (req, res) => {
		const body = (req.body ?? {}) as { prompt?: unknown; from?: unknown }
		const prompt = typeof body.prompt === "string" ? body.prompt.trim() : ""
		if (!prompt) {
			res.status(400).json({ status: "failed", message: "A prompt is required" })
			return
		}
		if (prompt.length > MAX_PROMPT_CHARS) {
			res.status(400).json({ status: "failed", message: `Prompt must be ${MAX_PROMPT_CHARS} characters or fewer` })
			return
		}

		// `from`: change that earlier build instead of starting a new app. Checked
		// before charging, so a change that cannot happen costs nothing.
		let baseId: string | undefined
		if (body.from !== undefined && body.from !== null && body.from !== "") {
			if (typeof body.from !== "string" || !isDeploymentId(body.from)) {
				res.status(400).json({ status: "failed", message: "Invalid build to change" })
				return
			}
			try {
				const snapshot = await readSnapshot(body.from)
				// Someone else's build answers exactly like an expired one.
				if (!snapshot || !snapshot.hasFiles || !isRequester(snapshot.owner, req, res)) {
					res.status(404).json({
						status: "failed",
						code: "source_expired",
						message: "This app's code is no longer kept (it's kept for a day after each build), so it can't be changed. Go back home and describe the whole app to build it again."
					})
					return
				}
			} catch (error) {
				console.error("[prompt] Source lookup failed:", (error as Error).message)
				res.status(503).json({ status: "failed", message: "Generation service is temporarily unavailable" })
				return
			}
			baseId = body.from
		}

		const userId = resolveUserId(req, res)
		const id = genId()
		const deploymentUrl = buildDeploymentUrl(req, id)

		const charge = await chargeForBuild(res, "prompt")
		if (charge === null) return

		try {
			await enqueueJob(PROMPT_QUEUE, {
				id,
				userId,
				prompt,
				...(baseId ? { baseId } : {}),
				deploymentUrl,
				assetBase: assetBaseFor(id),
				charge
			})
		} catch (error) {
			await refundCharge(id, charge)
			console.error("[prompt] Queue push failed:", (error as Error).message)
			res.status(503).json({ status: "failed", message: "Generation service is temporarily unavailable" })
			return
		}

		res.status(202).json({ status: "success", id, userId, url: deploymentUrl, charged: charge?.tokens ?? 0, ...(baseId ? { from: baseId } : {}) })
	}
)

// ── Admin: accounts and their credits ───────────────────────────────────────

app.get("/admin/users", requireAdmin, async (req, res) => {
	const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1)
	const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize ?? "25"), 10) || 25))
	const query = typeof req.query.q === "string" ? req.query.q.slice(0, 200) : ""
	try {
		res.json({ status: "success", ...await listUsers(page, pageSize, query) })
	} catch (error) {
		console.error("[admin] User listing failed:", (error as Error).message)
		res.status(503).json({ status: "failed", message: "Could not read accounts right now" })
	}
})

// ── Push a generated app's source to the user's GitHub ──────────────────────

/** Time allowed for GitHub's consent screen; the push record expires with it. */
const GITHUB_PUSH_TTL_SECONDS = 15 * 60

interface PushRecord {
	userId: string
	buildId: string
	name: string
	private: boolean
	state: "authorizing" | "pushing" | "done" | "failed"
	repoUrl?: string
	message?: string
}

const isPushId = (value: string) => /^[A-Za-z0-9_-]{32}$/.test(value)

/**
 * Whether this request comes from the user a build belongs to: the account it
 * ran under, or the anonymous id it ran under. Both are accepted because a
 * build started before signing in still belongs to that visitor afterwards.
 */
const isRequester = (owner: string, req: Request, res: Response): boolean => {
	if (typeof res.locals.accountId === "string" && owner === res.locals.accountId) return true
	const anonymous = (req.header("x-user-id") || "").trim()
	return isUserId(anonymous) && !isAccountId(anonymous) && owner === anonymous
}

/** Must match the OAuth App's "Authorization callback URL" on GitHub exactly. */
const githubRedirectUri = (req: Request) =>
	process.env.GITHUB_REDIRECT_URI?.trim() || `${publicOrigin(req)}/github/callback`

const readPush = async (pushId: string): Promise<PushRecord | null> => {
	const redis = await getRedisClient()
	const raw = await redis.get(githubPushKey(pushId))
	return raw ? JSON.parse(raw) as PushRecord : null
}

const writePush = async (pushId: string, record: PushRecord) => {
	const redis = await getRedisClient()
	await redis.set(githubPushKey(pushId), JSON.stringify(record), { EX: GITHUB_PUSH_TTL_SECONDS })
}

const escapeHtml = (text: string) =>
	text.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!)

/** What the GitHub popup lands on. The console learns the outcome by polling, so this only has to read well. */
const sendGitHubPage = (res: Response, status: number, title: string, message: string, link: string | undefined, autoClose: boolean) => {
	res.status(status).type("html").setHeader("Cache-Control", "no-store")
	res.send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>`
		+ `<style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;font:15px/1.6 system-ui,sans-serif;background:Canvas;color:CanvasText}main{max-width:440px;padding:32px 24px;text-align:center}h1{margin:0 0 8px;font-size:20px}p{margin:0 0 12px;opacity:.8;overflow-wrap:anywhere}a{color:inherit;font-weight:600}</style>`
		+ `<main><h1>${title}</h1><p>${escapeHtml(message)}</p>`
		+ (link ? `<p><a href="${escapeHtml(link)}">${escapeHtml(link.replace(/^https:\/\//, ""))}</a></p>` : "")
		+ `<p>You can close this window and go back to rwaft.</p></main>`
		+ (autoClose ? "<script>setTimeout(function(){window.close()},1500)</script>" : "")
		+ "</html>")
}

const sendPushPage = (res: Response, status: number, outcome: "done" | "failed", message: string, repoUrl?: string) =>
	sendGitHubPage(res, status, outcome === "done" ? "Pushed to GitHub" : "Push to GitHub failed", message, repoUrl, outcome === "done")

/** Whether this build's source can be pushed, or where it already went. */
app.get("/github/source/:id", async (req, res) => {
	res.setHeader("Cache-Control", "no-store")
	const { id } = req.params
	if (!isDeploymentId(id)) {
		res.status(400).json({ status: "failed", message: "Invalid deployment id" })
		return
	}
	try {
		const snapshot = isGitHubConfigured ? await readSnapshot(id) : null
		// Someone else's build answers exactly like an expired one.
		if (!snapshot || !isRequester(snapshot.owner, req, res)) {
			res.json({ status: "success", available: false, repoUrl: null })
			return
		}
		res.json({ status: "success", available: !snapshot.repoUrl, repoUrl: snapshot.repoUrl ?? null })
	} catch (error) {
		console.error("[github] Source lookup failed:", (error as Error).message)
		res.status(503).json({ status: "failed", message: "GitHub export is temporarily unavailable" })
	}
})

/** Starts a push: records what to push, and hands back GitHub's consent URL for the popup. */
app.post(
	"/github/push",
	rateLimit({ name: "github", limit: Number(process.env.GITHUB_RATE_LIMIT || 20), windowSeconds: 60 * 60 }),
	async (req, res) => {
		if (!isGitHubConfigured) {
			res.status(503).json({ status: "failed", message: "Pushing to GitHub isn't set up on this server" })
			return
		}
		const body = (req.body ?? {}) as { id?: unknown; name?: unknown; private?: unknown }
		if (typeof body.id !== "string" || !isDeploymentId(body.id)) {
			res.status(400).json({ status: "failed", message: "Invalid deployment id" })
			return
		}
		if (!isRepositoryName(body.name)) {
			res.status(400).json({ status: "failed", message: "Use letters, numbers, dots, dashes or underscores for the repository name, up to 100 characters" })
			return
		}
		const privateRepo = body.private === true

		try {
			const snapshot = await readSnapshot(body.id)
			if (!snapshot || !isRequester(snapshot.owner, req, res)) {
				res.status(404).json({ status: "failed", code: "source_expired", message: "This build's source is no longer kept. Build the app again to push it to GitHub." })
				return
			}
			if (snapshot.repoUrl) {
				res.status(409).json({ status: "failed", code: "already_pushed", message: "This build is already on GitHub", repoUrl: snapshot.repoUrl })
				return
			}

			const pushId = randomBytes(24).toString("base64url")
			await writePush(pushId, { userId: snapshot.owner, buildId: body.id, name: body.name, private: privateRepo, state: "authorizing" })
			res.json({ status: "success", pushId, authorizeUrl: authorizeUrl(pushId, githubRedirectUri(req), privateRepo) })
		} catch (error) {
			console.error("[github] Push start failed:", (error as Error).message)
			res.status(503).json({ status: "failed", message: "GitHub export is temporarily unavailable" })
		}
	}
)

/** Polled by the console while the popup is open. */
app.get("/github/push/:pushId", async (req, res) => {
	res.setHeader("Cache-Control", "no-store")
	const { pushId } = req.params
	try {
		const record = isPushId(pushId) ? await readPush(pushId) : null
		if (!record || !isRequester(record.userId, req, res)) {
			res.status(404).json({ status: "failed", message: "This push has expired. Start it again." })
			return
		}
		res.json({ status: "success", state: record.state, repoUrl: record.repoUrl ?? null, message: record.message ?? null })
	} catch (error) {
		console.error("[github] Push lookup failed:", (error as Error).message)
		res.status(503).json({ status: "failed", message: "GitHub export is temporarily unavailable" })
	}
})

/**
 * GitHub sends the popup here after the consent screen. The whole push happens
 * in this request, and the token is revoked before it ends, whatever happened.
 */
app.get("/github/callback", async (req, res) => {
	const pushId = typeof req.query.state === "string" ? req.query.state : ""
	const code = typeof req.query.code === "string" ? req.query.code : ""
	// The OAuth App has one callback URL, so pull requests land here too.
	if (isPrRequestId(pushId)) {
		await handlePrCallback(req, res, pushId, code)
		return
	}
	if (!isPushId(pushId)) {
		sendPushPage(res, 400, "failed", "This GitHub link is not valid.")
		return
	}

	let record: PushRecord | null
	try {
		const redis = await getRedisClient()
		// One callback per push: a reload or a replayed URL must not push twice.
		const claimed = await redis.set(`${githubPushKey(pushId)}:claimed`, "1", { NX: true, EX: GITHUB_PUSH_TTL_SECONDS })
		record = await readPush(pushId)
		if (!record) {
			sendPushPage(res, 410, "failed", "This push has expired. Start it again from rwaft.")
			return
		}
		if (claimed !== "OK") {
			if (record.state === "done") sendPushPage(res, 200, "done", "Your code is on GitHub.", record.repoUrl)
			else sendPushPage(res, 409, "failed", record.message || "This push is already being handled. Go back to rwaft to see how it went.")
			return
		}
	} catch (error) {
		console.error("[github] Callback lookup failed:", (error as Error).message)
		sendPushPage(res, 503, "failed", "GitHub export is temporarily unavailable. Try again in a moment.")
		return
	}

	if (!code) {
		const message = "GitHub access wasn't granted, so nothing was pushed."
		await writePush(pushId, { ...record, state: "failed", message }).catch(() => { })
		sendPushPage(res, 200, "failed", message)
		return
	}

	await writePush(pushId, { ...record, state: "pushing" }).catch(() => { })
	let token: string | undefined
	try {
		token = await exchangeCode(code, githubRedirectUri(req))
		const files = await readSnapshotFiles(record.buildId)
		if (!files) throw new Error("This build's source is no longer kept, so there was nothing to push.")
		const repo = await pushToNewRepository(token, record.name, record.private, files)
		// Cleanup: the source has done its job; only the repo link stays.
		await markSnapshotPushed(record.buildId, repo.html_url)
		await writePush(pushId, { ...record, state: "done", repoUrl: repo.html_url })
		sendPushPage(res, 200, "done", `Pushed ${files.length} files to ${repo.full_name}.`, repo.html_url)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.error(`[github] Push for ${record.buildId} failed${error instanceof GitHubError ? ` (${error.status})` : ""}:`, message)
		await writePush(pushId, { ...record, state: "failed", message }).catch(() => { })
		sendPushPage(res, 502, "failed", message)
	} finally {
		if (token) {
			await revokeToken(token).catch((error) => console.warn("[github] Token revoke failed:", (error as Error).message))
		}
	}
})

// ── Open a pull request on a GitHub repository ──────────────────────────────
//
// The user names a repository and describes a change. After GitHub's consent
// screen, a worker reads only the files the AI asks for through GitHub's API,
// writes the change as one commit on a new branch (on a fork when the user
// can't push to the repository) and opens the pull request from the user's
// account. Nothing is cloned.

/** Time allowed for GitHub's consent screen, as for a push. */
const PR_REQUEST_TTL_SECONDS = 15 * 60
/** How long the encrypted token waits for its job: the line ahead of it plus the job's own run. */
const PR_TOKEN_TTL_SECONDS = Number(process.env.PR_TOKEN_TTL_SECONDS || 60 * 60)
const PR_RATE_LIMIT = Number(process.env.PR_RATE_LIMIT || (BILLING_ENABLED ? 20 : 3))
const PR_RESULT_FIELDS = ["owner", "url", "title", "number", "files", "branch", "base", "fork"] as const

interface PrRequest {
	/** The log channel the job reports to: the account, or the anonymous visitor. */
	userId: string
	/** The account the job is charged to, once GitHub access is granted. */
	accountId?: string
	repo: RepositoryRef
	prompt: string
	private: boolean
	state: "authorizing" | "starting" | "queued" | "failed"
	jobId?: string
	repoUrl?: string
	charged?: number
	message?: string
}

/** Distinct from a push id (exactly 32 characters), so the shared callback can tell them apart. */
const isPrRequestId = (value: string) => /^pr-[A-Za-z0-9_-]{32}$/.test(value)

const readPrRequest = async (requestId: string): Promise<PrRequest | null> => {
	const redis = await getRedisClient()
	const raw = await redis.get(githubPrKey(requestId))
	return raw ? JSON.parse(raw) as PrRequest : null
}

const writePrRequest = async (requestId: string, record: PrRequest) => {
	const redis = await getRedisClient()
	await redis.set(githubPrKey(requestId), JSON.stringify(record), { EX: PR_REQUEST_TTL_SECONDS })
}

/** Starts a pull request: checks what can be checked before GitHub, then hands back the consent URL for the popup. */
app.post(
	"/github/pr",
	requireAccountWhenBilling,
	rateLimit({ name: "github-pr", limit: PR_RATE_LIMIT, windowSeconds: 60 * 60 }),
	async (req, res) => {
		if (!isGitHubConfigured) {
			res.status(503).json({ status: "failed", message: "Opening pull requests isn't set up on this server" })
			return
		}
		const body = (req.body ?? {}) as { repo?: unknown; prompt?: unknown; private?: unknown }
		const parsed = parseRepository(body.repo)
		if (!parsed.ok) {
			res.status(400).json({ status: "failed", message: parsed.reason })
			return
		}
		const prompt = typeof body.prompt === "string" ? body.prompt.trim() : ""
		if (!prompt) {
			res.status(400).json({ status: "failed", message: "Describe the change you want" })
			return
		}
		if (prompt.length > MAX_PROMPT_CHARS) {
			res.status(400).json({ status: "failed", message: `Keep the description to ${MAX_PROMPT_CHARS} characters or fewer` })
			return
		}
		const userId = resolveUserId(req, res)
		if (!userId) {
			res.status(400).json({ status: "failed", message: "Still setting up your session. Try again in a moment." })
			return
		}
		const privateRepo = body.private === true
		const accountId = typeof res.locals.accountId === "string" ? res.locals.accountId : undefined
		const { repo } = parsed

		try {
			// Checked, not charged: the charge waits until GitHub access is granted,
			// but nobody should approve access only to hear they're out of credits.
			const cost = TOKEN_COSTS.pr
			if (BILLING_ENABLED && cost > 0 && accountId) {
				const balance = (await getAccount(accountId))?.tokens ?? 0
				if (balance < cost) {
					res.status(402).json({
						status: "failed",
						code: "insufficient_tokens",
						message: `You're out of credits: this costs ${cost} and you have ${balance}. Buy more to keep building.`,
						balance,
						cost
					})
					return
				}
			}
			if (!privateRepo && await isPublicRepository(repo) === false) {
				res.status(404).json({
					status: "failed",
					code: "repo_not_found",
					message: `There's no public repository at github.com/${repo.owner}/${repo.name}. Check the link, or tick "Private repository" if it's private.`
				})
				return
			}

			const requestId = `pr-${randomBytes(24).toString("base64url")}`
			await writePrRequest(requestId, { userId, accountId, repo, prompt, private: privateRepo, state: "authorizing" })
			res.json({ status: "success", requestId, authorizeUrl: authorizeUrl(requestId, githubRedirectUri(req), privateRepo) })
		} catch (error) {
			console.error("[github] PR start failed:", (error as Error).message)
			res.status(503).json({ status: "failed", message: "Opening pull requests is temporarily unavailable" })
		}
	}
)

/** Polled by the console while the GitHub window is open, until the job is queued. */
app.get("/github/pr/:requestId", async (req, res) => {
	res.setHeader("Cache-Control", "no-store")
	const { requestId } = req.params
	try {
		const record = isPrRequestId(requestId) ? await readPrRequest(requestId) : null
		if (!record || !isRequester(record.userId, req, res)) {
			res.status(404).json({ status: "failed", message: "This request has expired. Start it again." })
			return
		}
		res.json({
			status: "success",
			state: record.state,
			jobId: record.jobId ?? null,
			repoUrl: record.repoUrl ?? null,
			charged: record.charged ?? 0,
			message: record.message ?? null
		})
	} catch (error) {
		console.error("[github] PR lookup failed:", (error as Error).message)
		res.status(503).json({ status: "failed", message: "Opening pull requests is temporarily unavailable" })
	}
})

/** The pull request a finished job opened. */
app.get("/github/pr-result/:id", async (req, res) => {
	res.setHeader("Cache-Control", "no-store")
	const { id } = req.params
	if (!isDeploymentId(id)) {
		res.status(400).json({ status: "failed", message: "Invalid job id" })
		return
	}
	try {
		const redis = await getRedisClient()
		const [owner, url, title, number, files, branch, base, fork] = await redis.hmGet(prResultKey(id), [...PR_RESULT_FIELDS])
		// Someone else's pull request answers exactly like a missing one.
		if (!owner || !url || !isRequester(owner, req, res)) {
			res.json({ status: "success", available: false })
			return
		}
		let changed: string[] = []
		try {
			const list = JSON.parse(files || "[]")
			if (Array.isArray(list)) changed = list.filter((entry): entry is string => typeof entry === "string")
		} catch { /* an unreadable list only hides the file names */ }
		res.json({ status: "success", available: true, url, title: title || "", number: Number(number) || null, files: changed, branch: branch || "", base: base || "", fork: fork === "1" })
	} catch (error) {
		console.error("[github] PR result lookup failed:", (error as Error).message)
		res.status(503).json({ status: "failed", message: "Opening pull requests is temporarily unavailable" })
	}
})

const sendPrPage = (res: Response, status: number, outcome: "started" | "failed", message: string, link?: string) =>
	sendGitHubPage(res, status, outcome === "started" ? "Pull request started" : "Pull request not started", message, link, outcome === "started")

/**
 * The PR half of the shared callback. Exchanges the code, checks the user can
 * see the repository, charges, and queues the job with the token encrypted
 * beside it. From then on the worker owns the token and revokes it; any
 * failure before that revokes it here.
 */
async function handlePrCallback(req: Request, res: Response, requestId: string, code: string) {
	let record: PrRequest | null
	try {
		const redis = await getRedisClient()
		// One callback per request: a reload or a replayed URL must not start two jobs.
		const claimed = await redis.set(`${githubPrKey(requestId)}:claimed`, "1", { NX: true, EX: PR_REQUEST_TTL_SECONDS })
		record = await readPrRequest(requestId)
		if (!record) {
			sendPrPage(res, 410, "failed", "This request has expired. Start it again from rwaft.")
			return
		}
		if (claimed !== "OK") {
			if (record.state === "queued") sendPrPage(res, 200, "started", "rwaft is already working on this pull request.", record.repoUrl)
			else sendPrPage(res, 409, "failed", record.message || "This request is already being handled. Go back to rwaft to see how it went.")
			return
		}
	} catch (error) {
		console.error("[github] PR callback lookup failed:", (error as Error).message)
		sendPrPage(res, 503, "failed", "Opening pull requests is temporarily unavailable. Try again in a moment.")
		return
	}

	if (!code) {
		const message = "GitHub access wasn't granted, so nothing was started."
		await writePrRequest(requestId, { ...record, state: "failed", message }).catch(() => { })
		sendPrPage(res, 200, "failed", message)
		return
	}

	await writePrRequest(requestId, { ...record, state: "starting" }).catch(() => { })
	const jobId = genId()
	const { repo } = record
	let token: string | undefined
	let charge: JobCharge | undefined
	let handedOver = false
	try {
		token = await exchangeCode(code, githubRedirectUri(req))
		let info: RepositoryInfo
		try {
			info = await getRepository(token, repo)
		} catch (error) {
			if (error instanceof GitHubError && error.status === 404) {
				throw new Error(`GitHub says you can't see ${repo.owner}/${repo.name}. Check the link${record.private ? "" : ", or tick \"Private repository\" if it's private"}.`)
			}
			throw error
		}
		if (info.archived || info.disabled) throw new Error(`${info.full_name} is archived, so it can't take pull requests.`)

		const cost = TOKEN_COSTS.pr
		if (BILLING_ENABLED && cost > 0 && record.accountId) {
			const spent = await spendTokens(record.accountId, cost)
			if (!spent.ok) throw new Error(`You're out of credits: this costs ${cost} and you have ${spent.balance}. Buy more to keep building.`)
			charge = { userId: record.accountId, tokens: cost }
		}

		const redis = await getRedisClient()
		await redis.set(prTokenKey(jobId), sealToken(token), { EX: PR_TOKEN_TTL_SECONDS })
		await enqueueJob(PR_QUEUE, {
			id: jobId,
			userId: record.userId,
			prompt: record.prompt,
			repo,
			deploymentUrl: info.html_url,
			charge
		})
		handedOver = true
		await writePrRequest(requestId, { ...record, state: "queued", jobId, repoUrl: info.html_url, charged: charge?.tokens ?? 0 })
		sendPrPage(res, 200, "started", `rwaft is reading ${info.full_name} and writing your change. Watch it in rwaft; the pull request opens on GitHub when it's done.`, info.html_url)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.error(`[github] PR for ${repo.owner}/${repo.name} not started${error instanceof GitHubError ? ` (${error.status})` : ""}:`, message)
		await refundCharge(jobId, charge)
		await getRedisClient().then((redis) => redis.del(prTokenKey(jobId))).catch(() => { })
		await writePrRequest(requestId, { ...record, state: "failed", message }).catch(() => { })
		sendPrPage(res, 502, "failed", message)
	} finally {
		if (token && !handedOver) {
			await revokeToken(token).catch((error) => console.warn("[github] Token revoke failed:", (error as Error).message))
		}
	}
}

// ── Deployed site proxy (registered last: it matches everything) ────────────

app.get("/{*splat}", async (req, res) => {
	const splat = req.params.splat
	const parts: string[] = (Array.isArray(splat) ? splat : [splat])
		.filter((part): part is string => typeof part === "string" && part.length > 0)

	// Subdomain routing only applies when wildcard hosting is enabled AND the
	// request actually arrived on the wildcard domain. The API is reachable on
	// its own hostname too, where the id still comes from the path.
	const hostname = req.hostname.toLowerCase()
	const onDeploymentDomain =
		USE_WILDCARD_SUBDOMAINS && hostname.endsWith(`.${DEPLOYMENT_DOMAIN.toLowerCase()}`)
	const label = hostname.split(".")[0] || ""
	const hostnameId = onDeploymentDomain && isDeploymentId(label) ? label : ""
	const deploymentId = hostnameId || parts.shift()

	if (!deploymentId || !isDeploymentId(deploymentId)) {
		res.status(404).json({ status: "Deployment not found" })
		return
	}

	// Deployments built before wildcard hosting was switched on have `/<id>/`
	// baked into their asset URLs, so on a subdomain they request
	// `<id>.domain/<id>/assets/*`. Dropping the redundant prefix keeps those
	// older builds serving instead of 404ing every asset.
	if (hostnameId && parts[0] === hostnameId) parts.shift()

	let deploymentStatus: string | null = null
	try {
		const redis = await getRedisClient()
		deploymentStatus = await redis.get(`${DEPLOYMENT_STATUS_PREFIX}${deploymentId}`)
	} catch {
		// Redis is down but the artifacts live on Cloudinary — serve them anyway.
	}

	if (deploymentStatus === "queued" || deploymentStatus === "building") {
		const position = deploymentStatus === "queued"
			? await linePosition(deploymentId).then((line) => line.position).catch(() => null)
			: null
		const message = position
			? `Your site is #${position} in the build queue. It starts as soon as the builds ahead of it finish.`
			: "Your site is still building."
		res.status(202)
			.type("html")
			.setHeader("Cache-Control", "no-store")
		res.send(`<!doctype html><meta charset="utf-8"><title>Building deployment</title><meta http-equiv="refresh" content="3"><body style="font-family:system-ui;padding:2rem"><p>${message} This page refreshes automatically.</p></body>`)
		return
	}
	if (deploymentStatus === "failed") {
		res.status(503).type("html").send(`<!doctype html><meta charset="utf-8"><title>Deployment failed</title><body style="font-family:system-ui;padding:2rem"><p>This deployment failed to build.</p></body>`)
		return
	}

	const requestedPath = parts.join("/") || "index.html"
	// Cloudinary public ids are flat strings, so traversal cannot escape a real
	// filesystem here — but a "../" segment would still address another
	// deployment's folder.
	if (requestedPath.split("/").some((part) => part === ".." || part === ".")) {
		res.status(400).json({ status: "Invalid file path" })
		return
	}

	try {
		await sendCloudinaryFile(deploymentId, requestedPath, res)
	} catch (error) {
		// SPA fallback: an extension-less path is a client-side route, so serve
		// the app shell and let the router handle it.
		if (!path.extname(requestedPath)) {
			try {
				await sendCloudinaryFile(deploymentId, "index.html", res)
				return
			} catch { /* fall through to 404 */ }
		}
		console.error(`[proxy] Missing ${deploymentId}/${requestedPath}:`, (error as Error).message)
		if (!res.headersSent) res.status(404).json({ status: "File not found" })
	}
})

// ── Errors, startup and shutdown ────────────────────────────────────────────

app.use((error: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: express.NextFunction) => {
	if (res.headersSent) return

	// body-parser rejects malformed or oversized bodies. Those are client
	// mistakes, so they must not be reported as a server fault.
	if (error.type === "entity.parse.failed") {
		res.status(400).json({ status: "failed", message: "Request body is not valid JSON" })
		return
	}
	if (error.type === "entity.too.large") {
		res.status(413).json({ status: "failed", message: "Request body is too large" })
		return
	}

	console.error("[express] Unhandled error:", error)
	res.status(500).json({ status: "failed", message: "Internal server error" })
})

process.on("uncaughtException", (error) => console.error("[process] Uncaught exception:", error))
process.on("unhandledRejection", (reason) => console.error("[process] Unhandled rejection:", reason))

const server = app.listen(PORT, HOST, () => {
	console.log(`[backend] Listening on ${HOST}:${PORT}`)
	console.log(`[backend] Deployment URLs: ${USE_WILDCARD_SUBDOMAINS ? `https://<id>.${DEPLOYMENT_DOMAIN}/` : "<public-origin>/<id>/"}`)
	void verifyDodoSetup()
	void verifySignupAlert()
})
// SSE streams must not be cut off by the default request timeout.
server.requestTimeout = 0
server.headersTimeout = 65_000
server.keepAliveTimeout = 61_000

let shuttingDown = false
const shutdown = async (signal: string) => {
	if (shuttingDown) return
	shuttingDown = true
	console.log(`[backend] ${signal} received - draining connections`)
	// Force exit if a client refuses to let go of a keep-alive/SSE connection.
	const force = setTimeout(() => process.exit(0), Number(process.env.SHUTDOWN_GRACE_MS || 15_000))
	force.unref()
	server.close(async () => {
		await closeLogStream().catch(() => { })
		await closeRedis().catch(() => { })
		process.exit(0)
	})
}

process.on("SIGTERM", () => { void shutdown("SIGTERM") })
process.on("SIGINT", () => { void shutdown("SIGINT") })
