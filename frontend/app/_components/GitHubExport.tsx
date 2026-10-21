"use client"

import { useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import { BACKEND_URL, readApiJson } from "../../lib/config"
import { buildTitle, setRecentBuildRepo, type RecentBuild } from "../../lib/recentBuilds"
import { ExternalIcon, GitHubIcon } from "./Icons"

type Phase =
	| { step: "checking" }
	| { step: "unavailable" }
	| { step: "ready" }
	| { step: "form" }
	| { step: "authorizing"; pushId: string; authorizeUrl: string }
	| { step: "pushing"; pushId: string }
	| { step: "done"; repoUrl: string }
	| { step: "failed"; message: string }

const POLL_MS = 1_500
/** The API forgets a push after 15 minutes; stop asking about it then too. */
const POLL_LIMIT_MS = 15 * 60_000

/** A GitHub-safe repository name from the build's title. */
function repositoryName(build: Pick<RecentBuild, "kind" | "source" | "id">): string {
	const slug = buildTitle(build)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.slice(0, 60)
		.replace(/^-+|-+$/g, "")
	return slug || `rwaft-app-${build.id}`
}

interface GitHubExportProps {
	build: RecentBuild
	/** Identifies the requester: the session, plus the anonymous id the build may have run under. */
	headers: () => Record<string, string>
}

/**
 * "Push to GitHub" for a finished prompt build. The worker keeps the source
 * for a limited time after a build; the API creates a repository on the
 * user's account through a GitHub popup and reports back here by polling.
 */
export function GitHubExport({ build, headers }: GitHubExportProps) {
	const [phase, setPhase] = useState<Phase>(() => build.repoUrl ? { step: "done", repoUrl: build.repoUrl } : { step: "checking" })
	const [name, setName] = useState(() => repositoryName(build))
	const [privateRepo, setPrivateRepo] = useState(false)
	const [error, setError] = useState("")
	// The caller passes a fresh function every render; effects read the latest.
	const headersRef = useRef(headers)
	useEffect(() => { headersRef.current = headers })

	const finish = (repoUrl: string) => {
		setRecentBuildRepo(build.id, repoUrl)
		setPhase({ step: "done", repoUrl })
	}

	// Is the source still kept, or already on GitHub?
	useEffect(() => {
		if (build.repoUrl) return
		let cancelled = false
		void (async () => {
			try {
				const response = await fetch(`${BACKEND_URL}/github/source/${build.id}`, { headers: headersRef.current() })
				const data = await readApiJson<{ available?: boolean; repoUrl?: string | null }>(response)
				if (cancelled) return
				if (data.repoUrl) {
					setRecentBuildRepo(build.id, data.repoUrl)
					setPhase({ step: "done", repoUrl: data.repoUrl })
				} else {
					setPhase({ step: data.available ? "ready" : "unavailable" })
				}
			} catch {
				if (!cancelled) setPhase({ step: "unavailable" })
			}
		})()
		return () => { cancelled = true }
	}, [build.id, build.repoUrl])

	// Follow the push while the GitHub window is open.
	const pushId = phase.step === "authorizing" || phase.step === "pushing" ? phase.pushId : null
	useEffect(() => {
		if (!pushId) return
		const started = Date.now()
		let cancelled = false
		const timer = setInterval(async () => {
			if (Date.now() - started > POLL_LIMIT_MS) {
				clearInterval(timer)
				setPhase({ step: "failed", message: "GitHub never confirmed the push. Start it again." })
				return
			}
			try {
				const response = await fetch(`${BACKEND_URL}/github/push/${pushId}`, { headers: headersRef.current() })
				const data = await readApiJson<{ state?: string; repoUrl?: string | null; message?: string | null }>(response)
				if (cancelled) return
				if (!response.ok) {
					clearInterval(timer)
					setPhase({ step: "failed", message: data.message || "This push has expired. Start it again." })
				} else if (data.state === "done" && data.repoUrl) {
					clearInterval(timer)
					setRecentBuildRepo(build.id, data.repoUrl)
					setPhase({ step: "done", repoUrl: data.repoUrl })
				} else if (data.state === "failed") {
					clearInterval(timer)
					setPhase({ step: "failed", message: data.message || "The push didn't finish." })
				} else if (data.state === "pushing") {
					setPhase((current) => current.step === "authorizing" ? { step: "pushing", pushId } : current)
				}
			} catch { /* a dropped poll; the next one retries */ }
		}, POLL_MS)
		return () => {
			cancelled = true
			clearInterval(timer)
		}
	}, [pushId, build.id])

	const start = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		setError("")
		// Opened inside the click, before any await, or popup blockers swallow it.
		const popup = window.open("", "rwaft-github", "popup,width=720,height=780")
		try {
			const response = await fetch(`${BACKEND_URL}/github/push`, {
				method: "POST",
				headers: { "Content-Type": "application/json", ...headersRef.current() },
				body: JSON.stringify({ id: build.id, name: name.trim(), private: privateRepo }),
			})
			const data = await readApiJson<{ pushId?: string; authorizeUrl?: string; repoUrl?: string; code?: string; message?: string }>(response)
			if (response.status === 409 && data.repoUrl) {
				popup?.close()
				finish(data.repoUrl)
				return
			}
			if (response.status === 404 && data.code === "source_expired") {
				popup?.close()
				setPhase({ step: "unavailable" })
				return
			}
			if (!response.ok || !data.pushId || !data.authorizeUrl) throw new Error(data.message || "The push couldn't be started")
			if (popup) popup.location.href = data.authorizeUrl
			setPhase({ step: "authorizing", pushId: data.pushId, authorizeUrl: data.authorizeUrl })
		} catch (startError) {
			popup?.close()
			setError(startError instanceof Error ? startError.message : "The push couldn't be started")
		}
	}

	switch (phase.step) {
		case "checking":
			return null
		case "unavailable":
			return <p className="gh-note">The source is only kept for a while after a build, so this one can no longer be pushed to GitHub.</p>
		case "ready":
			return (
				<button type="button" className="gh-btn" onClick={() => setPhase({ step: "form" })}>
					<GitHubIcon /> Push code to GitHub
				</button>
			)
		case "form":
			return (
				<form className="gh-card" onSubmit={start}>
					<p className="gh-card-title"><GitHubIcon /> New repository on your GitHub</p>
					<label className="gh-field">
						<span>Repository name</span>
						<input
							value={name}
							onChange={(event) => setName(event.target.value)}
							pattern="[A-Za-z0-9._\-]{1,100}"
							title="Letters, numbers, dots, dashes or underscores"
							maxLength={100}
							required
							autoFocus
							spellCheck={false}
							autoComplete="off"
						/>
					</label>
					<label className="gh-check">
						<input type="checkbox" checked={privateRepo} onChange={(event) => setPrivateRepo(event.target.checked)} />
						<span>Private repository</span>
					</label>
					{error && <p className="field-error" role="alert">{error}</p>}
					<div className="gh-actions">
						<button type="submit" className="pill-btn pill-btn--ink" disabled={!name.trim()}>Continue on GitHub</button>
						<button type="button" className="text-btn" onClick={() => { setError(""); setPhase({ step: "ready" }) }}>Cancel</button>
					</div>
					<p className="gh-hint">GitHub asks you to approve access once. rwaft uses it for this push only and revokes it straight after.</p>
				</form>
			)
		case "authorizing":
			return (
				<div className="gh-card" role="status">
					<p className="gh-progress"><span className="gh-spinner" aria-hidden="true" />Approve access in the GitHub window…</p>
					<div className="gh-actions">
						<a className="text-btn" href={phase.authorizeUrl} target="rwaft-github">Window didn&apos;t open? Continue on GitHub</a>
						<button type="button" className="text-btn" onClick={() => setPhase({ step: "form" })}>Cancel</button>
					</div>
				</div>
			)
		case "pushing":
			return (
				<div className="gh-card" role="status">
					<p className="gh-progress"><span className="gh-spinner" aria-hidden="true" />Creating the repository and pushing your code…</p>
				</div>
			)
		case "done":
			return (
				<div className="gh-card gh-card--done">
					<p className="gh-card-title"><GitHubIcon /> Your code is on GitHub</p>
					<a className="msg-link" href={phase.repoUrl} target="_blank" rel="noreferrer">
						{phase.repoUrl.replace(/^https:\/\/(www\.)?/, "")} <ExternalIcon />
					</a>
				</div>
			)
		case "failed":
			return (
				<div className="gh-card" role="alert">
					<p className="field-error">{phase.message}</p>
					<div className="gh-actions">
						<button type="button" className="text-btn" onClick={() => setPhase({ step: "form" })}>Try again</button>
					</div>
				</div>
			)
	}
}
