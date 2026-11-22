"use client"

import { useEffect, useRef, useState } from "react"
import { BACKEND_URL, readApiJson } from "./config"

/**
 * Starting a pull request: the API checks the request and hands back
 * GitHub's consent URL, the user approves access in a popup, and the API's
 * callback queues the job. This follows that by polling, as "Push to GitHub"
 * does, until the job exists; from then on it is an ordinary build with a
 * live log.
 */

export type PullRequestPhase =
	| { step: "idle" }
	| { step: "authorizing"; requestId: string; authorizeUrl: string }
	| { step: "starting"; requestId: string }

export interface PullRequestInput {
	/** Repository or issue link; left out for a follow-up, which uses its pull request's. */
	repo?: string
	prompt: string
	private?: boolean
	/** The branch to open against; the repository's default when left out. */
	base?: string
	draft?: boolean
	/** Follow the checks afterwards and push fixes for failing ones. */
	watchChecks: boolean
	/** A follow-up: the earlier PR job whose pull request this adds a commit to. */
	from?: string
}

export interface QueuedPullRequest {
	jobId: string
	repoUrl: string
	charged: number
	/** The issue the pull request resolves, when an issue link said what to do. */
	issue: number | null
}

export interface StartFailure {
	message: string
	status: number
	code?: string
	balance?: number
}

interface Options {
	headers: () => Record<string, string>
	onQueued: (job: QueuedPullRequest) => void
	onFailed: (message: string) => void
}

const POLL_MS = 1_500
/** The API forgets a request after 15 minutes; stop asking about it then too. */
const POLL_LIMIT_MS = 15 * 60_000

export function usePullRequest({ headers, onQueued, onFailed }: Options) {
	const [phase, setPhase] = useState<PullRequestPhase>({ step: "idle" })
	// The caller passes fresh functions every render; the poll reads the latest.
	const latest = useRef({ headers, onQueued, onFailed })
	useEffect(() => { latest.current = { headers, onQueued, onFailed } })

	/**
	 * Call it straight from the click or key press: the GitHub window opens
	 * before the first await, or popup blockers swallow it. Resolves to null
	 * once the consent window is on its way, or to why it isn't.
	 */
	const start = async (input: PullRequestInput): Promise<StartFailure | null> => {
		const popup = window.open("", "rwaft-github", "popup,width=720,height=780")
		try {
			const response = await fetch(`${BACKEND_URL}/github/pr`, {
				method: "POST",
				headers: { "Content-Type": "application/json", ...latest.current.headers() },
				body: JSON.stringify(input),
			})
			const data = await readApiJson<{ requestId?: string; authorizeUrl?: string; message?: string; code?: string; balance?: number }>(response)
			if (!response.ok || !data.requestId || !data.authorizeUrl) {
				popup?.close()
				return { message: data.message || "The pull request couldn't be started", status: response.status, code: data.code, balance: data.balance }
			}
			if (popup) popup.location.href = data.authorizeUrl
			setPhase({ step: "authorizing", requestId: data.requestId, authorizeUrl: data.authorizeUrl })
			return null
		} catch (error) {
			popup?.close()
			return { message: error instanceof Error ? error.message : "The pull request couldn't be started", status: 0 }
		}
	}

	/**
	 * Stops following the request. Access approved in the GitHub window after
	 * this still starts the job on the server; this console just won't open it.
	 */
	const cancel = () => setPhase({ step: "idle" })

	const requestId = phase.step === "idle" ? null : phase.requestId
	useEffect(() => {
		if (!requestId) return
		const started = Date.now()
		let cancelled = false
		const timer = setInterval(async () => {
			const fail = (message: string) => {
				clearInterval(timer)
				setPhase({ step: "idle" })
				latest.current.onFailed(message)
			}
			if (Date.now() - started > POLL_LIMIT_MS) return fail("GitHub never confirmed access. Start the pull request again.")
			try {
				const response = await fetch(`${BACKEND_URL}/github/pr/${requestId}`, { headers: latest.current.headers() })
				const data = await readApiJson<{ state?: string; jobId?: string | null; repoUrl?: string | null; issue?: number | null; charged?: number; message?: string | null }>(response)
				if (cancelled) return
				if (!response.ok) return fail(data.message || "This request has expired. Start it again.")
				if (data.state === "queued" && data.jobId) {
					clearInterval(timer)
					setPhase({ step: "idle" })
					latest.current.onQueued({ jobId: data.jobId, repoUrl: data.repoUrl || "", charged: data.charged ?? 0, issue: data.issue ?? null })
				} else if (data.state === "failed") {
					fail(data.message || "The pull request couldn't be started.")
				} else if (data.state === "starting") {
					setPhase((current) => current.step === "authorizing" ? { step: "starting", requestId } : current)
				}
			} catch { /* a dropped poll; the next one retries */ }
		}, POLL_MS)
		return () => {
			cancelled = true
			clearInterval(timer)
		}
	}, [requestId])

	return { phase, start, cancel }
}

/** "owner/name" from what the user typed, for titles; the API does the real parsing. */
export function repositoryLabel(raw: string): string {
	const path = raw.trim().replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "").replace(/[?#].*$/, "")
	const [owner = "", name = ""] = path.split("/")
	return owner && name ? `${owner}/${name.replace(/\.git$/i, "")}` : raw.trim()
}
