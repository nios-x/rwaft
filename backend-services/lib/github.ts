import { gunzipSync } from "node:zlib"
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { getRedisClient } from "./redis.ts"
import { PR_TOKEN_DEADLINES, prTokenKey } from "./constants.ts"
import { T, kv, q } from "./db.ts"

/**
 * "Push to GitHub" through a GitHub OAuth App.
 *
 * Each push runs its own authorization and the access token is revoked as soon
 * as the push ends, so no GitHub credential is ever stored. GitHub remembers
 * the user's consent, so after the first time the popup only flashes.
 */
export const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID?.trim() || ""
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET?.trim() || ""
export const isGitHubConfigured = Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET)

const API = "https://api.github.com"
const GITHUB_TIMEOUT_MS = Number(process.env.GITHUB_TIMEOUT_MS || 30_000)
/** Blob uploads in flight at once: fast enough, and well under GitHub's secondary rate limits. */
const BLOB_BATCH_SIZE = 6

/** See the note on FetchResponse in index.ts: Bun's types lack the DOM Response. */
type FetchResponse = {
	ok: boolean
	status: number
	text(): Promise<string>
}

export class GitHubError extends Error {
	constructor(readonly status: number, message: string, readonly detail: string = "") {
		super(message)
	}
}

async function request<T>(url: string, init: { method: string; headers: Record<string, string>; body?: unknown }): Promise<T> {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS)
	try {
		const response = await fetch(url, {
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
		const text = await response.text()
		let data: unknown = {}
		try {
			data = text ? JSON.parse(text) : {}
		} catch { /* a non-JSON error page; reported by status below */ }
		if (!response.ok) {
			const message = (data as { message?: unknown }).message
			throw new GitHubError(response.status, typeof message === "string" ? message : `GitHub returned ${response.status}`, text.slice(0, 500))
		}
		return data as T
	} finally {
		clearTimeout(timer)
	}
}

const api = <T>(token: string, method: string, path: string, body?: unknown) =>
	request<T>(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}` }, body })

// ── OAuth ───────────────────────────────────────────────────────────────────

/**
 * Least privilege per push: `public_repo` cannot read or write any private
 * repository, so it is only widened to `repo` when the user asked for a
 * private one.
 */
export function authorizeUrl(state: string, redirectUri: string, privateRepo: boolean): string {
	const params = new URLSearchParams({
		client_id: GITHUB_CLIENT_ID,
		redirect_uri: redirectUri,
		scope: privateRepo ? "repo" : "public_repo",
		state,
		allow_signup: "true"
	})
	return `https://github.com/login/oauth/authorize?${params}`
}

export async function exchangeCode(code: string, redirectUri: string): Promise<string> {
	const data = await request<{ access_token?: string; error_description?: string }>("https://github.com/login/oauth/access_token", {
		method: "POST",
		headers: { Accept: "application/json" },
		body: { client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code, redirect_uri: redirectUri }
	})
	if (!data.access_token) throw new GitHubError(401, data.error_description || "GitHub did not return an access token")
	return data.access_token
}

/**
 * A pull request job runs for minutes on the worker, so unlike a push its
 * token has to outlive the callback request. It is handed over encrypted
 * (AES-256-GCM) under a short expiry, and the worker deletes and revokes it
 * when the job ends. The key is GITHUB_TOKEN_KEY, or one derived from the
 * OAuth App's secret, which the worker needs anyway to revoke the token.
 * Keep the derivation in sync with build-services/lib/github.ts.
 */
const tokenKey = () =>
	createHash("sha256").update(process.env.GITHUB_TOKEN_KEY?.trim() || `rwaft:github-token:${GITHUB_CLIENT_SECRET}`).digest()

/** iv (12 bytes) + auth tag (16) + ciphertext, base64url. */
export function sealToken(token: string): string {
	const iv = randomBytes(12)
	const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv)
	const sealed = Buffer.concat([cipher.update(token, "utf-8"), cipher.final()])
	return Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString("base64url")
}

/** The reverse, for the sweep that revokes tokens whose job never cleaned up. Throws on a foreign key. */
export function openToken(sealed: string): string {
	const packed = Buffer.from(sealed, "base64url")
	const decipher = createDecipheriv("aes-256-gcm", tokenKey(), packed.subarray(0, 12))
	decipher.setAuthTag(packed.subarray(12, 28))
	return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString("utf-8")
}

/**
 * Revokes every sealed PR token past its deadline and forgets it. A running
 * job or CI watch keeps pushing its own deadline forward, so what is left
 * here belongs to a job that never ran, or a worker that died. A failed
 * revoke stays for the next sweep; one GitHub says is already gone doesn't.
 */
let sweeping = false

export async function revokeExpiredTokens(): Promise<number> {
	// One sweep at a time (the API runs as one instance).
	if (sweeping) return 0
	sweeping = true
	try {
		return await sweepExpiredTokens()
	} finally {
		sweeping = false
	}
}

async function sweepExpiredTokens(): Promise<number> {
	const redis = await getRedisClient()
	const due = await redis.zRangeByScore(PR_TOKEN_DEADLINES, "-inf", Date.now(), { LIMIT: { offset: 0, count: 50 } })
	let revoked = 0
	for (const jobId of due) {
		const sealed = await kv.get(prTokenKey(jobId))
		if (sealed) {
			let token: string | null = null
			try {
				token = openToken(sealed)
			} catch {
				console.warn(`[github] Dropping the PR token of ${jobId}: it was sealed with another key`)
			}
			if (token) {
				try {
					await revokeToken(token)
					revoked++
				} catch (error) {
					if (!(error instanceof GitHubError) || (error.status !== 404 && error.status !== 422)) {
						console.warn(`[github] Revoking the PR token of ${jobId} failed, retrying next sweep:`, (error as Error).message)
						continue
					}
				}
			}
		}
		await kv.del(prTokenKey(jobId))
		await redis.zRem(PR_TOKEN_DEADLINES, jobId)
	}
	// Expired short-lived records go with the sweep, which only runs while there are tokens to look at.
	if (due.length > 0) await kv.prune().catch(() => { })
	return revoked
}

/** Ends the token's life the moment the push is over. Failure here is logged, never surfaced. */
export async function revokeToken(token: string): Promise<void> {
	const basic = Buffer.from(`${GITHUB_CLIENT_ID}:${GITHUB_CLIENT_SECRET}`).toString("base64")
	await request(`${API}/applications/${GITHUB_CLIENT_ID}/token`, {
		method: "DELETE",
		headers: { Authorization: `Basic ${basic}` },
		body: { access_token: token }
	})
}

// ── Repositories a pull request targets ─────────────────────────────────────

export interface RepositoryRef {
	owner: string
	name: string
}

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/

/**
 * Reads "owner/name" out of what people paste: a github.com URL (with or
 * without .git, /tree/main/src, a query or a fragment) or the bare
 * "owner/name" itself. An issue link (/owner/name/issues/12) also gives the
 * issue the pull request should resolve.
 */
export function parseRepository(raw: unknown): { ok: true; repo: RepositoryRef; issue?: number } | { ok: false; reason: string } {
	if (typeof raw !== "string" || !raw.trim()) return { ok: false, reason: "A GitHub repository is required" }
	let value = raw.trim()
	if (value.length > 500) return { ok: false, reason: "That repository link is too long" }

	if (/^(https?:\/\/)?(www\.)?github\.com\//i.test(value)) {
		let parsed: URL
		try {
			parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
		} catch {
			return { ok: false, reason: "That isn't a valid GitHub link" }
		}
		if (parsed.username || parsed.password) return { ok: false, reason: "The link must not contain credentials" }
		value = parsed.pathname.replace(/^\/+/, "")
	} else if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.includes("@")) {
		return { ok: false, reason: "Use a github.com repository link, like https://github.com/owner/repo" }
	}

	const [owner = "", rawName = "", section = "", number = ""] = value.split("/")
	const name = rawName.replace(/\.git$/i, "")
	if (!OWNER.test(owner) || !isRepositoryName(name)) {
		return { ok: false, reason: "Use a github.com repository link, like https://github.com/owner/repo" }
	}
	const issue = section === "issues" && /^\d{1,9}$/.test(number) ? Number(number) : undefined
	return { ok: true, repo: { owner, name }, ...(issue ? { issue } : {}) }
}

/**
 * An issue the description points at: a link to an issue in the same
 * repository anywhere in it, or a description that is only "#12".
 */
export function issueInDescription(prompt: string, repo: RepositoryRef): number | undefined {
	const bare = /^\s*#(\d{1,9})\s*$/.exec(prompt)
	if (bare) return Number(bare[1])
	for (const match of prompt.matchAll(/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)\/issues\/(\d{1,9})/gi)) {
		if (match[1]!.toLowerCase() === repo.owner.toLowerCase() && match[2]!.toLowerCase() === repo.name.toLowerCase()) return Number(match[3])
	}
	return undefined
}

/** A branch name git and GitHub accept, without the corner cases a ref can't be. */
export const isBranchName = (value: unknown): value is string =>
	typeof value === "string" && value.length <= 200 && /^[A-Za-z0-9._/-]+$/.test(value)
	&& !value.startsWith("/") && !value.startsWith("-") && !value.endsWith("/") && !value.endsWith(".")
	&& !value.endsWith(".lock") && !value.includes("..") && !value.includes("//")

export interface RepositoryInfo {
	full_name: string
	html_url: string
	private: boolean
	archived: boolean
	disabled?: boolean
	default_branch: string
	size: number
	permissions?: { push?: boolean }
}

export const getRepository = (token: string, repo: RepositoryRef) =>
	api<RepositoryInfo>(token, "GET", `/repos/${repo.owner}/${repo.name}`)

/**
 * Whether a repository is publicly visible, asked as the OAuth App (its
 * client credentials get the app's own rate limit, not the server IP's 60 an
 * hour). Lets the console say "not found" before sending anyone to GitHub's
 * consent screen. null when GitHub can't be asked; the caller goes ahead.
 */
export async function isPublicRepository(repo: RepositoryRef): Promise<boolean | null> {
	const basic = Buffer.from(`${GITHUB_CLIENT_ID}:${GITHUB_CLIENT_SECRET}`).toString("base64")
	try {
		const info = await request<RepositoryInfo>(`${API}/repos/${repo.owner}/${repo.name}`, { method: "GET", headers: { Authorization: `Basic ${basic}` } })
		return !info.private
	} catch (error) {
		if (error instanceof GitHubError && error.status === 404) return false
		return null
	}
}

export interface BranchList {
	defaultBranch: string
	/** The default branch first, then the rest as GitHub lists them. */
	branches: string[]
	/** More branches exist than were read. */
	truncated: boolean
}

/** GitHub lists 100 branches a page; this many pages covers nearly every repository. */
const BRANCH_PAGES = 3
const BRANCH_CACHE_MS = 60_000
/** In memory: a minute-long cache doesn't need to outlive the process. */
const branchCache = new Map<string, { result: BranchList | null; expiresAt: number }>()
const branchCacheKey = (repo: RepositoryRef) => `${repo.owner.toLowerCase()}/${repo.name.toLowerCase()}`

/**
 * A public repository's branches, for the pull request tab's base picker,
 * asked as the OAuth App like isPublicRepository. null when the repository is
 * private or doesn't exist: before the consent screen there is no way to tell
 * which, and nothing to list either way. Cached briefly, since the picker asks
 * again whenever the repository field settles.
 */
export async function listPublicBranches(repo: RepositoryRef): Promise<BranchList | null> {
	const now = Date.now()
	const cached = branchCache.get(branchCacheKey(repo))
	if (cached && cached.expiresAt > now) return cached.result
	if (branchCache.size > 500) for (const [key, entry] of branchCache) if (entry.expiresAt <= now) branchCache.delete(key)

	const basic = Buffer.from(`${GITHUB_CLIENT_ID}:${GITHUB_CLIENT_SECRET}`).toString("base64")
	const headers = { Authorization: `Basic ${basic}` }
	let result: BranchList | null
	try {
		const info = await request<RepositoryInfo>(`${API}/repos/${repo.owner}/${repo.name}`, { method: "GET", headers })
		if (info.private) {
			result = null
		} else {
			const names: string[] = []
			let truncated = false
			for (let page = 1; page <= BRANCH_PAGES; page++) {
				const batch = await request<{ name?: unknown }[]>(`${API}/repos/${repo.owner}/${repo.name}/branches?per_page=100&page=${page}`, { method: "GET", headers })
				for (const branch of batch) if (isBranchName(branch.name)) names.push(branch.name)
				if (batch.length < 100) break
				if (page === BRANCH_PAGES) truncated = true
			}
			const rest = names.filter((name) => name !== info.default_branch)
			result = { defaultBranch: info.default_branch, branches: [info.default_branch, ...rest], truncated }
		}
	} catch (error) {
		if (!(error instanceof GitHubError) || error.status !== 404) throw error
		result = null
	}
	branchCache.set(branchCacheKey(repo), { result, expiresAt: Date.now() + BRANCH_CACHE_MS })
	return result
}

// ── Source snapshots ────────────────────────────────────────────────────────

export interface SourceFile {
	path: string
	/** base64 */
	content: string
}

export interface SourceSnapshot {
	owner: string
	fileCount: number
	/** Set once pushed. */
	repoUrl?: string
	/** Whether the files are still there to change (a push before follow-up changes existed dropped them). */
	hasFiles: boolean
}

export async function readSnapshot(buildId: string): Promise<SourceSnapshot | null> {
	const [row] = await q<{ owner: string; file_count: number; repo_url: string | null; has_files: boolean }>(
		`select owner, file_count, repo_url, files is not null as has_files from ${T.sources} where job_id = $1 and expires_at > now()`, [buildId])
	if (!row?.owner) return null
	return { owner: row.owner, fileCount: Number(row.file_count) || 0, repoUrl: row.repo_url || undefined, hasFiles: Boolean(row.has_files) }
}

export async function readSnapshotFiles(buildId: string): Promise<SourceFile[] | null> {
	const [row] = await q<{ files: string | null }>(`select files from ${T.sources} where job_id = $1 and expires_at > now()`, [buildId])
	const packed = row?.files
	if (!packed) return null
	const files = JSON.parse(gunzipSync(Buffer.from(packed, "base64")).toString("utf-8")) as SourceFile[]
	return Array.isArray(files) ? files : null
}

/**
 * Records where the source went. The files stay, under the snapshot's own
 * expiry: a pushed app can still be changed with a follow-up message.
 */
export async function markSnapshotPushed(buildId: string, repoUrl: string): Promise<void> {
	await q(`update ${T.sources} set repo_url = $2 where job_id = $1`, [buildId, repoUrl])
}

// ── Pushing ─────────────────────────────────────────────────────────────────

/** GitHub's own rule for repository names. */
export const isRepositoryName = (value: unknown): value is string =>
	typeof value === "string" && /^[A-Za-z0-9._-]{1,100}$/.test(value) && value !== "." && value !== ".."

interface Repository {
	full_name: string
	html_url: string
	default_branch: string
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Takes the requested name, or name-2 … name-5 when the user already has it. */
async function createRepository(token: string, name: string, privateRepo: boolean): Promise<Repository> {
	for (let attempt = 1; attempt <= 5; attempt++) {
		const candidate = attempt === 1 ? name : `${name.slice(0, 97)}-${attempt}`
		try {
			// auto_init: GitHub's Git Data API refuses to write to an empty repository,
			// so it needs one commit to exist. That commit is replaced below.
			return await api<Repository>(token, "POST", "/user/repos", {
				name: candidate,
				private: privateRepo,
				description: "Built with rwaft",
				auto_init: true
			})
		} catch (error) {
			if (error instanceof GitHubError && error.status === 422 && /already exists/i.test(error.detail)) continue
			throw error
		}
	}
	throw new GitHubError(422, `You already have repositories named ${name} through ${name}-5. Pick another name.`)
}

/** auto_init's commit lands a moment after the repo itself; writing before it 409s. */
async function waitForBranch(token: string, repo: Repository): Promise<void> {
	for (let attempt = 0; attempt < 10; attempt++) {
		try {
			await api(token, "GET", `/repos/${repo.full_name}/git/ref/heads/${repo.default_branch}`)
			return
		} catch (error) {
			if (!(error instanceof GitHubError) || (error.status !== 404 && error.status !== 409)) throw error
			await sleep(500)
		}
	}
	throw new GitHubError(504, "GitHub created the repository but it never became ready")
}

const readme = (name: string) => `# ${name}

Built with [rwaft](https://github.com/nios-x/rwaft): a React + TypeScript app on Vite, styled with Tailwind CSS.

## Run it locally

\`\`\`bash
npm install
npm run dev
\`\`\`

## Build for production

\`\`\`bash
npm run build
\`\`\`

The output is in \`dist/\`, ready for any static host.
`

/**
 * Creates a repository on the user's account and writes the whole source as
 * one commit. The commit has no parent and the branch is moved onto it, so the
 * repository's history is that single commit, not GitHub's placeholder README
 * plus ours.
 */
export async function pushToNewRepository(token: string, name: string, privateRepo: boolean, files: SourceFile[]): Promise<Repository> {
	const repo = await createRepository(token, name, privateRepo)
	try {
		await waitForBranch(token, repo)

		// The scaffold's README describes the template, not this app.
		const repoName = repo.full_name.split("/")[1] || name
		const contents = [
			...files.filter((file) => file.path.toLowerCase() !== "readme.md"),
			{ path: "README.md", content: Buffer.from(readme(repoName)).toString("base64") }
		]

		const tree: { path: string; mode: "100644"; type: "blob"; sha: string }[] = []
		for (let index = 0; index < contents.length; index += BLOB_BATCH_SIZE) {
			const batch = contents.slice(index, index + BLOB_BATCH_SIZE)
			tree.push(...await Promise.all(batch.map(async (file) => {
				const blob = await api<{ sha: string }>(token, "POST", `/repos/${repo.full_name}/git/blobs`, {
					content: file.content,
					encoding: "base64"
				})
				return { path: file.path, mode: "100644" as const, type: "blob" as const, sha: blob.sha }
			})))
		}

		const created = await api<{ sha: string }>(token, "POST", `/repos/${repo.full_name}/git/trees`, { tree })
		const commit = await api<{ sha: string }>(token, "POST", `/repos/${repo.full_name}/git/commits`, {
			message: "Initial commit from rwaft",
			tree: created.sha,
			parents: []
		})
		await api(token, "PATCH", `/repos/${repo.full_name}/git/refs/heads/${repo.default_branch}`, { sha: commit.sha, force: true })
		return repo
	} catch (error) {
		// The token cannot delete repositories (that needs delete_repo), so say
		// where the half-made one is rather than leave the user to find it.
		const reason = error instanceof Error ? error.message : String(error)
		throw new GitHubError(
			error instanceof GitHubError ? error.status : 502,
			`GitHub created ${repo.html_url} but the files could not be pushed (${reason}). Delete that repository and try again.`
		)
	}
}
