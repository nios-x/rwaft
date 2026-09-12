import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, writeFile, rm } from "node:fs/promises"
import path from "node:path"
import { jobLog, jobOutput } from "./joblog.ts"

/**
 * Child-process runner.
 *
 * Two production bugs lived in the previous version of this code and both are
 * fixed here:
 *
 * 1. A single 60s COMMAND_TIMEOUT_MS was applied to `npm install`. Real installs
 *    of a React app routinely take several minutes on a small container, so npm
 *    was being killed mid-download. That is exactly what produced the
 *    "tarball ... seems to be corrupted" / "Cannot cd into node_modules/..."
 *    cascade: a half-extracted tree left behind by a killed installer.
 *
 * 2. `spawn(cmd, { shell: true })` + `child.kill()` signals the *shell*, not npm.
 *    The orphaned npm kept writing into node_modules while the retry started,
 *    corrupting the tree a second time. We now run detached and signal the whole
 *    process group.
 */

/** Short leash for commands the AI asks us to run. */
export const COMMAND_TIMEOUT_MS = Number(process.env.COMMAND_TIMEOUT_MS || 120_000)
/** Dependency installation is slow and network-bound — give it real room. */
export const INSTALL_TIMEOUT_MS = Number(process.env.INSTALL_TIMEOUT_MS || 10 * 60_000)
/** Bundling is CPU-bound and also slow on small instances. */
export const BUILD_TIMEOUT_MS = Number(process.env.BUILD_TIMEOUT_MS || 10 * 60_000)

/**
 * npm configuration forced onto every child process we spawn.
 *
 * The worker containers set NODE_ENV=production, and npm's `omit` config
 * defaults to "dev" whenever that is set — so a plain `npm install` installs
 * ONLY `dependencies` and silently skips every devDependency. That is fatal
 * for the projects we build: vite, @vitejs/plugin-react and typescript all
 * live in devDependencies, so the tree comes back without a bundler and every
 * build fails to resolve its own config imports. Worse, npm still reports
 * "added N packages" / "up to date", so nothing in the log says dev deps were
 * dropped.
 *
 * Passing --include=dev on our own commands fixes our own commands. Setting it
 * in the environment also covers the ones we do not write: `npm install` typed
 * by the AI into run_command, and any npm the build script shells out to.
 * NODE_ENV itself is deliberately left alone — Vite reads it during the build.
 */
export const NPM_ENV: Record<string, string> = {
	npm_config_include: "dev",
	npm_config_omit: ""
}

/**
 * Heap ceiling for the children we spawn (npm, and the bundler it runs).
 *
 * V8 sizes its old space from the *host's* RAM, not from the container's cgroup
 * limit. On a small instance that means Node happily grows past the limit and
 * is killed by the platform rather than collecting garbage — which is what a
 * "service exceeded its memory limit" restart actually is. Naming a ceiling
 * that fits the instance converts an OOM kill into a slightly slower build.
 *
 * Size it under the container limit, not at it: npm, the bundler's native
 * parts and this worker itself all need room outside the JS heap.
 */
const BUILD_HEAP_MB = Number(process.env.BUILD_HEAP_MB || 384)

/** Adds the heap ceiling without discarding NODE_OPTIONS the caller set. */
function withHeapCap(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const existing = env.NODE_OPTIONS ?? ""
	if (existing.includes("--max-old-space-size")) return env
	return { ...env, NODE_OPTIONS: `${existing} --max-old-space-size=${BUILD_HEAP_MB}`.trim() }
}

const IS_WINDOWS = process.platform === "win32"
/** Grace period between SIGTERM and SIGKILL. */
const KILL_GRACE_MS = 5_000
/** Cap retained output so a chatty build cannot exhaust worker memory. */
const OUTPUT_LIMIT = 12_000

const ANSI_PATTERN = new RegExp(String.raw`[\u001B\u009B][[\]()#;?]*(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><]`, "g")

/**
 * Vite's error frames colour every single character individually, so raw build
 * output reaches the browser log and the AI repair prompt as a wall of escape
 * codes with the actual message shredded between them. Stripping them keeps the
 * failure text readable for both.
 */
function stripAnsi(text: string): string {
	return text.replace(ANSI_PATTERN, "")
}

export interface RunOptions {
	cwd: string
	env?: Record<string, string>
	timeoutMs?: number
	/** Stream output to the user's log channel. */
	stream?: boolean
	/** Include captured output in the thrown error (for the AI repair loop). */
	captureForError?: boolean
}

export interface RunResult {
	output: string
	code: number
}

/** Kills the entire process tree, not just the shell we spawned. */
function killTree(pid: number | undefined, signal: NodeJS.Signals): void {
	if (!pid) return
	try {
		if (IS_WINDOWS) {
			spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" })
			return
		}
		// Negative PID targets the process group created by `detached: true`.
		process.kill(-pid, signal)
	} catch { /* already dead */ }
}

export function run(command: string, options: RunOptions): Promise<RunResult> {
	const { cwd, env, timeoutMs = COMMAND_TIMEOUT_MS, stream = false, captureForError = true } = options

	return new Promise<RunResult>((resolve, reject) => {
		const child = spawn(command, {
			cwd,
			shell: true,
			stdio: ["ignore", "pipe", "pipe"],
			// Detach so the child gets its own process group we can signal as a unit.
			detached: !IS_WINDOWS,
			// NPM_ENV first so an explicit caller override still wins.
			env: withHeapCap({ ...process.env, ...NPM_ENV, ...env })
		})

		let output = ""
		let settled = false
		let killTimer: ReturnType<typeof setTimeout> | undefined

		const collect = (chunk: Buffer, level: "info" | "warn") => {
			const text = stripAnsi(chunk.toString())
			output = (output + text).slice(-OUTPUT_LIMIT)
			if (stream) jobOutput(text, level)
		}

		child.stdout?.on("data", (chunk: Buffer) => collect(chunk, "info"))
		// npm writes progress and warnings to stderr; it is not necessarily an
		// error, so it streams at info level and only the exit code decides.
		child.stderr?.on("data", (chunk: Buffer) => collect(chunk, "info"))

		const timer = setTimeout(() => {
			if (settled) return
			settled = true
			jobLog(`Command exceeded ${Math.round(timeoutMs / 1000)}s, terminating: ${command}`, "warn")
			killTree(child.pid, "SIGTERM")
			// If it ignores SIGTERM, escalate so we never leak a build process.
			killTimer = setTimeout(() => killTree(child.pid, "SIGKILL"), KILL_GRACE_MS)
			reject(new Error(
				`${command} timed out after ${timeoutMs}ms${captureForError ? `\n\n${output}` : ""}`
			))
		}, timeoutMs)

		const finish = () => {
			clearTimeout(timer)
			if (killTimer) clearTimeout(killTimer)
		}

		child.on("error", (error) => {
			if (settled) return
			settled = true
			finish()
			reject(error)
		})

		child.on("exit", (code) => {
			if (settled) return
			settled = true
			finish()
			if (code === 0) {
				resolve({ output, code })
				return
			}
			reject(new Error(
				`${command} failed with exit code ${code}${captureForError ? `\n\n${output}` : ""}`
			))
		})
	})
}

/**
 * Everything that decides the dependency tree, hashed.
 *
 * package.json alone is the right input: the lockfile is rewritten *by* the
 * install, so including it would leave every stamp stale the moment it was
 * written. Hashing the whole manifest rather than just the dependency blocks
 * errs towards reinstalling, which is the safe direction to be wrong in.
 */
async function manifestFingerprint(projectDir: string): Promise<string> {
	const manifest = await readFile(path.join(projectDir, "package.json"), "utf-8").catch(() => "")
	return createHash("sha256").update(manifest).digest("hex")
}

/**
 * The stamp lives inside node_modules deliberately: if the tree is wiped — the
 * retry path below does exactly that — the stamp goes with it, so a skip can
 * never outlive the install it describes.
 */
const stampPath = (projectDir: string) => path.join(projectDir, "node_modules", ".rwaft-install")

async function installIsCurrent(projectDir: string): Promise<boolean> {
	try {
		const [stamp, fingerprint] = await Promise.all([
			readFile(stampPath(projectDir), "utf-8"),
			manifestFingerprint(projectDir)
		])
		return stamp.trim() === fingerprint
	} catch {
		// No stamp, or no tree at all: install.
		return false
	}
}

async function recordInstall(projectDir: string): Promise<void> {
	// Recomputed after the fact: npm edits package.json itself when it adds a
	// dependency, and the stamp must describe the tree we actually ended up with.
	await writeFile(stampPath(projectDir), await manifestFingerprint(projectDir), "utf-8")
		.catch(() => { /* a lost stamp only ever costs one redundant install */ })
}

/**
 * Installs dependencies with the flags that make npm behave inside a container:
 * no progress spinner (keeps logs readable), no audit/fund round-trips (two
 * fewer network calls that can hang), and a retry that wipes the tree first.
 *
 * The wipe matters: retrying an install on top of a corrupted node_modules is
 * what turned one timeout into the unrecoverable ENOENT storm in production.
 */
export async function installDependencies(projectDir: string, extraFlags = ""): Promise<void> {
	const flags = [
		// Belt and braces with NPM_ENV: --include=dev overrides the omit=dev that
		// NODE_ENV=production hands npm, so devDependencies (the whole toolchain)
		// are actually installed. See NPM_ENV above for why this matters.
		"--include=dev",
		"--no-audit",
		"--no-fund",
		"--no-progress",
		"--loglevel=warn",
		extraFlags
	].filter(Boolean).join(" ")

	const command = `npm install ${flags}`.trim()

	// The build-repair loop calls this before every attempt, so a run that needed
	// one install was paying for three. npm handles a no-op install in seconds,
	// but those seconds are spent spawning a second Node process next to a
	// bundler we are already trying to fit in memory. Skip it outright when
	// nothing that decides the tree has changed.
	if (await installIsCurrent(projectDir)) {
		jobLog("Dependencies already match package.json - skipping install")
		return
	}

	try {
		jobLog("Installing dependencies…")
		await run(command, { cwd: projectDir, timeoutMs: INSTALL_TIMEOUT_MS, stream: true })
		await recordInstall(projectDir)
		jobLog("Dependencies installed", "success")
		return
	} catch (error) {
		jobLog(`Install failed (${(error as Error).message.split("\n")[0]}), cleaning and retrying once…`, "warn")
	}

	// A failed/killed install leaves a partially extracted tree. Remove it and
	// drop the shared cache entries before the retry, otherwise npm keeps
	// reusing the same corrupt tarballs.
	await run("npm cache clean --force", { cwd: projectDir, timeoutMs: 60_000, captureForError: false })
		.catch(() => { /* best effort */ })
	await rm(`${projectDir}/node_modules`, { recursive: true, force: true }).catch(() => { })

	jobLog("Reinstalling dependencies from a clean tree…")
	await run(command, { cwd: projectDir, timeoutMs: INSTALL_TIMEOUT_MS, stream: true })
	await recordInstall(projectDir)
	jobLog("Dependencies installed", "success")
}

/**
 * Runs the project's build script with a build-appropriate timeout.
 * `extraArgs` are forwarded to the underlying bundler via `npm run build -- ...`,
 * which is how a deployment's asset base path gets applied.
 */
export async function buildProject(
	projectDir: string,
	env?: Record<string, string>,
	extraArgs = ""
): Promise<void> {
	jobLog("Building project...")
	const command = extraArgs ? `npm run build -- ${extraArgs}` : "npm run build"
	await run(command, { cwd: projectDir, timeoutMs: BUILD_TIMEOUT_MS, stream: true, env })
	jobLog("Build succeeded", "success")
}
