import fs from "node:fs/promises"
import path from "node:path"
import { gunzipSync, gzipSync } from "node:zlib"
import type { createRedisClient } from "./config.ts"
import { EXPIRES_AT, T, q } from "./db.ts"
import { jobLog } from "./joblog.ts"
import type { AppPlan } from "./plan.ts"

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
 * What a follow-up change needs besides the files: the plan the app was built
 * from, and every request so far (the original prompt first), so the model
 * knows what the app is for and what was already asked.
 */
export interface SourceMeta {
	plan?: AppPlan
	history: string[]
}

/** Requests kept with a snapshot. The oldest go first; the original prompt always stays. */
const MAX_HISTORY = 12

/**
 * Stores the project's source as gzipped JSON of `{ path, content }` pairs,
 * content base64 so binary assets survive. `owner` is the log channel id the
 * build ran under; only a request from that user may push or change it.
 */
export async function saveSourceSnapshot(_redis: RedisLike, jobId: string, owner: string, projectDir: string, meta: SourceMeta) {
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

	const history = meta.history.length > MAX_HISTORY
		? [meta.history[0]!, ...meta.history.slice(-(MAX_HISTORY - 1))]
		: meta.history
	await q(`insert into ${T.sources} (job_id, owner, files, file_count, history, plan, created_at, expires_at)
		values ($1, $2, $3, $4::int, $5, $6, $7::bigint, ${EXPIRES_AT("$8")})
		on conflict (job_id) do update set owner = excluded.owner, files = excluded.files, file_count = excluded.file_count,
			history = excluded.history, plan = excluded.plan, created_at = excluded.created_at, expires_at = excluded.expires_at`,
		[jobId, owner, packed.toString("base64"), files.length, JSON.stringify(history), meta.plan ? JSON.stringify(meta.plan) : null, Date.now(), SOURCE_TTL_SECONDS])
	// Expired snapshots are cleared as new ones are kept, never on a timer.
	await q(`delete from ${T.sources} where expires_at <= now()`).catch(() => { })
	jobLog(`Kept the source (${files.length} files) for ${Math.round(SOURCE_TTL_SECONDS / 3600)} hours, so you can change this app or push it to GitHub`)
}

/**
 * Writes a kept snapshot back into an empty project directory: the starting
 * point of a follow-up change. Throws in plain words when it has expired,
 * which fails the job and refunds it.
 */
export async function restoreSourceSnapshot(_redis: RedisLike, jobId: string, projectDir: string): Promise<SourceMeta> {
	const [row] = await q<{ files: string | null; history: string | null; plan: string | null }>(
		`select files, history, plan from ${T.sources} where job_id = $1 and expires_at > now()`, [jobId])
	const [packed, rawHistory, rawPlan] = [row?.files, row?.history, row?.plan]
	if (!packed) throw new Error("This app's saved code has expired, so it can't be changed. Describe the whole app to build it again")

	const files = JSON.parse(gunzipSync(Buffer.from(packed, "base64")).toString("utf-8")) as Array<{ path: string; content: string }>
	const root = path.resolve(projectDir)
	for (const file of files) {
		const target = path.resolve(root, file.path)
		// Written by this worker, but a path is still never allowed out of the project.
		if (!target.startsWith(root + path.sep)) continue
		await fs.mkdir(path.dirname(target), { recursive: true })
		await fs.writeFile(target, Buffer.from(file.content, "base64"))
	}

	const parse = <T>(raw: string | null | undefined): T | undefined => {
		try {
			return raw ? JSON.parse(raw) as T : undefined
		} catch {
			return undefined
		}
	}
	const history = parse<string[]>(rawHistory)
	return {
		plan: parse<AppPlan>(rawPlan),
		history: Array.isArray(history) ? history.filter((entry) => typeof entry === "string") : []
	}
}
