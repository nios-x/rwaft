import { AsyncLocalStorage } from "node:async_hooks"
import { createRedisClient } from "./config.ts"

/**
 * Per-user log streaming over Redis pub/sub.
 *
 * Every job carries a `userId` supplied by the client. The worker publishes
 * every meaningful line to `rwaft:logs:<userId>` while ALSO appending it to a
 * capped history list, so a browser that connects late (or reconnects after a
 * dropped SSE stream) can replay what it missed instead of staring at a blank
 * console.
 *
 * The job context is carried in AsyncLocalStorage so deep helpers (ai.ts,
 * tools.ts) can emit user-visible logs without threading a callback through
 * every signature.
 */

export type JobKind = "deploy" | "prompt"

export interface JobContext {
	jobId: string
	userId: string
	kind: JobKind
	/** Monotonic sequence counter so the client can order/dedupe messages. */
	seq: { value: number }
}

export type LogLevel = "info" | "warn" | "error" | "success" | "debug"

export interface LogEvent {
	type: "log"
	jobId: string
	kind: JobKind
	level: LogLevel
	message: string
	seq: number
	ts: number
}

export interface StatusEvent {
	type: "status"
	jobId: string
	kind: JobKind
	status: "queued" | "building" | "ready" | "failed"
	url?: string
	error?: string
	seq: number
	ts: number
}

export type StreamEvent = LogEvent | StatusEvent

export const logChannel = (userId: string) => `rwaft:logs:${userId}`
export const logHistoryKey = (userId: string) => `rwaft:logs:${userId}:history`

/** Keep the last N events per user so reconnecting clients can replay. */
const HISTORY_LIMIT = Number(process.env.LOG_HISTORY_LIMIT || 500)
/** History expires so abandoned users don't accumulate in Redis forever. */
const HISTORY_TTL_SECONDS = Number(process.env.LOG_HISTORY_TTL_SECONDS || 24 * 60 * 60)
/** A single runaway build line must not blow up the payload. */
const MAX_MESSAGE_CHARS = Number(process.env.LOG_MAX_MESSAGE_CHARS || 4_000)

const storage = new AsyncLocalStorage<JobContext>()

export function runWithJobContext<T>(context: Omit<JobContext, "seq">, fn: () => Promise<T>): Promise<T> {
	return storage.run({ ...context, seq: { value: 0 } }, fn)
}

export function currentJob(): JobContext | undefined {
	return storage.getStore()
}

// ── Publisher connection ────────────────────────────────────────────────────

type Publisher = ReturnType<typeof createRedisClient>

let publisherPromise: Promise<Publisher> | null = null

async function getPublisher(): Promise<Publisher> {
	if (!publisherPromise) {
		publisherPromise = (async () => {
			const client = createRedisClient()
			client.on("error", () => { /* config.ts already logs; don't crash the job */ })
			await client.connect()
			return client
		})().catch((error) => {
			// Reset so the next log attempt can retry a fresh connection.
			publisherPromise = null
			throw error
		})
	}
	return publisherPromise
}

/**
 * Publishes are serialized through this chain so messages reach subscribers in
 * the order they were emitted, and so a slow Redis can never fan out into
 * thousands of concurrent in-flight commands.
 */
let publishChain: Promise<void> = Promise.resolve()
let publishFailureLogged = false

function enqueuePublish(userId: string, event: StreamEvent): void {
	publishChain = publishChain.then(async () => {
		try {
			const publisher = await getPublisher()
			const payload = JSON.stringify(event)
			const historyKey = logHistoryKey(userId)
			await publisher
				.multi()
				.publish(logChannel(userId), payload)
				.rPush(historyKey, payload)
				.lTrim(historyKey, -HISTORY_LIMIT, -1)
				.expire(historyKey, HISTORY_TTL_SECONDS)
				.exec()
			publishFailureLogged = false
		} catch (error) {
			// Log streaming is best-effort telemetry: never fail a build because
			// the log channel is unavailable. Report once per outage, not per line.
			if (!publishFailureLogged) {
				publishFailureLogged = true
				console.error("[joblog] Failed to publish logs:", (error as Error).message)
			}
		}
	})
}

/** Resolves once every queued publish has been flushed. */
export async function flushLogs(): Promise<void> {
	await publishChain
}

export async function closeLogPublisher(): Promise<void> {
	await flushLogs()
	if (!publisherPromise) return
	try {
		const publisher = await publisherPromise
		await publisher.quit()
	} catch { /* already gone */ }
	publisherPromise = null
}

// ── Emitters ────────────────────────────────────────────────────────────────

const consoleFor = (level: LogLevel) =>
	level === "error" ? console.error : level === "warn" ? console.warn : console.log

function truncate(message: string): string {
	if (message.length <= MAX_MESSAGE_CHARS) return message
	return `${message.slice(0, MAX_MESSAGE_CHARS)}… [${message.length - MAX_MESSAGE_CHARS} more chars truncated]`
}

/**
 * Emits a line to the container log AND to the requesting user's stream.
 * Safe to call outside a job (falls back to console only).
 */
export function jobLog(message: string, level: LogLevel = "info"): void {
	const context = currentJob()
	const text = truncate(message)

	if (context) {
		consoleFor(level)(`[${context.kind} ${context.jobId}] ${text}`)
		enqueuePublish(context.userId, {
			type: "log",
			jobId: context.jobId,
			kind: context.kind,
			level,
			message: text,
			seq: ++context.seq.value,
			ts: Date.now()
		})
		return
	}

	consoleFor(level)(text)
}

/** Emits raw child-process output, split into lines and stripped of noise. */
export function jobOutput(chunk: string, level: LogLevel = "info"): void {
	for (const rawLine of chunk.split(/\r?\n/)) {
		const line = rawLine.replace(/\r/g, "").trimEnd()
		if (!line.trim()) continue
		jobLog(line, level)
	}
}

/** Emits a terminal/status transition the UI can act on. */
export function jobStatus(status: StatusEvent["status"], extra: { url?: string; error?: string } = {}): void {
	const context = currentJob()
	if (!context) return
	enqueuePublish(context.userId, {
		type: "status",
		jobId: context.jobId,
		kind: context.kind,
		status,
		...extra,
		seq: ++context.seq.value,
		ts: Date.now()
	})
}
