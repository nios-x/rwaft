import { createClient } from "redis"
import { v2 as cloudinary } from "cloudinary"
import { config as loadEnv } from "dotenv"
import path from "node:path"
import { fileURLToPath } from "node:url"

const directory = path.dirname(fileURLToPath(import.meta.url))

// `override: false` is deliberate. On Render/Fly/Docker the platform injects the
// real configuration as process env; a stray .env file that ever makes it into
// an image must never win over it. Locally there is no platform env, so the
// file still fills the gaps.
loadEnv({ path: path.join(directory, "..", ".env"), override: false })

// ── Queue / key names shared with backend-services ──────────────────────────
// Keep these in sync with backend-services/lib/constants.ts.
export const DEPLOY_QUEUE = "rwaft:deploy"
export const PROMPT_QUEUE = "rwaft:prompt"
/** An AI change to a GitHub repository, opened as a pull request. */
export const PR_QUEUE = "rwaft:pr"
/** Reliable-queue companion lists: an in-flight job lives here until it ends. */
export const DEPLOY_PROCESSING = "rwaft:deploy:processing"
export const PROMPT_PROCESSING = "rwaft:prompt:processing"
export const PR_PROCESSING = "rwaft:pr:processing"
export const DEPLOYMENT_STATUS_PREFIX = "rwaft:deployment-status:"
/** Build line: waiting jobs scored by enqueue time, running ones by start time. */
export const BUILD_WAITING = "rwaft:builds:waiting"
export const BUILD_ACTIVE = "rwaft:builds:active"
export const userKey = (userId: string) => `rwaft:user:${userId}`
export const refundKey = (jobId: string) => `rwaft:billing:refunded:${jobId}`
/** A generated app's source, kept for "Push to GitHub". Expires on its own. */
export const sourceKey = (jobId: string) => `rwaft:source:${jobId}`
/** A PR job's GitHub token, encrypted by the API. Deleted and revoked when the job ends. */
export const prTokenKey = (jobId: string) => `rwaft:github:pr-token:${jobId}`
/** What a PR job opened, read back by the API for the console. */
export const prResultKey = (jobId: string) => `rwaft:pr:result:${jobId}`
/** Sealed PR tokens by revoke deadline; the API's sweep revokes what a job left behind. Same as the API's. */
export const PR_TOKEN_DEADLINES = "rwaft:github:pr-token-deadlines"
/** Pull requests whose checks are being followed, scored by when to look next. */
export const PR_WATCHING = "rwaft:pr:watching"
export const prWatchKey = (jobId: string) => `rwaft:pr:watch:${jobId}`
/**
 * A deployment's record for the dashboard, written by the API when the job is
 * accepted (only for signed-in accounts). The worker adds how it ended, and
 * only to a record that exists. Same as the API's.
 */
export const deploymentKey = (jobId: string) => `rwaft:deployment:${jobId}`

const redisUrl = process.env.REDIS_URL

export const cloudinaryConfig = {
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
	api_key: process.env.CLOUDINARY_API_KEY,
	api_secret: process.env.CLOUDINARY_API_SECRET,
	upload_preset: process.env.CLOUDINARY_UPLOAD_PRESET
}

const missing: string[] = []
if (!redisUrl) missing.push("REDIS_URL")
if (!cloudinaryConfig.cloud_name) missing.push("CLOUDINARY_CLOUD_NAME")
if (!cloudinaryConfig.api_key && !cloudinaryConfig.upload_preset) {
	missing.push("CLOUDINARY_API_KEY (or CLOUDINARY_UPLOAD_PRESET)")
}
if (missing.length > 0) {
	// Fail fast and loudly at boot rather than halfway through a user's build.
	throw new Error(
		`[config] Missing required environment variables: ${missing.join(", ")}. ` +
		`See .env.example for the full list.`
	)
}

cloudinary.config({
	cloud_name: cloudinaryConfig.cloud_name,
	api_key: cloudinaryConfig.api_key,
	api_secret: cloudinaryConfig.api_secret,
	secure: true
})

export const getRawAssetUrl = (publicId: string): string => cloudinary.url(publicId, {
	type: "upload",
	resource_type: "raw",
	secure: true
})

export { cloudinary }

export function createRedisClient() {
	const client = createClient({
		url: redisUrl,
		socket: {
			reconnectStrategy(retries) {
				// Exponential backoff: 500ms, 1s, 2s, 4s, ... capped at 30s.
				const delay = Math.min(500 * Math.pow(2, retries), 30_000)
				console.log(`[redis] Reconnecting in ${delay}ms (attempt ${retries})`)
				return delay
			},
			connectTimeout: 10_000,
			// Managed Redis providers drop idle connections. A periodic PING keeps
			// long-lived worker/subscriber sockets from being reaped mid-wait.
			keepAlive: true,
			keepAliveInitialDelay: 30_000,
			...(redisUrl?.startsWith("rediss://") ? { tls: true } : {})
		},
		pingInterval: 30_000
	})
	client.on("error", (error) => {
		// Log but don't crash — reconnectStrategy handles recovery.
		console.error("[redis] Connection error:", error.message)
	})
	return client
}
