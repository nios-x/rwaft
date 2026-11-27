import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

/**
 * The worker's Postgres writes: batched build logs and their pruning, and
 * keeping and restoring an app's source.
 *
 * Opt in with TEST_DATABASE_URL. Each run creates its own schema
 * (rwaft_test_<random>) and drops it afterwards; DATABASE_URL from .env is
 * replaced before anything connects, so the app's own data is never touched.
 */

const testUrl = process.env.TEST_DATABASE_URL || ""
const SCHEMA = `rwaft_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`

describe.skipIf(!testUrl)("worker storage on Postgres", () => {
	let db: typeof import("./db.ts")
	let joblog: typeof import("./joblog.ts")
	let source: typeof import("./source.ts")
	let scratch = ""

	beforeAll(async () => {
		process.env.DATABASE_URL = testUrl
		process.env.DB_SCHEMA = SCHEMA
		process.env.LOG_HISTORY_LIMIT = "5"
		db = await import("./db.ts")
		await db.closeDb()
		joblog = await import("./joblog.ts")
		source = await import("./source.ts")
		expect(db.T.logEvents).toBe(`${SCHEMA}.log_events`)
		await db.getDb()
		scratch = await fs.mkdtemp(path.join(os.tmpdir(), "rwaft-storage-test-"))
	})

	afterAll(async () => {
		if (db) {
			await db.q(`drop schema if exists ${SCHEMA} cascade`).catch(() => { })
			await db.closeDb()
		}
		if (scratch) await fs.rm(scratch, { recursive: true, force: true })
	})

	const history = async (userId: string) =>
		(await db.q<{ payload: string }>(`select payload from ${db.T.logEvents} where user_id = $1 order by id`, [userId]))
			.map((row) => JSON.parse(row.payload) as { type: string; message?: string; status?: string; seq: number })

	test("a job's lines and status are written in order, in batches", async () => {
		await joblog.runWithJobContext({ jobId: "job-1", userId: "u-logs", kind: "prompt" }, async () => {
			for (let index = 0; index < 250; index++) joblog.jobLog(`line ${index}`)
			joblog.jobStatus("ready", { url: "https://example.com" })
			await joblog.flushLogs()
		})
		const events = await history("u-logs")
		expect(events).toHaveLength(251)
		expect(events[0]).toMatchObject({ type: "log", message: "line 0", seq: 1 })
		expect(events[249]).toMatchObject({ message: "line 249", seq: 250 })
		expect(events[250]).toMatchObject({ type: "status", status: "ready", seq: 251 })
	})

	test("pruning keeps only the newest LOG_HISTORY_LIMIT events for the user", async () => {
		await joblog.pruneLogHistory("u-logs")
		const events = await history("u-logs")
		expect(events.map((event) => event.seq)).toEqual([247, 248, 249, 250, 251])
	})

	test("lines outside a job reach the console only", async () => {
		joblog.jobLog("no job here")
		await joblog.flushLogs()
		expect(await db.q(`select 1 from ${db.T.logEvents} where payload like '%no job here%'`)).toHaveLength(0)
	})

	test("a kept source restores into an empty project, with its plan and history", async () => {
		const project = path.join(scratch, "app")
		await fs.mkdir(path.join(project, "src"), { recursive: true })
		await fs.writeFile(path.join(project, "src", "App.tsx"), "export default function App() { return null }\n")
		await fs.writeFile(path.join(project, "package.json"), '{"name":"app"}\n')
		await joblog.runWithJobContext({ jobId: "job-src", userId: "u-src", kind: "prompt" }, async () => {
			await source.saveSourceSnapshot(null as never, "job-src", "u-src", project, { history: ["make a site"], plan: undefined })
			await joblog.flushLogs()
		})

		const [row] = await db.q<{ owner: string; file_count: number }>(`select owner, file_count from ${db.T.sources} where job_id = 'job-src'`)
		expect(row).toMatchObject({ owner: "u-src" })
		expect(Number(row?.file_count)).toBeGreaterThan(0)

		const restored = path.join(scratch, "restored")
		await fs.mkdir(restored, { recursive: true })
		const meta = await source.restoreSourceSnapshot(null as never, "job-src", restored)
		expect(meta.history).toEqual(["make a site"])
		expect(await fs.readFile(path.join(restored, "src", "App.tsx"), "utf-8")).toContain("export default function App")
	})

	test("an expired source can't be restored", async () => {
		await db.q(`update ${db.T.sources} set expires_at = now() - interval '1 second' where job_id = 'job-src'`)
		const target = path.join(scratch, "too-late")
		await fs.mkdir(target, { recursive: true })
		await expect(source.restoreSourceSnapshot(null as never, "job-src", target)).rejects.toThrow("expired")
	})
})
