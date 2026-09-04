import fs from "node:fs/promises"
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
import { rateLimit } from "./lib/ratelimit.ts"
import { clearLogHistory, closeLogStream, readLogHistory, subscribeToUserLogs } from "./lib/logstream.ts"
import { DEPLOY_QUEUE, DEPLOYMENT_STATUS_PREFIX, PROMPT_QUEUE } from "./lib/constants.ts"

const app = express()
const PORT = Number(process.env.PORT || 3000)
const HOST = process.env.HOST || "0.0.0.0"
const UPLOAD_BATCH_SIZE = Number(process.env.UPLOAD_BATCH_SIZE || 10)
const STATUS_TTL_SECONDS = Number(process.env.STATUS_TTL_SECONDS || 24 * 60 * 60)
const MAX_PROMPT_CHARS = Number(process.env.MAX_PROMPT_CHARS || 8_000)
const SSE_HEARTBEAT_MS = Number(process.env.SSE_HEARTBEAT_MS || 25_000)
const SSE_HISTORY_LIMIT = Number(process.env.SSE_HISTORY_LIMIT || 300)
const CLONE_TIMEOUT_MS = Number(process.env.CLONE_TIMEOUT_MS || 120_000)

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
app.use(corsmiddlewares)
// A repo URL or a prompt is small; a large body here is either a mistake or an
// attempt to exhaust memory.
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "64kb" }))

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

const resolveUserId = (req: Request): string | undefined => {
	const candidate = (req.header("x-user-id") || (req.body as { userId?: string } | undefined)?.userId || "").trim()
	return isUserId(candidate) ? candidate : undefined
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
}

const sendCloudinaryFile = async (id: string, filePath: string, res: Response) => {
	const url = getRawAssetUrl(`rwaft-dist/${id}/${filePath}`)
	const response = await fetch(url) as unknown as FetchResponse
	if (!response.ok) throw new Error(`Cloudinary returned ${response.status}`)

	const extension = path.extname(filePath).slice(1).toLowerCase()
	res.type(CONTENT_TYPES[extension] || "application/octet-stream")
	res.setHeader("Content-Disposition", "inline")
	// Hashed build assets are immutable; HTML must always be revalidated so a
	// redeploy is visible immediately.
	res.setHeader(
		"Cache-Control",
		extension === "html" ? "no-cache" : "public, max-age=31536000, immutable"
	)
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
	try {
		await clearLogHistory(userId)
		res.json({ status: "success" })
	} catch (error) {
		console.error("[logs] Clear failed:", (error as Error).message)
		res.status(503).json({ status: "failed", message: "Log service unavailable" })
	}
})

// ── Deploy a Git repository ─────────────────────────────────────────────────

app.post(
	"/deploy",
	rateLimit({ name: "deploy", limit: Number(process.env.DEPLOY_RATE_LIMIT || 5), windowSeconds: 60 * 60 }),
	async (req, res) => {
		const validation = validateRepositoryUrl((req.body as { url?: unknown } | undefined)?.url)
		if (!validation.ok) {
			res.status(400).json({ status: "failed", message: validation.reason })
			return
		}

		const userId = resolveUserId(req)
		const id = genId()
		const outputPath = path.join(stagingRoot, id)
		const deploymentUrl = buildDeploymentUrl(req, id)

		let redis
		try {
			redis = await getRedisClient()
		} catch (error) {
			console.error("[deploy] Redis unavailable:", (error as Error).message)
			res.status(503).json({ status: "failed", message: "Deployment service is temporarily unavailable" })
			return
		}

		try {
			await fs.mkdir(stagingRoot, { recursive: true })
			// Shallow clone: history is irrelevant to a build and full history on a
			// large repo is the slowest, heaviest part of this request.
			await simpleGit({ timeout: { block: CLONE_TIMEOUT_MS } })
				.clone(validation.url, outputPath, ["--depth", "1", "--single-branch"])
		} catch (error) {
			await fs.rm(outputPath, { recursive: true, force: true }).catch(() => { })
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
			console.error("[deploy] Repository upload failed:", error)
			res.status(500).json({ status: "failed", message: "Failed to stage repository files" })
			return
		} finally {
			await fs.rm(outputPath, { recursive: true, force: true }).catch(() => { })
		}

		try {
			await redis.set(`${DEPLOYMENT_STATUS_PREFIX}${id}`, "queued", { EX: STATUS_TTL_SECONDS })
			await redis.rPush(DEPLOY_QUEUE, JSON.stringify({
				id,
				userId,
				url: validation.url,
				deploymentUrl,
				assetBase: assetBaseFor(id)
			}))
		} catch (error) {
			console.error("[deploy] Queue push failed:", (error as Error).message)
			res.status(503).json({ status: "failed", message: "Failed to queue deployment" })
			return
		}

		res.status(202).json({ status: "success", id, userId, url: deploymentUrl })
	}
)

// ── Generate an app from a prompt ───────────────────────────────────────────

app.post(
	"/prompt",
	rateLimit({ name: "prompt", limit: Number(process.env.PROMPT_RATE_LIMIT || 3), windowSeconds: 60 * 60 }),
	async (req, res) => {
		const raw = (req.body as { prompt?: unknown } | undefined)?.prompt
		const prompt = typeof raw === "string" ? raw.trim() : ""
		if (!prompt) {
			res.status(400).json({ status: "failed", message: "A prompt is required" })
			return
		}
		if (prompt.length > MAX_PROMPT_CHARS) {
			res.status(400).json({ status: "failed", message: `Prompt must be ${MAX_PROMPT_CHARS} characters or fewer` })
			return
		}

		const userId = resolveUserId(req)
		const id = genId()
		const deploymentUrl = buildDeploymentUrl(req, id)

		try {
			const redis = await getRedisClient()
			await redis.set(`${DEPLOYMENT_STATUS_PREFIX}${id}`, "queued", { EX: STATUS_TTL_SECONDS })
			await redis.rPush(PROMPT_QUEUE, JSON.stringify({
				id,
				userId,
				prompt,
				deploymentUrl,
				assetBase: assetBaseFor(id)
			}))
		} catch (error) {
			console.error("[prompt] Queue push failed:", (error as Error).message)
			res.status(503).json({ status: "failed", message: "Generation service is temporarily unavailable" })
			return
		}

		res.status(202).json({ status: "success", id, userId, url: deploymentUrl })
	}
)

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
		res.status(202)
			.type("html")
			.setHeader("Cache-Control", "no-store")
		res.send(`<!doctype html><meta charset="utf-8"><title>Building deployment</title><meta http-equiv="refresh" content="3"><body style="font-family:system-ui;padding:2rem"><p>Your site is still building. This page refreshes automatically.</p></body>`)
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
