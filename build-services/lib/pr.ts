import { complete } from "./ai.ts"
import { jobLog } from "./joblog.ts"
import { parseFiles, repairFile } from "./pages.ts"
import { GitHubClient, GitHubError } from "./github.ts"

/**
 * "Open a pull request": an AI change to a GitHub repository, without a clone.
 *
 * 1. Read: the repository, its default branch, and the whole file list in one
 *    recursive tree call (paths and sizes, no contents).
 * 2. Explore: the model asks for the files it needs, a round at a time, and
 *    only those are downloaded. Everything stays in memory.
 * 3. Edit: one call with those files and the request; the model answers with
 *    whole files in the <file path="..."> tags the rest of rwaft uses. Each
 *    is parsed before it goes anywhere, and a broken one goes back alone with
 *    its exact error.
 * 4. Write: blobs for the changed files, a tree on top of the current one, a
 *    commit, a new branch (on the user's fork when they can't push), and the
 *    pull request, all from the user's account.
 *
 * Nothing is built or run: that would need the checkout this avoids. The
 * description says so, for the reviewer.
 */

const MAX_READ_FILES = Number(process.env.PR_MAX_READ_FILES || 40)
const MAX_READ_CHARS = Number(process.env.PR_MAX_READ_CHARS || 300_000)
const MAX_FILE_BYTES = Number(process.env.PR_MAX_FILE_BYTES || 150_000)
const EXPLORE_ROUNDS = Math.max(1, Number(process.env.PR_EXPLORE_ROUNDS || 3))
const READS_PER_ROUND = 20
/** Characters of file list in a brief; a bigger tree is summarised by folder. */
const MAX_LISTING_CHARS = Number(process.env.PR_MAX_LISTING_CHARS || 60_000)
const MAX_LIST_RESULTS = 400
const MAX_CHANGED_FILES = 30
const FILE_REPAIRS = Math.max(0, Number(process.env.FILE_REPAIRS || 2))
const BLOB_BATCH_SIZE = 6
const FORK_READY_ATTEMPTS = 20
const SITE_URL = (process.env.PR_FOOTER_URL || "https://rwaft.live").replace(/\/+$/, "")

export interface PullRequestJob {
	owner: string
	name: string
	prompt: string
	jobId: string
}

export interface PullRequestResult {
	url: string
	number: number
	title: string
	files: string[]
	branch: string
	base: string
	/** Opened from the user's fork, because they can't push to the repository. */
	fork: boolean
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

const EXPLORE_RULES = `You are preparing a code change to a GitHub repository, to be opened as a pull request. You cannot run anything or see anything you don't ask for: you get the repository's file list, the files read so far, and the change the user wants.

Reply with what you need next, using only these tags, and nothing else (no prose, no markdown):
<read path="exact/path/from/the/list" />   the full text of a file; at most ${READS_PER_ROUND} per reply
<list dir="some/folder" />                  every file under a folder the list summarised
<find name="part-of-a-file-name" />         files whose path contains this text
<ready />                                   you have read enough to make the change
<cannot reason="why" />                     the change can't be made in this repository

Read every file you will change, plus the ones that show how this project does things: what they import, a sibling of a file you'll add, the router or registry new code must be added to, the manifest (package.json, pyproject.toml, go.mod, ...) when dependencies matter. Don't read files the change doesn't touch. A file you haven't read can't be changed, only added. Use exact paths from the list.`

const EDIT_RULES = `You are opening a pull request on someone's GitHub repository. You get its file list, the full text of the files that matter, and the change the user wants. Make that change completely and correctly, and leave everything else as it is. Nobody builds or runs this before it is reviewed, so it has to be right as written.

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
	baseSha: string
	baseTree: string
	files: Map<string, RepoFile>
	truncated: boolean
}

async function readRepository(github: GitHubClient, job: PullRequestJob): Promise<Snapshot> {
	jobLog(`Reading the repository ${job.owner}/${job.name} on GitHub…`)
	const repo = await github.get<Repository>(`/repos/${job.owner}/${job.name}`).catch((error) => {
		if (error instanceof GitHubError && error.status === 404) throw new Error(`GitHub says you can't see ${job.owner}/${job.name}`)
		throw error
	})
	if (repo.archived) throw new Error(`${repo.full_name} is archived, so it can't take pull requests`)

	let branch: { commit: { sha: string; commit: { tree: { sha: string } } } }
	try {
		branch = await github.get(`/repos/${repo.full_name}/branches/${encodeURIComponent(repo.default_branch)}`)
	} catch (error) {
		if (error instanceof GitHubError && (error.status === 404 || error.status === 409)) throw new Error(`${repo.full_name} has no commits yet, so there's nothing to change`)
		throw error
	}
	const baseSha = branch.commit.sha
	const baseTree = branch.commit.commit.tree.sha

	const tree = await github.get<{ tree: TreeEntry[]; truncated: boolean }>(`/repos/${repo.full_name}/git/trees/${baseTree}?recursive=1`)
	const files = new Map<string, RepoFile>()
	for (const entry of tree.tree) {
		const file = classify(entry)
		if (file) files.set(file.path, file)
	}
	if (files.size === 0) throw new Error(`${repo.full_name} has no files on ${repo.default_branch}`)
	jobLog(`Found ${files.size} files on ${repo.default_branch}${tree.truncated ? " (GitHub cut the list short: a very large repository)" : ""}. Nothing is cloned; only the files the AI asks for are downloaded`)
	return { repo, baseSha, baseTree, files, truncated: tree.truncated }
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

/** Downloads files the model asked for, within the read budget. Returns what each request came to. */
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
			github.get<{ content: string; encoding: string }>(`/repos/${snapshot.repo.full_name}/git/blobs/${file.sha}`)
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

/** Lets the model ask for files a round at a time, until it is ready or the budget runs out. */
async function explore(github: GitHubClient, snapshot: Snapshot, job: PullRequestJob): Promise<Map<string, ReadFile>> {
	const read = new Map<string, ReadFile>()
	const notes: string[] = []
	await readFiles(github, snapshot, startingFiles(snapshot), read, notes)

	const all = [...snapshot.files.values()]
	const fileList = listing(all)
	let answers: string[] = []
	jobLog("Asking the AI which files to read…")

	for (let round = 1; round <= EXPLORE_ROUNDS; round++) {
		const chars = [...read.values()].reduce((sum, file) => sum + file.content.length, 0)
		const brief = [
			`THE REPOSITORY: ${snapshot.repo.full_name}, branch ${snapshot.repo.default_branch}${snapshot.truncated ? " (GitHub cut the file list short: the repository is very large)" : ""}`,
			"",
			"FILES:",
			fileList,
			"",
			read.size > 0 ? `FILES READ SO FAR:\n${fileBlocks(read)}` : "FILES READ SO FAR: none",
			...(answers.length > 0 ? ["", `RESULTS OF YOUR LAST REQUESTS:\n${answers.join("\n")}`] : []),
			"",
			`Read ${read.size} of at most ${MAX_READ_FILES} files (${chars} of ${MAX_READ_CHARS} characters). Round ${round} of ${EXPLORE_ROUNDS}${round === EXPLORE_ROUNDS ? ": the last one, so ask for everything you still need now" : ""}.`,
			"",
			`THE CHANGE TO MAKE: ${job.prompt}`
		].join("\n")

		const answer = await complete({ system: EXPLORE_RULES, user: brief, label: `explore (round ${round})` })
		const cannot = /<cannot\s+reason\s*=\s*["']([^"']+)["']/.exec(answer)
		if (cannot) throw new Error(`The AI couldn't make this change in ${snapshot.repo.full_name}: ${cannot[1]}`)

		const wanted = [...answer.matchAll(attr("read", "path"))].map((match) => match[1]!).slice(0, READS_PER_ROUND)
		answers = []
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

function parseDescription(answer: string, prompt: string): { title: string; body: string } {
	const match = /<pr\s+title\s*=\s*(?:"([^"]*)"|'([^']*)')\s*>([\s\S]*?)<\/pr>/.exec(answer)
	const fallback = prompt.replace(/\s+/g, " ").trim()
	const title = (match?.[1] ?? match?.[2] ?? "").replace(/\s+/g, " ").trim() || (fallback.length > 68 ? `${fallback.slice(0, 67)}…` : fallback)
	return { title: title.slice(0, 120), body: (match?.[3] ?? "").trim().slice(0, 8_000) }
}

async function writeChange(snapshot: Snapshot, read: Map<string, ReadFile>, job: PullRequestJob) {
	const brief = [
		`THE REPOSITORY: ${snapshot.repo.full_name}, branch ${snapshot.repo.default_branch}`,
		"",
		"ALL FILES (for where new files go and what they import):",
		listing([...snapshot.files.values()]),
		"",
		"THE FILES YOU READ (the only existing files you may change or delete):",
		fileBlocks(read),
		"",
		`THE CHANGE TO MAKE NOW: ${job.prompt}`
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
		if (changes.length >= MAX_CHANGED_FILES) { skip(path, `a pull request here changes at most ${MAX_CHANGED_FILES} files`); continue }

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
	const description = parseDescription(answer, job.prompt)
	jobLog(`Prepared ${changes.length} file change${changes.length === 1 ? "" : "s"}: ${changes.map((change) => change.content === null ? `${change.path} (deleted)` : change.path).join(", ")}`, "success")
	return { changes, ...description }
}

// ── Writing ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Where the branch goes: the repository itself when the user can push to it,
 * otherwise their fork, made (or found) by GitHub on its side and brought up
 * to the commit the change was written against.
 */
async function branchHome(github: GitHubClient, snapshot: Snapshot): Promise<{ fullName: string; owner: string; fork: boolean }> {
	if (snapshot.repo.permissions?.push) return { fullName: snapshot.repo.full_name, owner: snapshot.repo.full_name.split("/")[0]!, fork: false }

	jobLog(`Forking ${snapshot.repo.full_name} to your account (you can't push to it directly)…`)
	let fork: { full_name: string; owner: { login: string }; default_branch: string }
	try {
		fork = await github.post(`/repos/${snapshot.repo.full_name}/forks`, { default_branch_only: true })
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
			await github.post(`/repos/${fork.full_name}/merge-upstream`, { branch: fork.default_branch }).catch(() => { })
		}
		await sleep(Math.min(1_000 * attempt, 5_000))
	}
	throw new Error(`Your fork ${fork.full_name} isn't up to date with ${snapshot.repo.full_name}. Sync it on GitHub ("Sync fork") and try again`)
}

const branchSlug = (title: string) =>
	title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "") || "change"

const quote = (text: string) => text.trim().split("\n").map((line) => `> ${line}`).join("\n")

function prBody(description: string, prompt: string): string {
	const asked = prompt.length > 2_000 ? `${prompt.slice(0, 2_000)}…` : prompt
	return [
		description || "_No description was written for this change._",
		"",
		"---",
		`<sub>Opened with [rwaft](${SITE_URL}) from this request:</sub>`,
		"",
		quote(asked),
		"",
		"<sub>rwaft wrote this change through GitHub's API without cloning the repository, so it hasn't been built or tested. Review it, and let CI run before merging.</sub>"
	].join("\n")
}

async function publish(github: GitHubClient, snapshot: Snapshot, job: PullRequestJob, change: { changes: Change[]; title: string; body: string }): Promise<PullRequestResult> {
	const home = await branchHome(github, snapshot)
	const base = snapshot.repo.default_branch
	let branch = `rwaft/${branchSlug(change.title)}-${job.jobId}`
	jobLog(`Committing ${change.changes.length} file${change.changes.length === 1 ? "" : "s"} to a new branch, ${branch}…`)

	const tree: Array<{ path: string; mode: string; type: "blob"; sha: string | null }> = []
	for (let index = 0; index < change.changes.length; index += BLOB_BATCH_SIZE) {
		const batch = change.changes.slice(index, index + BLOB_BATCH_SIZE)
		tree.push(...await Promise.all(batch.map(async (file) => {
			if (file.content === null) return { path: file.path, mode: file.mode, type: "blob" as const, sha: null }
			const blob = await github.post<{ sha: string }>(`/repos/${home.fullName}/git/blobs`, {
				content: Buffer.from(file.content, "utf-8").toString("base64"),
				encoding: "base64"
			})
			return { path: file.path, mode: file.mode, type: "blob" as const, sha: blob.sha }
		})))
	}
	const created = await github.post<{ sha: string }>(`/repos/${home.fullName}/git/trees`, { base_tree: snapshot.baseTree, tree })
	const commit = await github.post<{ sha: string }>(`/repos/${home.fullName}/git/commits`, {
		message: `${change.title}\n\nRequested in rwaft: ${job.prompt.replace(/\s+/g, " ").slice(0, 500)}`,
		tree: created.sha,
		parents: [snapshot.baseSha]
	})

	for (let attempt = 1; ; attempt++) {
		try {
			await github.post(`/repos/${home.fullName}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha })
			break
		} catch (error) {
			if (!(error instanceof GitHubError) || error.status !== 422 || attempt >= 5) throw error
			branch = `rwaft/${branchSlug(change.title)}-${job.jobId}-${attempt + 1}`
		}
	}

	jobLog("Opening the pull request…")
	const head = home.fork ? `${home.owner}:${branch}` : branch
	try {
		const pull = await github.post<{ html_url: string; number: number }>(`/repos/${snapshot.repo.full_name}/pulls`, {
			title: change.title,
			body: prBody(change.body, job.prompt),
			head,
			base,
			draft: false,
			...(home.fork ? { maintainer_can_modify: true } : {})
		})
		return {
			url: pull.html_url,
			number: pull.number,
			title: change.title,
			files: change.changes.map((file) => file.path),
			branch: `${home.fullName}:${branch}`,
			base,
			fork: home.fork
		}
	} catch (error) {
		// The commit is already on the branch; say where, so the work isn't lost.
		const compare = `${snapshot.repo.html_url}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`
		throw new Error(`The change is on the branch ${branch}, but GitHub wouldn't open the pull request (${(error as Error).message}). Open it yourself: ${compare}`)
	}
}

/** The whole job: read, explore, edit, publish. Throws in plain words; the pump fails and refunds the job. */
export async function openPullRequest(github: GitHubClient, job: PullRequestJob): Promise<PullRequestResult> {
	const snapshot = await readRepository(github, job)
	const read = await explore(github, snapshot, job)
	const change = await writeChange(snapshot, read, job)
	return publish(github, snapshot, job, change)
}
