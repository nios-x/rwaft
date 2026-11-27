import { AsyncLocalStorage } from "node:async_hooks"
import { T, q } from "./db.ts"

/**
 * Per-user build logs, in Postgres.
 *
 * Every job carries a `userId` supplied by the client. Each meaningful line is
 * appended to the log_events table, in batches (a build can print thousands
 * of npm lines), and the API streams new rows to the browser and replays the
 * recent ones to a browser that connects late or reconnects.
 *
 * The job context is carried in AsyncLocalStorage so deep helpers (ai.ts,
 * tools.ts) can emit user-visible logs without threading a callback through
 * every signature.
 */

export type JobKind = "deploy" | "prompt" | "pr"

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

/** Keep the last N events per user so reconnecting clients can replay. */
const HISTORY_LIMIT = Number(process.env.LOG_HISTORY_LIMIT || 500)
/** History expires so abandoned users don't accumulate forever. */
const HISTORY_TTL_SECONDS = Number(process.env.LOG_HISTORY_TTL_SECONDS || 24 * 60 * 60)
/** Lines are written at most this often, in one insert, while a build is printing. */
const FLUSH_MS = Number(process.env.LOG_FLUSH_MS || 250)
const BATCH_ROWS = 200
/** A single runaway build line must not blow up the payload. */
const MAX_MESSAGE_CHARS = Number(process.env.LOG_MAX_MESSAGE_CHARS || 4_000)

const storage = new AsyncLocalStorage<JobContext>()

export function runWithJobContext<T>(context: Omit<JobContext, "seq">, fn: () => Promise<T>): Promise<T> {
	return storage.run({ ...context, seq: { value: 0 } }, fn)
}

export function currentJob(): JobContext | undefined {
	return storage.getStore()
}

// ── Writer ──────────────────────────────────────────────────────────────────

/** Events waiting to be written, in the order they were emitted. */
let pending: Array<{ userId: string; payload: string }> = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
/**
 * Writes are serialized through this chain so rows are inserted (and get ids)
 * in the order they were emitted, and a slow database can never fan out into
 * many concurrent inserts.
 */
let writeChain: Promise<void> = Promise.resolve()
let writeFailureLogged = false

function writePending(): Promise<void> {
	if (flushTimer) {
		clearTimeout(flushTimer)
		flushTimer = null
	}
	writeChain = writeChain.then(async () => {
		while (pending.length > 0) {
			const batch = pending.splice(0, BATCH_ROWS)
			try {
				await q(`insert into ${T.logEvents} (user_id, payload)
					select row->>'u', row->>'p' from jsonb_array_elements($1::jsonb) as row`,
				[batch.map((event) => ({ u: event.userId, p: event.payload }))])
				writeFailureLogged = false
			} catch (error) {
				// Log streaming is best-effort telemetry: never fail a build because
				// the log store is unavailable. Report once per outage, not per line.
				if (!writeFailureLogged) {
					writeFailureLogged = true
					console.error("[joblog] Failed to write logs:", (error as Error).message)
				}
			}
		}
	})
	return writeChain
}

function enqueuePublish(userId: string, event: StreamEvent): void {
	pending.push({ userId, payload: JSON.stringify(event) })
	if (pending.length >= BATCH_ROWS) void writePending()
	else if (!flushTimer) flushTimer = setTimeout(() => void writePending(), FLUSH_MS)
}

/** Resolves once every emitted event has been written. */
export async function flushLogs(): Promise<void> {
	await writePending()
}

export async function closeLogPublisher(): Promise<void> {
	await flushLogs()
}

/**
 * Drops a user's events beyond the newest HISTORY_LIMIT, and everyone's older
 * than HISTORY_TTL_SECONDS. Called when a job ends, never on a timer, so an
 * idle database can suspend.
 */
export async function pruneLogHistory(userId: string): Promise<void> {
	try {
		await q(`delete from ${T.logEvents} where user_id = $1 and id < (
			select id from ${T.logEvents} where user_id = $1 order by id desc offset $2::int limit 1)`, [userId, HISTORY_LIMIT - 1])
		await q(`delete from ${T.logEvents} where created_at < now() - $1::int * interval '1 second'`, [HISTORY_TTL_SECONDS])
	} catch (error) {
		console.warn("[joblog] Could not prune old logs:", (error as Error).message)
	}
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

/**
 * Emits a line to the container log only, tagged with the job like jobLog.
 * For detail the user should never see: providers, keys, retries.
 */
export function serverLog(message: string, level: LogLevel = "info"): void {
	const context = currentJob()
	const text = truncate(message)
	consoleFor(level)(context ? `[${context.kind} ${context.jobId}] ${text}` : text)
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
