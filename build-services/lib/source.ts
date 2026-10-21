import fs from "node:fs/promises"
import path from "node:path"
import { gzipSync } from "node:zlib"
import { sourceKey, type createRedisClient } from "./config.ts"
import { jobLog } from "./joblog.ts"

type RedisLike = ReturnType<typeof createRedisClient>

/**
 * How long a generated app's source stays available for "Push to GitHub".
 * The project directory is deleted the moment a job ends, so this snapshot is
 * the only copy. It lives in Redis with an expiry, so cleanup cannot be
 * forgotten: the API drops it after a successful push, and Redis drops it
 * otherwise.
 */
export const SOURCE_TTL_SECONDS = Number(process.env.SOURCE_TTL_SECONDS || 24 * 60 * 60)
/**
 * Compressed ceiling. Redis runs with noeviction, so an oversized snapshot
 * would not be evicted: it would make the queues' own writes fail.
 */
const SOURCE_MAX_BYTES = Number(process.env.SOURCE_MAX_BYTES || 2 * 1024 * 1024)
const SOURCE_MAX_FILES = 1_000

/** Installed, built, or cached output: rebuilt from the source, never part of it. */
const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", "build", ".git", ".vite", ".cache"])
/** Secrets and machine noise. `.env.example` is documentation, so it stays. */
const isSkippedFile = (name: string) =>
	(/^\.env(\..+)?$/.test(name) && name !== ".env.example") || name === ".DS_Store" || name.endsWith(".log")

async function listSourceFiles(projectDir: string): Promise<string[]> {
	const found: string[] = []
	const walk = async (directory: string) => {
		for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
			const fullPath = path.join(directory, entry.name)
			if (entry.isDirectory()) {
				if (!SKIPPED_DIRECTORIES.has(entry.name)) await walk(fullPath)
			} else if (entry.isFile() && !isSkippedFile(entry.name)) {
				found.push(fullPath)
			}
		}
	}
	await walk(projectDir)
	return found
}

/**
 * Stores the project's source as gzipped JSON of `{ path, content }` pairs,
 * content base64 so binary assets survive. `owner` is the log channel id the
 * build ran under; only a request from that user may push it.
 */
export async function saveSourceSnapshot(redis: RedisLike, jobId: string, owner: string, projectDir: string) {
	const fileNames = await listSourceFiles(projectDir)
	if (fileNames.length === 0) throw new Error("the project has no source files")
	if (fileNames.length > SOURCE_MAX_FILES) throw new Error(`the project has ${fileNames.length} files, over the ${SOURCE_MAX_FILES} limit`)

	const files = await Promise.all(fileNames.map(async (fileName) => ({
		path: path.relative(projectDir, fileName).split(path.sep).join("/"),
		content: (await fs.readFile(fileName)).toString("base64")
	})))
	const packed = gzipSync(JSON.stringify(files))
	if (packed.length > SOURCE_MAX_BYTES) {
		throw new Error(`the source is ${Math.ceil(packed.length / 1024)} KB compressed, over the ${Math.floor(SOURCE_MAX_BYTES / 1024)} KB limit`)
	}

	const key = sourceKey(jobId)
	await redis.multi()
		.hSet(key, {
			owner,
			files: packed.toString("base64"),
			fileCount: String(files.length),
			createdAt: String(Date.now())
		})
		.expire(key, SOURCE_TTL_SECONDS)
		.exec()
	jobLog(`Kept the source (${files.length} files) for ${Math.round(SOURCE_TTL_SECONDS / 3600)} hours so it can be pushed to GitHub`)
}
