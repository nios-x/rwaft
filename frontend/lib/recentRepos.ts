"use client"

import { useSyncExternalStore } from "react"

/**
 * Repositories this browser opened pull requests on, newest first, offered as
 * suggestions in the repository field. A per-viewer convenience: losing it
 * (private window, cleared storage) only empties the suggestions.
 */
const STORAGE_KEY = "rwaft:recent-repos"
const CHANGE_EVENT = "rwaft:recent-repos-change"
const LIMIT = 8
const EMPTY: string[] = []

let cachedRaw: string | null = null
let cachedValue: string[] = EMPTY

const read = (): string[] => {
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
		cachedValue = Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string").slice(0, LIMIT) : EMPTY
	} catch {
		cachedValue = EMPTY
	}
	return cachedValue
}

const subscribe = (onChange: () => void) => {
	window.addEventListener("storage", onChange)
	window.addEventListener(CHANGE_EVENT, onChange)
	return () => {
		window.removeEventListener("storage", onChange)
		window.removeEventListener(CHANGE_EVENT, onChange)
	}
}

export const useRecentRepos = (): string[] => useSyncExternalStore(subscribe, read, () => EMPTY)

/** Puts "owner/name" first. */
export function rememberRepo(repo: string): void {
	const next = [repo, ...read().filter((entry) => entry.toLowerCase() !== repo.toLowerCase())].slice(0, LIMIT)
	const raw = JSON.stringify(next)
	try {
		window.localStorage.setItem(STORAGE_KEY, raw)
	} catch {
		// Storage blocked: keep the list in memory for this tab.
		cachedRaw = raw
		cachedValue = next
	}
	window.dispatchEvent(new Event(CHANGE_EVENT))
}
