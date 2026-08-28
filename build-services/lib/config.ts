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
/** Reliable-queue companion lists: an in-flight job lives here until it ends. */
export const DEPLOY_PROCESSING = "rwaft:deploy:processing"
export const PROMPT_PROCESSING = "rwaft:prompt:processing"
export const DEPLOYMENT_STATUS_PREFIX = "rwaft:deployment-status:"

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
