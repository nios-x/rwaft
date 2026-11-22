"use client"

import { useEffect, useState } from "react"
import { BACKEND_URL, readApiJson } from "./config"
import { repositoryLabel } from "./usePullRequest"

/**
 * What GitHub shows the pull request tab about a repository before anyone
 * signs in to GitHub: its branches, for the base picker, and whether it is
 * public at all. A repository rwaft can't list is private (or doesn't exist;
 * GitHub won't say which), so the request asks for private-repository access
 * on its own and nobody has to tick a box for it. The API checks the same
 * thing again when the request is sent (POST /github/pr).
 */
export type RepoBranches =
	| { state: "idle" }
	| { state: "loading" }
	| { state: "ready"; defaultBranch: string; branches: string[]; truncated: boolean }
	| { state: "unlisted" }
	| { state: "error"; message: string }

const REPO = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/
const IDLE: RepoBranches = { state: "idle" }
const LOADING: RepoBranches = { state: "loading" }
/** Wait for the repository field to settle before asking. */
const SETTLE_MS = 350

export function useRepoBranches(repoText: string): { repo: string | null; branches: RepoBranches } {
	const label = repositoryLabel(repoText)
	const key = REPO.test(label) ? label.toLowerCase() : ""
	const [results, setResults] = useState<Record<string, RepoBranches>>({})
	const known = key ? results[key] : undefined

	// One request per repository the field settles on.
	useEffect(() => {
		if (!key || known) return
		let cancelled = false
		const timer = setTimeout(async () => {
			let next: RepoBranches
			try {
				const response = await fetch(`${BACKEND_URL}/github/branches?repo=${encodeURIComponent(key)}`)
				const data = await readApiJson<{ available?: boolean; defaultBranch?: string; branches?: string[]; truncated?: boolean; message?: string }>(response)
				if (!response.ok) next = { state: "error", message: data.message || "The branches couldn't be listed" }
				else if (!data.available || !data.defaultBranch || !Array.isArray(data.branches)) next = { state: "unlisted" }
				else next = { state: "ready", defaultBranch: data.defaultBranch, branches: data.branches, truncated: Boolean(data.truncated) }
			} catch {
				next = { state: "error", message: "The branches couldn't be listed" }
			}
			if (!cancelled) setResults((current) => ({ ...current, [key]: next }))
		}, SETTLE_MS)
		return () => {
			cancelled = true
			clearTimeout(timer)
		}
	}, [key, known])

	return { repo: key ? label : null, branches: !key ? IDLE : known ?? LOADING }
}

/** A branch name git and GitHub accept; the same rule as the API's isBranchName. */
export const isBranchName = (value: string) =>
	value.length > 0 && value.length <= 200 && /^[A-Za-z0-9._/-]+$/.test(value)
	&& !value.startsWith("/") && !value.startsWith("-") && !value.endsWith("/") && !value.endsWith(".")
	&& !value.endsWith(".lock") && !value.includes("..") && !value.includes("//")
