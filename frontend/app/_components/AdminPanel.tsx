"use client"

import { useCallback, useEffect, useState } from "react"
import type { FormEvent } from "react"
import { BACKEND_URL, MISSING_BACKEND_MESSAGE, isBackendConfigured, readApiJson } from "../../lib/config"
import { ChevronLeft, ChevronRight } from "./Icons"

interface AdminUser {
	id: string
	email: string
	name: string
	credits: number
	createdAt: string | null
}

interface UserPage {
	totalUsers: number
	totalCredits: number
	page: number
	pageSize: number
	pages: number
	users: AdminUser[]
}

/** Remembered for this tab only, so closing it signs the admin out. */
const STORAGE_KEY = "rwaft:admin-password"
const PAGE_SIZE = 25

const readStored = () => {
	try {
		return window.sessionStorage.getItem(STORAGE_KEY) || ""
	} catch {
		return ""
	}
}
const store = (value: string) => {
	try {
		if (value) window.sessionStorage.setItem(STORAGE_KEY, value)
		else window.sessionStorage.removeItem(STORAGE_KEY)
	} catch { /* storage disabled: the password lasts until a reload */ }
}

const joined = (iso: string | null) =>
	iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—"

export function AdminPanel() {
	const [password, setPassword] = useState("")
	const [draft, setDraft] = useState("")
	const [data, setData] = useState<UserPage | null>(null)
	const [query, setQuery] = useState("")
	const [search, setSearch] = useState("")
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState("")

	// State is only set after the request returns, so an effect may call this;
	// callers that want the busy state set it themselves first.
	const load = useCallback(async (secret: string, wanted: number, q: string) => {
		try {
			if (!isBackendConfigured) throw new Error(MISSING_BACKEND_MESSAGE)
			const params = new URLSearchParams({ page: String(wanted), pageSize: String(PAGE_SIZE), q })
			const response = await fetch(`${BACKEND_URL}/admin/users?${params}`, { headers: { "X-Admin-Password": secret } })
			const result = await readApiJson<UserPage & { message?: string }>(response)
			setError("")
			if (response.status === 401) {
				store("")
				setPassword("")
				setData(null)
				throw new Error(result.message || "Wrong password")
			}
			if (!response.ok) throw new Error(result.message || "Could not load users")
			setPassword(secret)
			store(secret)
			setData(result)
		} catch (loadError) {
			setError(loadError instanceof Error ? loadError.message : "Could not load users")
		} finally {
			setLoading(false)
		}
	}, [])

	// A password kept from earlier in this tab unlocks straight away.
	useEffect(() => {
		const stored = readStored()
		if (!stored) return
		void (async () => { await load(stored, 1, "") })()
	}, [load])

	// Search as you type, once typing pauses.
	useEffect(() => {
		if (!password) return
		const timer = setTimeout(() => {
			if (query !== search) {
				setSearch(query)
				setLoading(true)
				void load(password, 1, query)
			}
		}, 300)
		return () => clearTimeout(timer)
	}, [query, search, password, load])

	const unlock = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		if (!draft) return
		setLoading(true)
		void load(draft, 1, "")
	}

	const signOut = () => {
		store("")
		setPassword("")
		setDraft("")
		setData(null)
		setQuery("")
		setSearch("")
	}

	if (!password || !data) {
		return (
			<form className="admin-lock" onSubmit={unlock}>
				<h1>Admin</h1>
				<p>Enter the admin password to see accounts and their credits.</p>
				<input
					type="password"
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					placeholder="Password"
					aria-label="Admin password"
					autoComplete="current-password"
					autoFocus
				/>
				{error && <p className="field-error" role="alert">{error}</p>}
				<button type="submit" className="pill-btn pill-btn--ink" disabled={!draft || loading}>
					{loading ? "Checking…" : "Unlock"}
				</button>
			</form>
		)
	}

	const first = data.totalUsers === 0 ? 0 : (data.page - 1) * data.pageSize + 1
	const last = Math.min(data.page * data.pageSize, data.totalUsers)
	const go = (target: number) => {
		setLoading(true)
		void load(password, target, search)
	}

	return (
		<div className="admin">
			<div className="admin-top">
				<h1>Admin</h1>
				<button type="button" className="text-btn" onClick={signOut}>Lock</button>
			</div>

			<dl className="admin-stats">
				<div>
					<dt>{search ? "Matching users" : "Users"}</dt>
					<dd>{data.totalUsers.toLocaleString()}</dd>
				</div>
				<div>
					<dt>Credits remaining</dt>
					<dd>{data.totalCredits.toLocaleString()}</dd>
				</div>
			</dl>

			<input
				type="search"
				className="admin-search"
				value={query}
				onChange={(event) => setQuery(event.target.value)}
				placeholder="Search by name or email"
				aria-label="Search users"
			/>
			{error && <p className="field-error" role="alert">{error}</p>}

			<div className="admin-table-wrap" aria-busy={loading}>
				<table className="admin-table">
					<thead>
						<tr>
							<th scope="col">User</th>
							<th scope="col">Joined</th>
							<th scope="col" className="admin-num">Credits</th>
						</tr>
					</thead>
					<tbody>
						{data.users.length === 0 ? (
							<tr><td colSpan={3} className="admin-empty">{search ? "No users match that search." : "No users yet."}</td></tr>
						) : data.users.map((user) => (
							<tr key={user.id}>
								<td>
									<span className="admin-name">{user.name || "—"}</span>
									<span className="admin-email">{user.email}</span>
								</td>
								<td>{joined(user.createdAt)}</td>
								<td className="admin-num">{user.credits.toLocaleString()}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<nav className="admin-pager" aria-label="Pages">
				<span>{first}–{last} of {data.totalUsers.toLocaleString()}</span>
				<div>
					<button type="button" className="icon-btn" aria-label="Previous page" disabled={loading || data.page <= 1} onClick={() => go(data.page - 1)}>
						<ChevronLeft />
					</button>
					<span className="admin-page">Page {data.page} of {data.pages}</span>
					<button type="button" className="icon-btn" aria-label="Next page" disabled={loading || data.page >= data.pages} onClick={() => go(data.page + 1)}>
						<ChevronRight />
					</button>
				</div>
			</nav>
		</div>
	)
}
