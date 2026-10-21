"use client"

import { useSyncExternalStore } from "react"
import type { BuildKind } from "./stages"

export type BuildOutcome = "ready" | "failed"

export interface RecentBuild {
	id: string
	kind: BuildKind
	url: string
	at: number
	charged: number
	/** The prompt, or the repository URL, exactly as it was sent. */
	source?: string
	outcome?: BuildOutcome
	/** Epoch ms when the outcome was first seen; drives the notification bell. */
	settledAt?: number
	/** Where "Push to GitHub" put the source. Kept here because the server forgets it after a day. */
	repoUrl?: string
}

/**
 * This browser's builds. A per-viewer convenience: it lets a refresh mid-build
 * reattach to the same build, and losing it (private window, cleared storage)
 * only empties the list.
 */
const STORAGE_KEY = "rwaft:recent-builds"
const CHANGE_EVENT = "rwaft:recent-builds-change"
const LIMIT = 40
const EMPTY: RecentBuild[] = []

let cachedRaw: string | null = null
let cachedValue: RecentBuild[] = EMPTY

const read = (): RecentBuild[] => {
	let raw: string | null = null
	try {
		raw = window.localStorage.getItem(STORAGE_KEY)
	} catch {
		return cachedValue
	}
	// useSyncExternalStore needs a stable snapshot, so parse only when the text changed.
	if (raw === cachedRaw) return cachedValue
	cachedRaw = raw
	try {
		const parsed = raw ? JSON.parse(raw) : []
		cachedValue = Array.isArray(parsed) ? parsed as RecentBuild[] : EMPTY
	} catch {
		cachedValue = EMPTY
	}
	return cachedValue
}

const write = (builds: RecentBuild[]) => {
	const raw = JSON.stringify(builds.slice(0, LIMIT))
	try {
		window.localStorage.setItem(STORAGE_KEY, raw)
	} catch {
		// Storage disabled: keep the list in memory for this tab.
		cachedRaw = raw
		cachedValue = builds.slice(0, LIMIT)
	}
	window.dispatchEvent(new Event(CHANGE_EVENT))
}

const subscribe = (onChange: () => void) => {
	window.addEventListener("storage", onChange)
	window.addEventListener(CHANGE_EVENT, onChange)
	return () => {
		window.removeEventListener("storage", onChange)
		window.removeEventListener(CHANGE_EVENT, onChange)
	}
}

export const useRecentBuilds = (): RecentBuild[] => useSyncExternalStore(subscribe, read, () => EMPTY)

export const addRecentBuild = (build: RecentBuild) =>
	write([build, ...read().filter((existing) => existing.id !== build.id)])

export const settleRecentBuild = (id: string, outcome: BuildOutcome) => {
	const builds = read()
	if (!builds.some((build) => build.id === id && build.outcome !== outcome)) return
	write(builds.map((build) => (build.id === id ? { ...build, outcome, settledAt: Date.now() } : build)))
}

export const setRecentBuildRepo = (id: string, repoUrl: string) => {
	const builds = read()
	if (!builds.some((build) => build.id === id && build.repoUrl !== repoUrl)) return
	write(builds.map((build) => (build.id === id ? { ...build, repoUrl } : build)))
}

/** A short human title for a build: the first words of its prompt, or the repo name. */
export function buildTitle(build: Pick<RecentBuild, "kind" | "source" | "id">): string {
	const source = build.source?.trim()
	if (!source) return build.kind === "prompt" ? "App from a prompt" : "GitHub repository"
	if (build.kind === "deploy") {
		const name = source.replace(/\/+$/, "").split("/").slice(-2).join("/")
		return name || source
	}
	const words = source.replace(/\s+/g, " ").split(" ")
	const title = words.slice(0, 6).join(" ")
	return words.length > 6 ? `${title}…` : title
}
