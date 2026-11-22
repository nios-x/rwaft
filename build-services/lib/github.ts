import { createDecipheriv, createHash } from "node:crypto"

/**
 * GitHub's REST API, for pull request jobs.
 *
 * A PR job never clones: it reads the file list and the files it needs over
 * the API and writes its change as blobs, a tree and a commit, so the worker
 * holds a few hundred kilobytes in memory instead of a checkout on disk.
 */

const API = "https://api.github.com"
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID?.trim() || ""
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET?.trim() || ""
const GITHUB_TIMEOUT_MS = Number(process.env.GITHUB_TIMEOUT_MS || 30_000)
/** Attempts for one call when GitHub is briefly unavailable or asks us to slow down. */
const ATTEMPTS = 3

/** Bun's types lack the DOM Response; describe only what is used. */
type FetchResponse = {
	ok: boolean
	status: number
	headers: { get(name: string): string | null }
	text(): Promise<string>
}

export class GitHubError extends Error {
	constructor(readonly status: number, message: string, readonly detail: string = "") {
		super(message)
	}
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** 5xx, or a secondary rate limit: worth one more try after a pause. */
const retryAfterMs = (status: number, headers: FetchResponse["headers"], text: string, attempt: number): number | null => {
	if (status >= 500) return 1_000 * attempt
	if (status === 429 || (status === 403 && /secondary rate limit|abuse/i.test(text))) {
		const seconds = Number(headers.get("retry-after"))
		return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1_000, 30_000) : 5_000 * attempt
	}
	return null
}

async function request<T>(url: string, init: { method: string; headers: Record<string, string>; body?: unknown }): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS)
		let response: FetchResponse
		let text: string
		try {
			response = await fetch(url, {
				method: init.method,
				headers: {
					Accept: "application/vnd.github+json",
					"User-Agent": "rwaft",
					"X-GitHub-Api-Version": "2022-11-28",
					...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
					...init.headers
				},
				body: init.body === undefined ? undefined : JSON.stringify(init.body),
				signal: controller.signal
			}) as unknown as FetchResponse
			text = await response.text()
		} catch (error) {
			if (attempt < ATTEMPTS) {
				await sleep(1_000 * attempt)
				continue
			}
			throw new GitHubError(504, `GitHub didn't answer (${(error as Error).message})`)
		} finally {
			clearTimeout(timer)
		}

		let data: unknown = {}
		try {
			data = text ? JSON.parse(text) : {}
		} catch { /* a non-JSON error page; reported by status below */ }
		if (response.ok) return data as T

		const wait = retryAfterMs(response.status, response.headers, text, attempt)
		if (wait !== null && attempt < ATTEMPTS) {
			await sleep(wait)
			continue
		}
		const message = (data as { message?: unknown }).message
		throw new GitHubError(response.status, typeof message === "string" ? message : `GitHub returned ${response.status}`, text.slice(0, 500))
	}
}

/** Calls made with one user's token, for one job. */
export class GitHubClient {
	constructor(private readonly token: string) { }

	call<T>(method: string, path: string, body?: unknown): Promise<T> {
		return request<T>(`${API}${path}`, { method, headers: { Authorization: `Bearer ${this.token}` }, body })
	}
	get<T>(path: string) { return this.call<T>("GET", path) }
	post<T>(path: string, body: unknown) { return this.call<T>("POST", path, body) }
}

// ── The token the API handed over ───────────────────────────────────────────

/** Keep in sync with sealToken in backend-services/lib/github.ts. */
const tokenKey = () =>
	createHash("sha256").update(process.env.GITHUB_TOKEN_KEY?.trim() || `rwaft:github-token:${GITHUB_CLIENT_SECRET}`).digest()

/** Throws when the token was sealed with another key (the two services' GitHub settings differ). */
export function openToken(sealed: string): string {
	const packed = Buffer.from(sealed, "base64url")
	const decipher = createDecipheriv("aes-256-gcm", tokenKey(), packed.subarray(0, 12))
	decipher.setAuthTag(packed.subarray(12, 28))
	return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString("utf-8")
}

/**
 * Whether this worker can decrypt and revoke the API's tokens. An OAuth App
 * token never expires on its own, so a worker that couldn't revoke one must
 * not use it either.
 */
export const canHandlePullRequests = Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET)

/** Ends the token's life when the job is over. Needs the OAuth App's credentials, as the API has. */
export async function revokeToken(token: string): Promise<void> {
	if (!canHandlePullRequests) throw new Error("GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are not set on build-services")
	const basic = Buffer.from(`${GITHUB_CLIENT_ID}:${GITHUB_CLIENT_SECRET}`).toString("base64")
	await request(`${API}/applications/${GITHUB_CLIENT_ID}/token`, {
		method: "DELETE",
		headers: { Authorization: `Basic ${basic}` },
		body: { access_token: token }
	})
}
