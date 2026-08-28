"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { BACKEND_URL, isBackendConfigured } from "./config"

const STORAGE_KEY = "rwaft:user-id"

/** Must match the backend's isUserId() check. */
const isValid = (value: string | null | undefined): value is string =>
	typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value)

const generateLocally = (): string => {
	const bytes = new Uint8Array(16)
	crypto.getRandomValues(bytes)
	return `u-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`
}

const readStored = (): string | null => {
	try {
		return window.localStorage.getItem(STORAGE_KEY)
	} catch {
		return null // private mode / storage disabled
	}
}

/**
 * localStorage is external state, so it is read through useSyncExternalStore
 * rather than copied into React state inside an effect. The `storage` event
 * also keeps the id consistent if the user has several tabs open.
 */
const subscribe = (onChange: () => void) => {
	window.addEventListener("storage", onChange)
	return () => window.removeEventListener("storage", onChange)
}
// The server has no localStorage; rendering null keeps hydration consistent.
const getServerSnapshot = () => null

/**
 * Returns this browser's stable user id, creating one on first visit.
 *
 * The id is what separates one person's build logs from everyone else's: the
 * worker publishes to `rwaft:logs:<userId>` and this browser subscribes to
 * exactly that channel. It is persisted so a refresh mid-build reattaches to
 * the same stream rather than losing it.
 *
 * The backend issues the id (`GET /session`) so its format is owned in one
 * place, with a local CSPRNG fallback for when the API is briefly unreachable —
 * that path must not stop someone from using the page.
 */
export function useUserId(): string | null {
	const stored = useSyncExternalStore(subscribe, readStored, getServerSnapshot)
	// Holds the id issued during this session; a same-tab write does not fire a
	// `storage` event, so the store snapshot alone would not pick it up.
	const [issued, setIssued] = useState<string | null>(null)

	const resolved = isValid(stored) ? stored : issued

	useEffect(() => {
		if (resolved) return
		let cancelled = false

		const persist = (id: string) => {
			if (cancelled) return
			try {
				window.localStorage.setItem(STORAGE_KEY, id)
			} catch { /* ephemeral session; the id still works for this tab */ }
			setIssued(id)
		}

		// Every setState below runs in a promise continuation, never
		// synchronously in the effect body.
		void (async () => {
			if (isBackendConfigured) {
				try {
					const response = await fetch(`${BACKEND_URL}/session`)
					if (response.ok) {
						const data = (await response.json()) as { userId?: string }
						if (isValid(data.userId)) {
							persist(data.userId)
							return
						}
					}
				} catch { /* fall through to the local id */ }
			}
			persist(generateLocally())
		})()

		return () => { cancelled = true }
	}, [resolved])

	return resolved
}
