"use client"

import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { BACKEND_URL, isBackendConfigured, readApiJson } from "./config"

export interface TokenPack {
	id: string
	tokens: number
	/** Minor currency units, e.g. cents. */
	amount: number
}

export interface AuthConfig {
	/** True when the API runs with PROD=true: builds need an account and cost tokens. */
	billing: boolean
	googleClientId: string | null
	signupTokens: number
	/** Each account is topped back up to this once a week; 0 or missing means no weekly top-up. */
	weeklyTokens?: number
	/** `pr` is missing on an API from before pull requests. */
	costs: { deploy: number; prompt: number; pr?: number }
	currency: string
	packs: TokenPack[]
	/** The payment provider recharges go through, or null while none is connected. */
	payments: "dodo" | null
	/** Local testing: a free top-up button while no provider is connected. */
	testCredits: boolean
	/** True when the API has a GitHub OAuth App, so finished apps can be pushed to GitHub. */
	github?: boolean
}

export interface Account {
	id: string
	email: string
	name: string
	picture: string
	tokens: number
	/** The last weekly top-up (epoch ms), or null before the first. Missing on an older API. */
	refilledAt?: number | null
	/** When the next weekly top-up can happen, or null when none is waiting. */
	nextRefillAt?: number | null
}

const STORAGE_KEY = "rwaft:session"
const CHANGE_EVENT = "rwaft:session-change"

/**
 * The session token lives in localStorage and is read through
 * useSyncExternalStore, like the anonymous id in useUserId. A same-tab write
 * fires no `storage` event, so writes also dispatch a local one.
 */
const readToken = (): string | null => {
	try {
		return window.localStorage.getItem(STORAGE_KEY)
	} catch {
		return null
	}
}
const writeToken = (token: string | null) => {
	try {
		if (token) window.localStorage.setItem(STORAGE_KEY, token)
		else window.localStorage.removeItem(STORAGE_KEY)
	} catch { /* storage disabled: the session lasts for this tab only */ }
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
const getServerSnapshot = () => null

export interface AccountState {
	config: AuthConfig | null
	account: Account | null
	token: string | null
	/** True until the stored session has been checked against the API. */
	checking: boolean
	signIn: (credential: string) => Promise<void>
	signOut: () => void
	refresh: () => Promise<Account | null>
	setBalance: (tokens: number) => void
	authHeaders: () => Record<string, string>
}

export function useAccount(): AccountState {
	const token = useSyncExternalStore(subscribe, readToken, getServerSnapshot)
	const [config, setConfig] = useState<AuthConfig | null>(null)
	const [account, setAccount] = useState<Account | null>(null)
	const [checkedToken, setCheckedToken] = useState<string | null>(null)

	// Without the config there is no sign-in button, so one failed request (an
	// API restarting mid-deploy, a dropped connection) used to leave the page
	// unable to sign anyone in until a reload. Keep asking, backing off to 30s.
	useEffect(() => {
		if (!isBackendConfigured) return
		let cancelled = false
		let timer: ReturnType<typeof setTimeout> | undefined
		const load = async (attempt: number) => {
			try {
				const response = await fetch(`${BACKEND_URL}/auth/config`)
				if (response.ok) {
					const data = await response.json() as AuthConfig
					if (!cancelled) setConfig(data)
					return
				}
			} catch { /* retried below */ }
			if (!cancelled) timer = setTimeout(() => void load(attempt + 1), Math.min(1_000 * 2 ** attempt, 30_000))
		}
		void load(0)
		return () => {
			cancelled = true
			clearTimeout(timer)
		}
	}, [])

	const refresh = useCallback(async (): Promise<Account | null> => {
		const current = readToken()
		if (!current || !isBackendConfigured) {
			setAccount(null)
			return null
		}
		try {
			const response = await fetch(`${BACKEND_URL}/auth/me`, { headers: { Authorization: `Bearer ${current}` } })
			if (response.status === 401) {
				// Expired or revoked: forget it so the sign-in button comes back.
				writeToken(null)
				setAccount(null)
				return null
			}
			if (!response.ok) return null
			const data = await response.json() as { account?: Account }
			setAccount(data.account ?? null)
			return data.account ?? null
		} catch {
			return null
		} finally {
			setCheckedToken(current)
		}
	}, [])

	useEffect(() => {
		if (!token) return
		let cancelled = false
		void (async () => {
			if (!cancelled) await refresh()
		})()
		return () => { cancelled = true }
	}, [token, refresh])

	const signIn = useCallback(async (credential: string) => {
		const response = await fetch(`${BACKEND_URL}/auth/google`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ credential })
		})
		const data = await readApiJson<{ token?: string; account?: Account; message?: string }>(response)
		if (!response.ok || !data.token || !data.account) throw new Error(data.message || "Sign-in failed")
		writeToken(data.token)
		setAccount(data.account)
		setCheckedToken(data.token)
	}, [])

	const signOut = useCallback(() => {
		const current = readToken()
		if (current && isBackendConfigured) {
			void fetch(`${BACKEND_URL}/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${current}` } }).catch(() => { })
		}
		writeToken(null)
		setAccount(null)
		// Without this Google would sign the same account straight back in.
		window.google?.accounts.id.disableAutoSelect()
	}, [])

	const setBalance = useCallback((tokens: number) => {
		setAccount((current) => (current ? { ...current, tokens } : current))
	}, [])

	const authHeaders = useCallback((): Record<string, string> => {
		const current = readToken()
		return current ? { Authorization: `Bearer ${current}` } : {}
	}, [])

	return {
		config,
		account: token ? account : null,
		token,
		checking: Boolean(token) && checkedToken !== token,
		signIn,
		signOut,
		refresh,
		setBalance,
		authHeaders
	}
}

// ── Google Identity Services ────────────────────────────────────────────────

interface GoogleButtonOptions {
	type?: "standard" | "icon"
	theme?: "outline" | "filled_blue" | "filled_black"
	size?: "large" | "medium" | "small"
	text?: "signin_with" | "signup_with" | "continue_with" | "signin"
	shape?: "rectangular" | "pill" | "circle" | "square"
	width?: number
	logo_alignment?: "left" | "center"
}

declare global {
	interface Window {
		google?: {
			accounts: {
				id: {
					initialize(options: { client_id: string; callback: (response: { credential: string }) => void; auto_select?: boolean; ux_mode?: "popup" | "redirect" }): void
					renderButton(parent: HTMLElement, options: GoogleButtonOptions): void
					disableAutoSelect(): void
				}
			}
		}
	}
}

let gisLoading: Promise<void> | null = null
let initializedFor: string | null = null
/**
 * GIS takes one callback per page; every rendered button routes through it.
 * A stack rather than a single slot: with two buttons mounted, the old slot
 * was nulled by whichever unmounted first, and the survivor's sign-in then
 * went nowhere.
 */
const credentialHandlers: Array<(credential: string) => void> = []

export function loadGoogleIdentity(clientId: string): Promise<void> {
	if (!gisLoading) {
		gisLoading = new Promise<void>((resolve, reject) => {
			const script = document.createElement("script")
			script.src = "https://accounts.google.com/gsi/client"
			script.async = true
			script.onload = () => resolve()
			script.onerror = () => {
				gisLoading = null
				reject(new Error("Google sign-in could not load"))
			}
			document.head.appendChild(script)
		})
	}
	return gisLoading.then(() => {
		if (initializedFor === clientId || !window.google) return
		window.google.accounts.id.initialize({
			client_id: clientId,
			ux_mode: "popup",
			callback: (response) => credentialHandlers.at(-1)?.(response.credential)
		})
		initializedFor = clientId
	})
}

/** Registers a button's sign-in handler; returns the unregister function. */
export const registerCredentialHandler = (handler: (credential: string) => void) => {
	credentialHandlers.push(handler)
	return () => {
		const index = credentialHandlers.lastIndexOf(handler)
		if (index >= 0) credentialHandlers.splice(index, 1)
	}
}
