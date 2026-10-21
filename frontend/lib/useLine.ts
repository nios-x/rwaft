"use client"

import { useEffect, useState } from "react"
import { BACKEND_URL, isBackendConfigured } from "./config"
import type { DeploymentStatus } from "./useBuildLogs"

export interface LineEntry {
	status: DeploymentStatus | "unknown"
	/** 1-based place among waiting builds; null once the build has started. */
	position: number | null
	waiting: number
	running: number
}

const POLL_MS = 3_000

/**
 * Polls `/queue/:id` for every unfinished build this browser knows about.
 *
 * The log stream only speaks once a worker picks a job up, and only for the
 * signed-in channel, so this is what tells every card its real state: still
 * in line (and where), building, or done. A build drops out of the poll the
 * moment it reports ready or failed.
 */
export function useLine(ids: string[]): Record<string, LineEntry> {
	const [entries, setEntries] = useState<Record<string, LineEntry>>({})
	const key = ids.join(",")

	useEffect(() => {
		if (!key || !isBackendConfigured) return
		let cancelled = false
		let timer: ReturnType<typeof setTimeout> | undefined
		let pending = key.split(",")

		const poll = async () => {
			const results = await Promise.all(pending.map(async (id) => {
				try {
					const response = await fetch(`${BACKEND_URL}/queue/${id}`, { cache: "no-store" })
					return response.ok ? [id, await response.json() as LineEntry] as const : null
				} catch {
					return null
				}
			}))
			if (cancelled) return
			const fresh = results.filter((result): result is readonly [string, LineEntry] => result !== null)
			if (fresh.length > 0) setEntries((current) => ({ ...current, ...Object.fromEntries(fresh) }))
			pending = pending.filter((id) => {
				const status = fresh.find(([freshId]) => freshId === id)?.[1].status
				return status !== "ready" && status !== "failed"
			})
			if (pending.length > 0) timer = setTimeout(poll, POLL_MS)
		}
		void poll()

		return () => {
			cancelled = true
			if (timer) clearTimeout(timer)
		}
	}, [key])

	return entries
}
