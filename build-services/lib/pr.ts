import { complete } from "./ai.ts"
import { jobLog } from "./joblog.ts"
import { parseFiles, repairFile } from "./pages.ts"
import { GitHubClient, GitHubError } from "./github.ts"

/**
 * "Open a pull request": an AI change to a GitHub repository, without a clone.
 *
 * 1. Read: the repository, the branch to change, and its whole file list in
 *    one recursive tree call (paths and sizes, no contents).
 * 2. Explore: the model asks for files, folders, path matches or code search
 *    results a round at a time, and only the files it names are downloaded.
 *    Everything stays in memory.
 * 3. Edit: one call with those files and the request; the model answers with
 *    whole files in the <file path="..."> tags the rest of rwaft uses. Each
 *    is parsed before it goes anywhere, and a broken one goes back alone with
 *    its exact error.
 * 4. Write: blobs for the changed files, a tree on top of the current one, a
 *    commit, and then either a new branch and pull request (on the user's
 *    fork when they can't push), or, for a follow-up or a CI fix, the open
 *    pull request's branch moved forward with a comment saying what changed.
 *
 * Nothing is built or run here: that would need the checkout this avoids. The
 * CI watch (ci.ts) is what runs the project's own checks against the change.
 */

const MAX_READ_FILES = Number(process.env.PR_MAX_READ_FILES || 40)
const MAX_READ_CHARS = Number(process.env.PR_MAX_READ_CHARS || 300_000)
const MAX_FILE_BYTES = Number(process.env.PR_MAX_FILE_BYTES || 150_000)
const EXPLORE_ROUNDS = Math.max(1, Number(process.env.PR_EXPLORE_ROUNDS || 3))
const READS_PER_ROUND = 20
/** GitHub allows 10 code searches a minute per user; a job keeps well under it. */
const MAX_SEARCHES = Number(process.env.PR_MAX_SEARCHES || 5)
const SEARCH_RESULTS = 20
/** Characters of file list in a brief; a bigger tree is summarised by folder. */
const MAX_LISTING_CHARS = Number(process.env.PR_MAX_LISTING_CHARS || 60_000)
const MAX_LIST_RESULTS = 400
const MAX_CHANGED_FILES = 30
const FILE_REPAIRS = Math.max(0, Number(process.env.FILE_REPAIRS || 2))
const BLOB_BATCH_SIZE = 6
const FORK_READY_ATTEMPTS = 20
const ISSUE_BODY_CHARS = 12_000
const ISSUE_COMMENTS = 10
const ISSUE_COMMENT_CHARS = 2_000
const SITE_URL = (process.env.PR_FOOTER_URL || "https://rwaft.live").replace(/\/+$/, "")

export interface PullRequestJob {
	owner: string
	name: string
	/** What the user typed; may be empty when an issue says what to do. */
	prompt: string
	jobId: string
	/** The branch to open the pull request against; the repository's default otherwise. */
	base?: string
	draft?: boolean
	/** An issue to resolve: its text becomes the request, and merging closes it. */
	issue?: number
}

/** An open pull request, as follow-ups, CI fixes and the console need it. */
export interface PullRequestRef {
	/** "owner/name" of the repository the pull request is on. */
	repo: string
	number: number
	url: string
	title: string
	/** "owner/name" of the repository holding the branch: the same one, or the user's fork. */
	head: string
	branch: string
	base: string
	fork: boolean
	/** Every request behind the pull request, oldest first. */
	history: string[]
}

export interface PullRequestResult extends PullRequestRef {
	/** Files this job changed. */
	files: string[]
	/** The branch's head commit after this job. */
	sha: string
}

/** A follow-up the user asked for, or a fix for failing checks. */
export interface PullRequestUpdate {
	jobId: string
	request: string
	kind: "change" | "fix"
	/** For a fix: the names of the failing checks, for the commit and the comment. */
	checks?: string[]
}

// ── What can be read and written ────────────────────────────────────────────

interface TreeEntry {
	path: string
	mode: string
	type: "blob" | "tree" | "commit"
	sha: string
	size?: number
}

/** Files the model can see but never read or change, and why. */
type Unreadable = "binary" | "lockfile" | "too large" | "symlink" | "submodule" | "generated"

interface RepoFile {
	path: string
	sha: string
	mode: string
	size: number
	unreadable?: Unreadable
}

const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|psd|ai|sketch|fig|pdf|zip|gz|tgz|bz2|xz|tar|rar|7z|jar|war|ear|class|so|dylib|dll|exe|bin|o|a|lib|wasm|pyc|mp3|mp4|m4a|mov|avi|mkv|webm|ogg|wav|flac|woff2?|ttf|otf|eot|sqlite3?|db|keystore|jks|p12)$/i
const LOCKFILE = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|Pipfile\.lock|uv\.lock|Gemfile\.lock|composer\.lock|go\.sum|mix\.lock|pubspec\.lock|Podfile\.lock|flake\.lock)$/
const GENERATED = /(^|\/)(node_modules|\.git|dist|\.next|\.nuxt|\.output|\.svelte-kit|\.turbo|coverage|__pycache__|\.venv|venv)\/|\.min\.(js|css)$|\.map$/

function classify(entry: TreeEntry): RepoFile | null {
	if (entry.type === "tree") return null
	const file: RepoFile = { path: entry.path, sha: entry.sha, mode: entry.mode, size: entry.size ?? 0 }
	if (entry.type === "commit") file.unreadable = "submodule"
	else if (entry.mode === "120000") file.unreadable = "symlink"
	else if (LOCKFILE.test(entry.path)) file.unreadable = "lockfile"
	else if (GENERATED.test(entry.path)) file.unreadable = "generated"
	else if (BINARY.test(entry.path)) file.unreadable = "binary"
	else if (file.size > MAX_FILE_BYTES) file.unreadable = "too large"
	return file
}

/** A path the model may write: relative, inside the repository, and not git's own. */
const isSafePath = (file: string) =>
	file.length > 0 && file.length <= 400 && !file.startsWith("/") && !file.includes("\\") && !file.includes("\0")
	&& file.split("/").every((part) => part !== "" && part !== "." && part !== "..") && !/(^|\/)\.git(\/|$)/.test(file)

const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`

/**
 * The file list as the model sees it. Shallow paths first, so a huge
 * monorepo still shows its shape; whatever doesn't fit is summarised by
 * top-level folder, and the model can list a folder to see inside it.
 */
function listing(files: RepoFile[], budget = MAX_LISTING_CHARS): string {
	const line = (file: RepoFile) => `${file.path} · ${formatSize(file.size)}${file.unreadable ? ` (${file.unreadable}, can't be read)` : ""}`
	const ordered = [...files].sort((a, b) => a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path))
	const shown: string[] = []
	const left = new Map<string, number>()
	let used = 0
	for (const file of ordered) {
		const text = line(file)
		if (used + text.length + 1 <= budget) {
			shown.push(text)
			used += text.length + 1
		} else {
			const top = file.path.includes("/") ? `${file.path.split("/")[0]}/` : "(root)"
			left.set(top, (left.get(top) ?? 0) + 1)
		}
	}
	shown.sort((a, b) => a.localeCompare(b))
	if (left.size > 0) {
		shown.push("", `Not shown, for length (use <list dir="..." /> to see inside): ${[...left].map(([dir, count]) => `${dir} ${count} files`).join(", ")}`)
	}
	return shown.join("\n")
}

// ── Prompts ─────────────────────────────────────────────────────────────────

const EXPLORE_RULES = `You are preparing a code change to a GitHub repository, to be opened as a pull request. You cannot run anything or see anything you don't ask for: you get the repository's file list, the files read so far, and the change to make.

Reply with what you need next, using only these tags, and nothing else (no prose, no markdown):
<read path="exact/path/from/the/list" />   the full text of a file; at most ${READS_PER_ROUND} per reply
<search query="useAuth" />                  where some text appears in the code (GitHub code search: words or identifiers, no regular expressions); at most ${MAX_SEARCHES} for the whole job
<list dir="some/folder" />                  every file under a folder the list summarised
<find name="part-of-a-file-name" />         files whose path contains this text
<ready />                                   you have read enough to make the change
<cannot reason="why" />                     the change can't be made in this repository

Read every file you will change, plus the ones that show how this project does things: what they import, a sibling of a file you'll add, the router or registry new code must be added to, the manifest (package.json, pyproject.toml, go.mod, ...) when dependencies matter. Search when you don't know where something lives. Don't read files the change doesn't touch. A file you haven't read can't be changed, only added. Use exact paths from the list.`

const EDIT_RULES = `You are changing someone's GitHub repository through a pull request. You get its file list, the full text of the files that matter, and the change to make. Make that change completely and correctly, and leave everything else as it is. Nobody builds or runs this before it is reviewed, so it has to be right as written.

OUTPUT, in this order and nothing else (no prose outside the tags, no markdown fences around them):
<pr title="Short imperative summary, under 72 characters">
What changed and why, for the reviewer, as a few Markdown bullets. Mention anything they should check or run.
</pr>
<file path="path/in/the/repository">
...the whole file...
</file>
<delete path="path/of/a/file/to/remove" />

RULES:
- Change only files whose full text you were shown, or add new ones. Never return a file you did not change. Never return part of a file, a diff, "..." or "rest unchanged": a returned file replaces the old one entirely, so anything you leave out is deleted.
- Follow the project's own conventions exactly: language, framework, file layout, naming, formatting (indentation, quotes, semicolons), import style, and how the files you read already do similar things.
- Keep the change focused: no unrelated refactors, renames, reformatting or comment churn.
- Add a dependency only if the change truly needs one, and then add it to the manifest too. Never write lockfiles.
- Add or update tests and docs where the project clearly keeps them for the code you change.
- Real, working code: no secrets, credentials, TODO placeholders or lorem ipsum.
- If the request is ambiguous, make the most reasonable reading and say so in the description.`

// ── Reading ─────────────────────────────────────────────────────────────────

interface Repository {
	full_name: string
	html_url: string
	default_branch: string
	archived: boolean
	private: boolean
	permissions?: { push?: boolean }
}

interface Snapshot {
	repo: Repository
	/** "owner/name" the files are read from: the repository, or a fork holding the PR's branch. */
	readFrom: string
	branch: string
	baseSha: string
	baseTree: string
	files: Map<string, RepoFile>
	truncated: boolean
}

async function getRepo(github: GitHubClient, fullName: string): Promise<Repository> {
	try {
		return await github.get<Repository>(`/repos/${fullName}`)
	} catch (error) {
		if (error instanceof GitHubError && error.status === 404) throw new Error(`GitHub says you can't see ${fullName}`)
		throw error
	}
}

/**
 * The branch a job changes and its file list: the base branch for a new pull
 * request, or an open pull request's own branch (wherever it lives) for a
 * follow-up.
 */
async function readRepository(github: GitHubClient, repo: Repository, target: { branch?: string; head?: string; number?: number }): Promise<Snapshot> {
	const readFrom = target.head ?? repo.full_name
	const branchName = target.branch ?? repo.default_branch
	jobLog(`Reading the repository ${repo.full_name} on GitHub${target.number ? ` (the branch of pull request #${target.number})` : ""}…`)
	if (repo.archived) throw new Error(`${repo.full_name} is archived, so it can't take changes`)

	let branch: { commit: { sha: string; commit: { tree: { sha: string } } } }
	try {
		branch = await github.get(`/repos/${readFrom}/branches/${encodeURIComponent(branchName)}`)
	} catch (error) {
		if (error instanceof GitHubError && (error.status === 404 || error.status === 409)) {
			if (target.number) throw new Error(`The branch of pull request #${target.number} is gone (merged or deleted?), so nothing can be added to it`)
			if (target.branch) throw new Error(`There's no branch "${branchName}" in ${repo.full_name}`)
			throw new Error(`${repo.full_name} has no commits yet, so there's nothing to change`)
		}
		throw error
	}
	const baseSha = branch.commit.sha
	const baseTree = branch.commit.commit.tree.sha

	const tree = await github.get<{ tree: TreeEntry[]; truncated: boolean }>(`/repos/${readFrom}/git/trees/${baseTree}?recursive=1`)
	const files = new Map<string, RepoFile>()
	for (const entry of tree.tree) {
		const file = classify(entry)
		if (file) files.set(file.path, file)
	}
	if (files.size === 0) throw new Error(`${repo.full_name} has no files on ${branchName}`)
	jobLog(`Found ${files.size} files on ${branchName}${tree.truncated ? " (GitHub cut the list short: a very large repository)" : ""}. Nothing is cloned; only the files the AI asks for are downloaded`)
	return { repo, readFrom, branch: branchName, baseSha, baseTree, files, truncated: tree.truncated }
}

interface Issue {
	number: number
	title: string
	/** The request the model works from. */
	request: string
}

/** An issue's title, text and latest comments, as the request to work from. */
async function readIssue(github: GitHubClient, repo: string, number: number, extra: string): Promise<Issue> {
	let issue: { title: string; body: string | null; state: string; pull_request?: unknown }
	try {
		issue = await github.get(`/repos/${repo}/issues/${number}`)
	} catch (error) {
		if (error instanceof GitHubError && (error.status === 404 || error.status === 410)) throw new Error(`There's no issue #${number} in ${repo}`)
		throw error
	}
	if (issue.pull_request) throw new Error(`#${number} in ${repo} is a pull request, not an issue`)
	jobLog(`Reading issue #${number}: ${issue.title}`)
	if (issue.state !== "open") jobLog(`  Issue #${number} is ${issue.state}; working on it anyway`, "warn")

	const comments = await github.get<Array<{ user?: { login?: string }; body?: string | null }>>(`/repos/${repo}/issues/${number}/comments?per_page=100`)
		.catch(() => [])
	const recent = comments.slice(-ISSUE_COMMENTS)
		.filter((comment) => comment.body?.trim())
		.map((comment) => `- ${comment.user?.login ?? "someone"}: ${comment.body!.trim().slice(0, ISSUE_COMMENT_CHARS)}`)
	const body = (issue.body ?? "").trim().slice(0, ISSUE_BODY_CHARS)
	return {
		number,
		title: issue.title,
		request: [
			`Resolve issue #${number} in this repository: "${issue.title}"`,
			"",
			body || "(The issue has no description beyond its title.)",
			...(recent.length > 0 ? ["", "Recent comments on the issue, oldest first:", ...recent] : []),
			...(extra ? ["", `What the user asked for on top: ${extra}`] : [])
		].join("\n")
	}
}

interface ReadFile {
	path: string
	/** As the model sees it: LF line endings. */
	content: string
	crlf: boolean
	finalNewline: boolean
}

const decode = (base64: string): string | null => {
	const bytes = Buffer.from(base64, "base64")
	// A NUL byte near the start is a binary file the extension didn't give away.
	if (bytes.subarray(0, 8_000).includes(0)) return null
	return bytes.toString("utf-8")
}

/** Downloads files the model asked for, within the read budget, noting why any request came to nothing. */
async function readFiles(github: GitHubClient, snapshot: Snapshot, wanted: string[], read: Map<string, ReadFile>, notes: string[]): Promise<void> {
	let chars = [...read.values()].reduce((sum, file) => sum + file.content.length, 0)
	const fetchable: RepoFile[] = []
	for (const raw of wanted) {
		const path = raw.trim().replace(/^\.?\//, "")
		if (read.has(path) || fetchable.some((file) => file.path === path)) continue
		const file = snapshot.files.get(path)
		if (!file) { notes.push(`${path}: not in the repository (use an exact path from the list)`); continue }
		if (file.unreadable) { notes.push(`${path}: ${file.unreadable}, can't be read`); continue }
		if (read.size + fetchable.length >= MAX_READ_FILES) { notes.push(`${path}: not read, the limit of ${MAX_READ_FILES} files is reached`); continue }
		fetchable.push(file)
	}

	for (let index = 0; index < fetchable.length; index += BLOB_BATCH_SIZE) {
		const batch = fetchable.slice(index, index + BLOB_BATCH_SIZE)
		const blobs = await Promise.all(batch.map((file) =>
			github.get<{ content: string; encoding: string }>(`/repos/${snapshot.readFrom}/git/blobs/${file.sha}`)
				.then((blob) => ({ file, blob }))
		))
		for (const { file, blob } of blobs) {
			const text = blob.encoding === "base64" ? decode(blob.content) : blob.content
			if (text === null) {
				file.unreadable = "binary"
				notes.push(`${file.path}: binary, can't be read`)
				continue
			}
			if (chars + text.length > MAX_READ_CHARS) {
				notes.push(`${file.path}: not read, the limit of ${MAX_READ_CHARS} characters is reached`)
				continue
			}
			chars += text.length
			read.set(file.path, {
				path: file.path,
				content: text.replace(/\r\n/g, "\n"),
				crlf: text.includes("\r\n"),
				finalNewline: text.length === 0 || text.endsWith("\n")
			})
		}
	}
}

/**
 * GitHub code search, scoped to this repository. It only indexes the default
 * branch (and skips most forks), so an unavailable search is reported to the
 * model as such, and it falls back on listing and reading.
 */
async function searchCode(github: GitHubClient, snapshot: Snapshot, query: string): Promise<string> {
	const terms = query.replace(/\b(repo|org|user|path|language|extension|filename):\S+/gi, "").replace(/\s+/g, " ").trim().slice(0, 200)
	if (!terms) return `<search query="${query}">: empty search`
	try {
		const result = await github.get<{ total_count: number; items: Array<{ path: string; text_matches?: Array<{ fragment?: string }> }> }>(
			`/search/code?q=${encodeURIComponent(`${terms} repo:${snapshot.repo.full_name}`)}&per_page=${SEARCH_RESULTS}`,
			{ Accept: "application/vnd.github.text-match+json" }
		)
		if (result.items.length === 0) return `<search query="${query}">: no matches`
		const note = snapshot.branch === snapshot.repo.default_branch && snapshot.readFrom === snapshot.repo.full_name ? "" : `, searched on ${snapshot.repo.default_branch}`
		return [
			`<search query="${query}"> (${result.total_count} match${result.total_count === 1 ? "" : "es"}${note}):`,
			...result.items.map((item) => {
				const fragment = item.text_matches?.[0]?.fragment?.replace(/\s+/g, " ").trim().slice(0, 160)
				return fragment ? `${item.path}: ${fragment}` : item.path
			})
		].join("\n")
	} catch (error) {
		if (error instanceof GitHubError && (error.status === 403 || error.status === 429)) return `<search query="${query}">: search is rate-limited right now; use <find> and <list> instead`
		if (error instanceof GitHubError && error.status === 422) return `<search query="${query}">: GitHub hasn't indexed this repository for search; use <find> and <list> instead`
		return `<search query="${query}">: search failed (${(error as Error).message})`
	}
}

/** README and root manifests, read before the model asks: nearly every change needs them. */
function startingFiles(snapshot: Snapshot): string[] {
	const root = [...snapshot.files.values()].filter((file) => !file.path.includes("/") && !file.unreadable)
	const readme = root.find((file) => /^readme(\.(md|markdown|rst|txt))?$/i.test(file.path))
	const manifests = root.filter((file) => /^(package\.json|pyproject\.toml|requirements\.txt|go\.mod|Cargo\.toml|composer\.json|Gemfile|pom\.xml|build\.gradle(\.kts)?|pubspec\.yaml|deno\.json)$/.test(file.path))
	return [...(readme && readme.size <= 40_000 ? [readme.path] : []), ...manifests.map((file) => file.path)].slice(0, 5)
}

const fileBlocks = (read: Map<string, ReadFile>) =>
	[...read.values()].map((file) => `<file path="${file.path}">\n${file.content}\n</file>`).join("\n\n")

const attr = (tag: string, name: string) => new RegExp(`<${tag}\\s+${name}\\s*=\\s*["']([^"']+)["']\\s*/?>`, "g")

/** What the model is told about the pull request so far, before the change it makes now. */
const contextLines = (history: string[]) =>
	history.length === 0 ? [] : [
		`This pull request was opened for: ${history[0]}`,
		...(history.length > 1 ? [`Changes added since, oldest first:\n${history.slice(1).map((entry, index) => `${index + 1}. ${entry}`).join("\n")}`] : []),
		""
	]

/** Lets the model ask for files a round at a time, until it is ready or the budget runs out. */
async function explore(github: GitHubClient, snapshot: Snapshot, request: string, history: string[]): Promise<Map<string, ReadFile>> {
	const read = new Map<string, ReadFile>()
	const notes: string[] = []
	await readFiles(github, snapshot, startingFiles(snapshot), read, notes)

	const all = [...snapshot.files.values()]
	const fileList = listing(all)
	let answers: string[] = []
	let searches = 0
	jobLog("Asking the AI which files to read…")

	for (let round = 1; round <= EXPLORE_ROUNDS; round++) {
		const chars = [...read.values()].reduce((sum, file) => sum + file.content.length, 0)
		const brief = [
			`THE REPOSITORY: ${snapshot.repo.full_name}, branch ${snapshot.branch}${snapshot.truncated ? " (GitHub cut the file list short: the repository is very large)" : ""}`,
			"",
			"FILES:",
			fileList,
			"",
			read.size > 0 ? `FILES READ SO FAR:\n${fileBlocks(read)}` : "FILES READ SO FAR: none",
			...(answers.length > 0 ? ["", `RESULTS OF YOUR LAST REQUESTS:\n${answers.join("\n")}`] : []),
			"",
			`Read ${read.size} of at most ${MAX_READ_FILES} files (${chars} of ${MAX_READ_CHARS} characters), ${searches} of ${MAX_SEARCHES} searches used. Round ${round} of ${EXPLORE_ROUNDS}${round === EXPLORE_ROUNDS ? ": the last one, so ask for everything you still need now" : ""}.`,
			"",
			...contextLines(history),
			`THE CHANGE TO MAKE NOW: ${request}`
		].join("\n")

		const answer = await complete({ system: EXPLORE_RULES, user: brief, label: `explore (round ${round})` })
		const cannot = /<cannot\s+reason\s*=\s*["']([^"']+)["']/.exec(answer)
		if (cannot) throw new Error(`The AI couldn't make this change in ${snapshot.repo.full_name}: ${cannot[1]}`)

		const wanted = [...answer.matchAll(attr("read", "path"))].map((match) => match[1]!).slice(0, READS_PER_ROUND)
		answers = []
		for (const match of answer.matchAll(attr("search", "query"))) {
			if (searches >= MAX_SEARCHES) { answers.push(`<search query="${match[1]}">: not run, the limit of ${MAX_SEARCHES} searches is reached`); continue }
			searches++
			jobLog(`  Searching the code for "${match[1]}"`)
			answers.push(await searchCode(github, snapshot, match[1]!))
		}
		for (const match of answer.matchAll(attr("list", "dir"))) {
			const dir = `${match[1]!.replace(/^\.?\/+|\/+$/g, "")}/`
			const inside = all.filter((file) => file.path.startsWith(dir))
			answers.push(inside.length === 0 ? `<list dir="${dir}">: no files there` : `<list dir="${dir}">:\n${listing(inside.slice(0, MAX_LIST_RESULTS), 20_000)}`)
		}
		for (const match of answer.matchAll(attr("find", "name"))) {
			const needle = match[1]!.toLowerCase()
			const found = all.filter((file) => file.path.toLowerCase().includes(needle)).slice(0, MAX_LIST_RESULTS)
			answers.push(found.length === 0 ? `<find name="${match[1]}">: no matches` : `<find name="${match[1]}">:\n${found.map((file) => file.path).join("\n")}`)
		}

		notes.length = 0
		const before = read.size
		await readFiles(github, snapshot, wanted, read, notes)
		answers.push(...notes)
		if (read.size > before) jobLog(`Read ${read.size - before} file${read.size - before === 1 ? "" : "s"}: ${[...read.keys()].slice(before).join(", ")}`)

		const nothingNew = wanted.length === 0 && answers.length === 0
		if (/<ready\s*\/?>/.test(answer) || nothingNew || read.size >= MAX_READ_FILES) break
	}
	if (read.size === 0) throw new Error("The AI didn't find any files to read for this change")
	return read
}

// ── Editing ─────────────────────────────────────────────────────────────────

interface Change {
	path: string
	/** null deletes the file. */
	content: string | null
	mode: string
}

interface Edit {
	changes: Change[]
	title: string
	body: string
}

const LOADERS: Record<string, "js" | "jsx" | "ts" | "tsx"> = { js: "jsx", jsx: "jsx", mjs: "js", cjs: "js", ts: "ts", mts: "ts", cts: "ts", tsx: "tsx" }

/** A parse error in a file type the worker can check, or null. */
function parseProblem(path: string, content: string): string | null {
	const extension = path.split(".").pop()?.toLowerCase() ?? ""
	if (extension === "json") {
		try {
			JSON.parse(content)
			return null
		} catch (error) {
			return `Invalid JSON: ${(error as Error).message}`
		}
	}
	const loader = LOADERS[extension]
	if (!loader) return null
	try {
		new Bun.Transpiler({ loader }).transformSync(content)
		return null
	} catch (error) {
		const first = ((error as { errors?: unknown[] }).errors?.[0] ?? error) as { message?: string; position?: { line: number; column: number; lineText?: string } }
		const where = first.position ? ` at line ${first.position.line}, column ${first.position.column}: ${first.position.lineText?.trim() ?? ""}` : ""
		return `Syntax error: ${first.message ?? String(error)}${where}`
	}
}

function problemsIn(path: string, content: string, truncated: boolean, original: ReadFile | undefined): string[] {
	const problems: string[] = []
	if (truncated) problems.push("Your answer was cut off before </file>. Return the complete file, more concisely.")
	// Only hold the model to a check the file passed before: JSONC configs and
	// Flow-typed JavaScript don't parse here, and that isn't the model's doing.
	const problem = parseProblem(path, content)
	if (problem && (!original || parseProblem(path, original.content) === null)) problems.push(problem)
	return problems
}

/** The repository's own line endings and final newline, so the diff shows only the change. */
function restoreFormatting(content: string, original: ReadFile | undefined): string {
	let text = content.replace(/\r\n/g, "\n")
	if (!original || original.finalNewline) text = text.endsWith("\n") ? text : `${text}\n`
	else text = text.replace(/\n+$/, "")
	return original?.crlf ? text.replace(/\n/g, "\r\n") : text
}

function parseDescription(answer: string, fallback: string): { title: string; body: string } {
	const match = /<pr\s+title\s*=\s*(?:"([^"]*)"|'([^']*)')\s*>([\s\S]*?)<\/pr>/.exec(answer)
	const plain = fallback.replace(/\s+/g, " ").trim()
	const title = (match?.[1] ?? match?.[2] ?? "").replace(/\s+/g, " ").trim() || (plain.length > 68 ? `${plain.slice(0, 67)}…` : plain)
	return { title: title.slice(0, 120), body: (match?.[3] ?? "").trim().slice(0, 8_000) }
}

async function writeChange(snapshot: Snapshot, read: Map<string, ReadFile>, request: string, history: string[], addingTo?: number): Promise<Edit> {
	const brief = [
		`THE REPOSITORY: ${snapshot.repo.full_name}, branch ${snapshot.branch}`,
		...(addingTo ? [`This adds a commit to the open pull request #${addingTo}: your <pr title> becomes the commit's title, and the description is posted on the pull request as a comment.`] : []),
		"",
		"ALL FILES (for where new files go and what they import):",
		listing([...snapshot.files.values()]),
		"",
		"THE FILES YOU READ (the only existing files you may change or delete):",
		fileBlocks(read),
		"",
		...contextLines(history),
		`THE CHANGE TO MAKE NOW: ${request}`
	].join("\n")

	jobLog(`Asking the AI to write the change, with the ${read.size} files it read…`)
	let answer = await complete({ system: EDIT_RULES, user: brief, label: "change" })
	if (parseFiles(answer).length === 0 && ![...answer.matchAll(attr("delete", "path"))].length) {
		jobLog("The AI's answer had no file changes in it. Asking again", "warn")
		answer = await complete({
			system: EDIT_RULES,
			label: "change (retry)",
			user: `${brief}\n\nYour previous answer contained no <file> blocks (it began: ${JSON.stringify(answer.slice(0, 160))}). Make the change: a <pr title="..."> block, then every file you change, complete, in <file path="..."> blocks.`
		})
	}

	const changes: Change[] = []
	const skip = (path: string, why: string) => jobLog(`  Left out ${path}: ${why}`, "warn")
	for (const file of parseFiles(answer)) {
		const path = file.path
		const existing = snapshot.files.get(path)
		const original = read.get(path)
		if (!isSafePath(path)) { skip(path, "not a path inside the repository"); continue }
		if (LOCKFILE.test(path)) { skip(path, "lockfiles are left to the project's package manager"); continue }
		if (existing && !original) { skip(path, existing.unreadable ? `it's ${existing.unreadable}` : "the AI changed it without reading it first"); continue }
		if (changes.some((change) => change.path === path)) continue
		if (changes.length >= MAX_CHANGED_FILES) { skip(path, `a change here touches at most ${MAX_CHANGED_FILES} files`); continue }

		let { content } = file
		let problems = problemsIn(path, content, file.truncated, original)
		for (let attempt = 1; problems.length > 0 && attempt <= FILE_REPAIRS; attempt++) {
			jobLog(`  ${path}: ${problems[0]} Asking the AI to fix this one file (${attempt}/${FILE_REPAIRS})`, "warn")
			const fixed = await repairFile(EDIT_RULES, brief, path, content, problems.join("\n"))
			if (fixed) content = fixed
			problems = problemsIn(path, content, !fixed && file.truncated, original)
		}
		// A broken file in a pull request is worse than a smaller pull request.
		if (problems.length > 0) { skip(path, `it still had a problem (${problems[0]})`); continue }

		const formatted = restoreFormatting(content, original)
		if (original && restoreFormatting(original.content, original) === formatted) continue
		changes.push({ path, content: formatted, mode: existing?.mode === "100755" ? "100755" : "100644" })
	}

	for (const match of answer.matchAll(attr("delete", "path"))) {
		const path = match[1]!.trim().replace(/^\.?\//, "")
		const existing = snapshot.files.get(path)
		if (!existing || !read.has(path) || changes.some((change) => change.path === path)) continue
		changes.push({ path, content: null, mode: existing.mode })
	}

	if (changes.length === 0) throw new Error("The AI didn't change any files for this request. Try describing the change in more detail")
	const description = parseDescription(answer, request)
	jobLog(`Prepared ${changes.length} file change${changes.length === 1 ? "" : "s"}: ${changes.map((change) => change.content === null ? `${change.path} (deleted)` : change.path).join(", ")}`, "success")
	return { changes, ...description }
}

// ── Writing ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Where a new pull request's branch goes: the repository itself when the
 * user can push to it, otherwise their fork, made (or found) by GitHub on its
 * side and brought up to the commit the change was written against.
 */
async function branchHome(github: GitHubClient, snapshot: Snapshot): Promise<{ fullName: string; owner: string; fork: boolean }> {
	if (snapshot.repo.permissions?.push) return { fullName: snapshot.repo.full_name, owner: snapshot.repo.full_name.split("/")[0]!, fork: false }

	jobLog(`Forking ${snapshot.repo.full_name} to your account (you can't push to it directly)…`)
	let fork: { full_name: string; owner: { login: string }; default_branch: string }
	try {
		// A base other than the default branch needs every branch in the fork.
		fork = await github.post(`/repos/${snapshot.repo.full_name}/forks`, { default_branch_only: snapshot.branch === snapshot.repo.default_branch })
	} catch (error) {
		if (error instanceof GitHubError && (error.status === 403 || error.status === 422)) {
			throw new Error(`You can't push to ${snapshot.repo.full_name} and GitHub won't let you fork it (${error.message})`)
		}
		throw error
	}

	// A fresh fork takes a moment to fill; an old one may be behind and need syncing first.
	let synced = false
	for (let attempt = 1; attempt <= FORK_READY_ATTEMPTS; attempt++) {
		try {
			await github.get(`/repos/${fork.full_name}/git/commits/${snapshot.baseSha}`)
			return { fullName: fork.full_name, owner: fork.owner.login, fork: true }
		} catch (error) {
			if (!(error instanceof GitHubError) || ![404, 409, 422].includes(error.status)) throw error
		}
		if (!synced && attempt >= 2) {
			synced = true
			await github.post(`/repos/${fork.full_name}/merge-upstream`, { branch: snapshot.branch }).catch(() => { })
		}
		await sleep(Math.min(1_000 * attempt, 5_000))
	}
	throw new Error(`Your fork ${fork.full_name} isn't up to date with ${snapshot.repo.full_name}. Sync it on GitHub ("Sync fork") and try again`)
}

/** Blobs, a tree on top of the snapshot's and a commit, in the repository holding the branch. Returns the commit. */
async function commitChange(github: GitHubClient, home: string, snapshot: Snapshot, changes: Change[], message: string): Promise<string> {
	const tree: Array<{ path: string; mode: string; type: "blob"; sha: string | null }> = []
	for (let index = 0; index < changes.length; index += BLOB_BATCH_SIZE) {
		const batch = changes.slice(index, index + BLOB_BATCH_SIZE)
		tree.push(...await Promise.all(batch.map(async (file) => {
			if (file.content === null) return { path: file.path, mode: file.mode, type: "blob" as const, sha: null }
			const blob = await github.post<{ sha: string }>(`/repos/${home}/git/blobs`, {
				content: Buffer.from(file.content, "utf-8").toString("base64"),
				encoding: "base64"
			})
			return { path: file.path, mode: file.mode, type: "blob" as const, sha: blob.sha }
		})))
	}
	const created = await github.post<{ sha: string }>(`/repos/${home}/git/trees`, { base_tree: snapshot.baseTree, tree })
	const commit = await github.post<{ sha: string }>(`/repos/${home}/git/commits`, { message, tree: created.sha, parents: [snapshot.baseSha] })
	return commit.sha
}

const branchSlug = (title: string) =>
	title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "") || "change"

const quote = (text: string) => text.trim().split("\n").map((line) => `> ${line}`).join("\n")
const clip = (text: string, length: number) => text.length > length ? `${text.slice(0, length)}…` : text

function prBody(description: string, asked: string, issue: Issue | undefined): string {
	return [
		description || "_No description was written for this change._",
		...(issue ? ["", `Closes #${issue.number}`] : []),
		"",
		"---",
		`<sub>Opened with [rwaft](${SITE_URL}) from this request:</sub>`,
		"",
		quote(clip(asked, 2_000)),
		"",
		"<sub>rwaft wrote this change through GitHub's API without cloning the repository, so it hasn't been built or tested. Review it, and let CI run before merging.</sub>"
	].join("\n")
}

/** A new branch and pull request for the change. */
async function publishNew(github: GitHubClient, snapshot: Snapshot, job: PullRequestJob, edit: Edit, issue: Issue | undefined, request: string): Promise<PullRequestResult> {
	const home = await branchHome(github, snapshot)
	const base = snapshot.branch
	let branch = `rwaft/${branchSlug(edit.title)}-${job.jobId}`
	jobLog(`Committing ${edit.changes.length} file${edit.changes.length === 1 ? "" : "s"} to a new branch, ${branch}…`)
	const asked = job.prompt || (issue ? `Issue #${issue.number}: ${issue.title}` : request)
	const sha = await commitChange(github, home.fullName, snapshot, edit.changes,
		`${edit.title}\n\n${issue ? `Fixes #${issue.number}\n\n` : ""}Requested in rwaft: ${clip(asked.replace(/\s+/g, " "), 500)}`)

	for (let attempt = 1; ; attempt++) {
		try {
			await github.post(`/repos/${home.fullName}/git/refs`, { ref: `refs/heads/${branch}`, sha })
			break
		} catch (error) {
			if (!(error instanceof GitHubError) || error.status !== 422 || attempt >= 5) throw error
			branch = `rwaft/${branchSlug(edit.title)}-${job.jobId}-${attempt + 1}`
		}
	}

	jobLog("Opening the pull request…")
	const head = home.fork ? `${home.owner}:${branch}` : branch
	const open = (draft: boolean) => github.post<{ html_url: string; number: number }>(`/repos/${snapshot.repo.full_name}/pulls`, {
		title: edit.title,
		body: prBody(edit.body, asked, issue),
		head,
		base,
		draft,
		...(home.fork ? { maintainer_can_modify: true } : {})
	})
	try {
		let pull: { html_url: string; number: number }
		try {
			pull = await open(Boolean(job.draft))
		} catch (error) {
			// Draft pull requests need a paid plan on private repositories.
			if (!job.draft || !(error instanceof GitHubError) || error.status !== 422 || !/draft/i.test(error.message + error.detail)) throw error
			jobLog("  GitHub doesn't allow draft pull requests on this repository, so it's opened ready for review", "warn")
			pull = await open(false)
		}
		return {
			repo: snapshot.repo.full_name,
			number: pull.number,
			url: pull.html_url,
			title: edit.title,
			head: home.fullName,
			branch,
			base,
			fork: home.fork,
			history: [asked],
			files: edit.changes.map((file) => file.path),
			sha
		}
	} catch (error) {
		// The commit is already on the branch; say where, so the work isn't lost.
		const compare = `${snapshot.repo.html_url}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`
		throw new Error(`The change is on the branch ${branch}, but GitHub wouldn't open the pull request (${(error as Error).message}). Open it yourself: ${compare}`)
	}
}

/** One more commit on an open pull request's branch, and a comment saying what it was for. */
async function publishUpdate(github: GitHubClient, snapshot: Snapshot, pr: PullRequestRef, update: PullRequestUpdate, edit: Edit): Promise<PullRequestResult> {
	const message = update.kind === "fix"
		? `${edit.title || "Fix failing checks"}\n\nFixes the failing check${update.checks?.length === 1 ? "" : "s"} ${(update.checks ?? []).join(", ")}, found by rwaft.`
		: `${edit.title}\n\nRequested in rwaft: ${clip(update.request.replace(/\s+/g, " "), 500)}`
	jobLog(`Committing ${edit.changes.length} file${edit.changes.length === 1 ? "" : "s"} to the pull request's branch, ${pr.branch}…`)
	const sha = await commitChange(github, pr.head, snapshot, edit.changes, message)
	try {
		// Not forced: if someone pushed to the branch meanwhile, their work wins and this stops.
		await github.patch(`/repos/${pr.head}/git/refs/heads/${pr.branch}`, { sha, force: false })
	} catch (error) {
		if (error instanceof GitHubError && error.status === 422) throw new Error(`Someone pushed to ${pr.branch} while rwaft was working, so the change wasn't added. Try again`)
		throw error
	}

	const files = edit.changes.map((file) => `\`${file.path}\`${file.content === null ? " (deleted)" : ""}`).join(", ")
	const comment = update.kind === "fix"
		? `rwaft pushed a fix for the failing check${update.checks?.length === 1 ? "" : "s"} ${(update.checks ?? []).map((name) => `\`${name}\``).join(", ")}: ${files}.\n\n${edit.body}`
		: `rwaft added a commit for this request:\n\n${quote(clip(update.request, 2_000))}\n\nChanged ${files}.\n\n${edit.body}`
	await github.post(`/repos/${pr.repo}/issues/${pr.number}/comments`, { body: comment.trim() })
		.catch((error) => jobLog(`  Couldn't comment on the pull request (${(error as Error).message})`, "warn"))

	return {
		...pr,
		history: update.kind === "change" ? [...pr.history, update.request] : pr.history,
		files: edit.changes.map((file) => file.path),
		sha
	}
}

// ── Jobs ────────────────────────────────────────────────────────────────────

/** A new pull request: read, explore, edit, publish. Throws in plain words; the pump fails and refunds the job. */
export async function openPullRequest(github: GitHubClient, job: PullRequestJob): Promise<PullRequestResult> {
	const repo = await getRepo(github, `${job.owner}/${job.name}`)
	const issue = job.issue ? await readIssue(github, repo.full_name, job.issue, job.prompt) : undefined
	const request = issue?.request ?? job.prompt
	const snapshot = await readRepository(github, repo, { branch: job.base })
	const read = await explore(github, snapshot, request, [])
	const edit = await writeChange(snapshot, read, request, [])
	return publishNew(github, snapshot, job, edit, issue, request)
}

/** A follow-up change, or a fix for failing checks, added to an open pull request. */
export async function updatePullRequest(github: GitHubClient, pr: PullRequestRef, update: PullRequestUpdate): Promise<PullRequestResult> {
	const pull = await github.get<{ state: string; merged?: boolean }>(`/repos/${pr.repo}/pulls/${pr.number}`)
	if (pull.state !== "open") throw new Error(`Pull request #${pr.number} is ${pull.merged ? "merged" : "closed"}, so nothing can be added to it. Start a new one`)
	const repo = await getRepo(github, pr.repo)
	const snapshot = await readRepository(github, repo, { branch: pr.branch, head: pr.head, number: pr.number })
	const read = await explore(github, snapshot, update.request, pr.history)
	const edit = await writeChange(snapshot, read, update.request, pr.history, pr.number)
	return publishUpdate(github, snapshot, pr, update, edit)
}
