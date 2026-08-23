import { createClient } from "redis"
import { v2 as cloudinary } from "cloudinary"
import { config as loadEnv } from "dotenv"
import path from "node:path"
import { fileURLToPath } from "node:url"

const directory = path.dirname(fileURLToPath(import.meta.url))
loadEnv({ path: path.join(directory, "..", ".env") })


const redisUrl = process.env.REDIS_URL

export const cloudinaryConfig = {
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
	api_key: process.env.CLOUDINARY_API_KEY,
	api_secret: process.env.CLOUDINARY_API_SECRET
}
if (!redisUrl || Object.values(cloudinaryConfig).some((value) => !value)) {
	throw new Error("REDIS_URL and Cloudinary variables are required")
}
cloudinary.config(cloudinaryConfig)


export function createRedisClient() {
	const client = createClient({
		url: redisUrl,
		socket: {
			reconnectStrategy(retries) {
				// Exponential backoff: 500ms, 1s, 2s, 4s, ... capped at 30s
				const delay = Math.min(retries * 500, 30_000)
				console.log(`[redis] Reconnecting in ${delay}ms (attempt ${retries})`)
				return delay
			},
			connectTimeout: 10_000,
		}
	})
	client.on("error", (error) => {
		// Log but don't crash — the reconnectStrategy handles recovery
		console.error("[redis] Connection error:", error.message)
	})
	return client
}