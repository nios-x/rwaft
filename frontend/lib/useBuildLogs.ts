"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { BACKEND_URL, isBackendConfigured } from "./config"

export type LogLevel = "info" | "warn" | "error" | "success" | "debug"
export type DeploymentStatus = "queued" | "building" | "ready" | "failed"

export interface LogLine {
	key: string
	jobId: string
	level: LogLevel
	message: string
	ts: number
}

interface StreamLogEvent {
	type: "log"
	jobId: string
	level: LogLevel
	message: string
	seq: number
	ts: number
}

interface StreamStatusEvent {
	type: "status"
	jobId: string
	status: DeploymentStatus
	url?: string
	error?: string
	seq: number
	ts: number
}

/** Connection-level frames the backend emits alongside job events. */
interface StreamReadyEvent { type: "ready" }
interface StreamErrorEvent { type: "error"; message?: string }

// Each member needs a single literal `type` for TypeScript to narrow the union
// on it — a member whose discriminant is itself a union never gets excluded.
type StreamEvent = StreamLogEvent | StreamStatusEvent | StreamReadyEvent | StreamErrorEvent

/** Cap retained lines so a long build cannot grow the DOM without bound. */
const MAX_LINES = 1_000

export interface BuildLogs {
	lines: LogLine[]
	connected: boolean
	status: DeploymentStatus | null
	statusJobId: string | null
	deployedUrl: string | null
	failure: string | null
	clear: () => void
}

/**
 * Subscribes to this user's build log stream.
 *
 * Uses EventSource (Server-Sent Events): the traffic is one-way, it reconnects
 * on its own, and it needs no extra client library. The backend replays recent
 * history on every connect so a reconnect is seamless — which means duplicates
 * are expected, and are filtered here on the server-assigned `jobId:seq`.
 */
export function useBuildLogs(userId: string | null): BuildLogs {
	const [lines, setLines] = useState<LogLine[]>([])
	const [connected, setConnected] = useState(false)
	const [status, setStatus] = useState<DeploymentStatus | null>(null)
	const [statusJobId, setStatusJobId] = useState<string | null>(null)
	const [deployedUrl, setDeployedUrl] = useState<string | null>(null)
	const [failure, setFailure] = useState<string | null>(null)

	const seenRef = useRef<Set<string>>(new Set())

	const clear = useCallback(() => {
		seenRef.current = new Set()
		setLines([])
		setStatus(null)
		setStatusJobId(null)
		setDeployedUrl(null)
		setFailure(null)

		if (userId && isBackendConfigured) {
			// Also drop the server-side history, otherwise the next reconnect
			// replays everything we just cleared.
			void fetch(`${BACKEND_URL}/logs/${userId}`, { method: "DELETE" }).catch(() => { })
		}
	}, [userId])

	useEffect(() => {
		if (!userId || !isBackendConfigured) return

		const source = new EventSource(`${BACKEND_URL}/logs/${userId}`)

		source.onopen = () => setConnected(true)
		source.onerror = () => setConnected(false) // EventSource retries by itself

		source.onmessage = (event: MessageEvent<string>) => {
			let parsed: StreamEvent
			try {
				parsed = JSON.parse(event.data) as StreamEvent
			} catch {
				return
			}

			if (parsed.type === "ready") {
				setConnected(true)
				return
			}
			if (parsed.type === "error") {
				setFailure(parsed.message || "Log stream unavailable")
				return
			}

			const key = `${parsed.jobId}:${parsed.seq}`
			if (seenRef.current.has(key)) return
			seenRef.current.add(key)

			if (parsed.type === "log") {
				setLines((current) => {
					const next = [...current, {
						key,
						jobId: parsed.jobId,
						level: parsed.level,
						message: parsed.message,
						ts: parsed.ts
					}]
					return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next
				})
				return
			}

			setStatus(parsed.status)
			setStatusJobId(parsed.jobId)
			if (parsed.status === "ready") {
				setDeployedUrl(parsed.url ?? null)
				setFailure(null)
			}
			if (parsed.status === "failed") {
				setFailure(parsed.error || "Build failed")
			}
		}

		return () => {
			source.close()
			setConnected(false)
		}
	}, [userId])

	return { lines, connected, status, statusJobId, deployedUrl, failure, clear }
}
