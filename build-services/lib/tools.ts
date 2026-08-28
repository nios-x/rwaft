import fs from "fs/promises"
import path from "path"
import { spawn, type ChildProcess } from "node:child_process"
import type { FileOperation } from "./ai.ts"
import { jobLog } from "./joblog.ts"
import { COMMAND_TIMEOUT_MS } from "./run.ts"

const MAX_WALK_DEPTH = 10
const MAX_WALK_FILES = 2_000

// Background processes and env overlays are scoped per-project (per job),
// not global — so one job can never read, kill, or leak env into another's.
type ProcessState = { child: ChildProcess; output: string; startedAt: number }
const backgroundProcesses = new Map<string, Map<number, ProcessState>>()
const projectEnvOverlays = new Map<string, Record<string, string>>()
let nextProcessId = 1

// File operations are streamed to the requesting user's log channel, so the
// browser console shows the same edit-by-edit trace the container log does.
const log = (_projectDir: string, message: string) => jobLog(message)
const warn = (_projectDir: string, message: string) => jobLog(message, "warn")

/** Signals a child and everything it spawned, not just the shell wrapper. */
function killProcessTree(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM"): void {
	if (!child.pid) return
	try {
		if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" })
		else process.kill(-child.pid, signal)
	} catch { /* already exited */ }
}

function getEnvOverlay(projectDir: string): Record<string, string> {
	let overlay = projectEnvOverlays.get(projectDir)
	if (!overlay) {
		overlay = {}
		projectEnvOverlays.set(projectDir, overlay)
	}
	return overlay
}

/** Call when a job (deploy or prompt) finishes — kills any stray background
 *  processes and drops the env overlay so nothing survives into the next job. */
export function releaseJobState(projectDir: string): void {
	const processes = backgroundProcesses.get(projectDir)
	if (processes) {
		for (const { child } of processes.values()) {
			killProcessTree(child, "SIGKILL")
		}
		backgroundProcesses.delete(projectDir)
	}
	projectEnvOverlays.delete(projectDir)
}

/**
 * Resolves a relative file path against the project root,
 * rejecting any traversal outside the sandbox.
 */
function safePath(projectDir: string, relativePath: string): string {
	if (!relativePath || typeof relativePath !== "string") {
		throw new Error(`Invalid path: expected a non-empty string, got ${typeof relativePath} (${JSON.stringify(relativePath)})`)
	}
	const resolved = path.resolve(projectDir, relativePath)
	const root = path.resolve(projectDir)
	if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
		throw new Error(`Path traversal blocked: ${relativePath}`)
	}
	return resolved
}

async function walkFiles(directory: string, depth = 0): Promise<string[]> {
	if (depth > MAX_WALK_DEPTH) return []
	const results: string[] = []
	let entries
	try {
		entries = await fs.readdir(directory, { withFileTypes: true })
	} catch {
		return []
	}
	for (const entry of entries) {
		if (results.length >= MAX_WALK_FILES) break
		if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue
		const target = path.join(directory, entry.name)
		if (entry.isDirectory()) {
			const subFiles = await walkFiles(target, depth + 1)
			results.push(...subFiles)
		} else {
			results.push(target)
		}
	}
	return results
}

async function searchProject(projectDir: string, query: string, symbolOnly = false): Promise<string> {
	const matches: string[] = []
	const pattern = symbolOnly ? new RegExp(`\\b${query.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`) : null
	for (const filename of await walkFiles(projectDir)) {
		let source: string
		try { source = await fs.readFile(filename, "utf-8") } catch { continue }
		const lines = source.split(/\r?\n/)
		lines.forEach((line, index) => {
			if (pattern ? pattern.test(line) : line.toLowerCase().includes(query.toLowerCase())) {
				matches.push(`${path.relative(projectDir, filename)}:${index + 1}: ${line.trim()}`)
			}
		})
	}
	return matches.slice(0, 200).join("\n") || "No matches found"
}

const outputLimit = (output: string) => output.slice(-12_000)

async function runCommand(projectDir: string, command: string, background = false): Promise<string> {
	// Block dangerous commands the AI should never run.
	// NOTE: this is a denylist on a single shell string — it's a speed bump,
	// not a security boundary (chaining, curl|bash, env exfiltration, etc.
	// all slip past it). Real safety here requires running commands in an
	// isolated sandbox, which is a separate infra piece, not a regex fix.
	const dangerous = /\b(rm\s+-rf\s+\/|format|shutdown|reboot|del\s+\/[sq]|rmdir\s+\/s)\b/i
	if (dangerous.test(command)) {
		return `ERROR: Command blocked for safety: ${command}`
	}

	const env = { ...process.env, ...getEnvOverlay(projectDir) }

	return new Promise((resolve, reject) => {
		// `detached` puts the command in its own process group so a timeout can
		// signal the whole tree. Killing only the shell leaves npm/vite running,
		// which then corrupts the workspace the retry is trying to reuse.
		const child = spawn(command, {
			cwd: projectDir,
			shell: true,
			stdio: ["ignore", "pipe", "pipe"],
			detached: process.platform !== "win32",
			env
		})
		const killTree = (signal: NodeJS.Signals) => {
			if (!child.pid) return
			try {
				if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" })
				else process.kill(-child.pid, signal)
			} catch { /* already dead */ }
		}
		let output = ""
		const collect = (chunk: Buffer) => { output = outputLimit(output + chunk.toString()) }
		child.stdout.on("data", collect)
		child.stderr.on("data", collect)
		if (background) {
			const processId = nextProcessId++
			let processes = backgroundProcesses.get(projectDir)
			if (!processes) {
				processes = new Map()
				backgroundProcesses.set(projectDir, processes)
			}
			processes.set(processId, { child, output, startedAt: Date.now() })
			child.stdout.on("data", () => { const ps = processes!.get(processId); if (ps) ps.output = output })
			child.stderr.on("data", () => { const ps = processes!.get(processId); if (ps) ps.output = output })
			child.on("exit", code => {
				const ps = processes!.get(processId)
				if (ps) ps.output += `\nProcess exited with code ${code}`
				// Auto-cleanup after 5 minutes
				setTimeout(() => processes!.delete(processId), 5 * 60_000)
			})
			resolve(`Started background process ${processId}`)
			return
		}
		let settled = false
		const timer = setTimeout(() => {
			if (settled) return
			settled = true
			killTree("SIGTERM")
			setTimeout(() => killTree("SIGKILL"), 5_000).unref()
			reject(new Error(`${command} timed out after ${COMMAND_TIMEOUT_MS}ms\n\n${outputLimit(output)}`))
		}, COMMAND_TIMEOUT_MS)
		child.on("error", (error) => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			reject(error)
		})
		child.on("exit", (code) => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			if (code === 0) resolve(outputLimit(output))
			else reject(new Error(`${command} failed with exit code ${code}\n\n${outputLimit(output)}`))
		})
	})
}

function requiredArg(args: Record<string, string>, name: string): string {
	const value = args[name]
	if (!value) throw new Error(`Missing required argument: ${name}`)
	return value
}

export async function executeToolRequest(projectDir: string, name: string, args: Record<string, string>): Promise<string> {
	const filePath = args.path || args.file_path || ""
	switch (name) {
		case "list_files":
			return (await walkFiles(safePath(projectDir, args.path || "."))).map(file => path.relative(projectDir, file)).join("\n") || "No files found"
		case "read_file":
		case "find_file":
			return await fs.readFile(safePath(projectDir, filePath), "utf-8")
		case "search_files":
			return searchProject(projectDir, args.query || args.pattern || "")
		case "find_symbol":
		case "find_references":
			return searchProject(projectDir, args.symbol || args.name || args.query || "", true)
		case "get_file_metadata": {
			const stat = await fs.stat(safePath(projectDir, filePath))
			return JSON.stringify({ path: filePath, type: stat.isDirectory() ? "directory" : "file", size: stat.size, modified: stat.mtime.toISOString() })
		}
		case "run_command":
		case "run_script":
			return runCommand(projectDir, name === "run_script" ? `npm run ${requiredArg(args, "script")}` : requiredArg(args, "command"))
		case "run_background_command":
			return runCommand(projectDir, requiredArg(args, "command"), true)
		case "get_process_output": {
			const processId = Number(args.process_id || args.id)
			const processState = backgroundProcesses.get(projectDir)?.get(processId)
			if (!processState) return "Process not found"
			return outputLimit(processState.output || "No output yet")
		}
		case "kill_process": {
			const processId = Number(args.process_id || args.id)
			const processes = backgroundProcesses.get(projectDir)
			const processState = processes?.get(processId)
			if (!processState) return "Process not found or already exited"
			killProcessTree(processState.child)
			processes!.delete(processId)
			return `Killed process ${processId}`
		}
		case "open_terminal": return "Terminal commands run in the project workspace; use run_command to execute one"
		case "set_environment_variable": {
			// Scoped to this project's spawned commands only — never mutates
			// the worker process's own env, so it can't leak into the next job.
			const envName = requiredArg(args, "name")
			getEnvOverlay(projectDir)[envName] = args.value || ""
			return `Set environment variable ${envName} for this project`
		}
		case "install_package":
			return runCommand(projectDir, `npm install ${args.package || args.name}${args.dev === "true" ? " --save-dev" : ""}`)
		default: throw new Error(`Unsupported tool: ${name}`)
	}
}

async function createFile(projectDir: string, filePath: string, content: string): Promise<void> {
	const target = safePath(projectDir, filePath)
	await fs.mkdir(path.dirname(target), { recursive: true })
	await fs.writeFile(target, content, "utf-8")
	log(projectDir, `✓ create  ${filePath}`)
}

/** Replaces the first occurrence of `search` with `replace` as literal text.
 *  Unlike String.prototype.replace(searchStr, replaceStr), this never
 *  interprets $&, $1, $$, etc. in `replace` as regex backreference tokens. */
function replaceOnce(source: string, search: string, replace: string): string {
	const index = source.indexOf(search)
	if (index === -1) return source
	return source.slice(0, index) + replace + source.slice(index + search.length)
}

function countOccurrences(source: string, search: string): number {
	if (!search) return 0
	let count = 0
	let index = 0
	while ((index = source.indexOf(search, index)) !== -1) {
		count++
		index += search.length
	}
	return count
}

async function patchFile(projectDir: string, filePath: string, search: string, replace: string): Promise<void> {
	const target = safePath(projectDir, filePath)
	const original = await fs.readFile(target, "utf-8")

	const occurrences = countOccurrences(original, search)
	if (occurrences === 0) {
		throw new Error(`Patch search string not found in ${filePath}`)
	}
	if (occurrences > 1) {
		throw new Error(`Patch search string is ambiguous in ${filePath}: matches ${occurrences} locations, expected exactly 1. Include more surrounding context to make it unique.`)
	}

	const patched = replaceOnce(original, search, replace)
	await fs.writeFile(target, patched, "utf-8")
	log(projectDir, `✓ patch   ${filePath}`)
}

async function multiPatchFile(projectDir: string, filePath: string, patches: Array<{ search: string; replace: string }>): Promise<void> {
	const target = safePath(projectDir, filePath)
	let content = await fs.readFile(target, "utf-8")

	for (let i = 0; i < patches.length; i++) {
		const patch = patches[i]
		if (!patch || !patch.search) continue
		const occurrences = countOccurrences(content, patch.search)
		if (occurrences === 0) {
			throw new Error(`Multi-patch chunk ${i + 1}/${patches.length} search string not found in ${filePath}`)
		}
		if (occurrences > 1) {
			throw new Error(`Multi-patch chunk ${i + 1}/${patches.length} search string is ambiguous in ${filePath}: matches ${occurrences} locations, expected exactly 1.`)
		}
		content = replaceOnce(content, patch.search, patch.replace)
	}

	await fs.writeFile(target, content, "utf-8")
	log(projectDir, `✓ multi_patch ${filePath} (${patches.length} patches)`)
}

async function replaceFile(projectDir: string, filePath: string, content: string): Promise<void> {
	const target = safePath(projectDir, filePath)
	await fs.mkdir(path.dirname(target), { recursive: true })
	await fs.writeFile(target, content, "utf-8")
	log(projectDir, `✓ replace ${filePath}`)
}

async function deleteFile(projectDir: string, filePath: string): Promise<void> {
	await fs.rm(safePath(projectDir, filePath), { recursive: true, force: true })
}

async function moveFile(projectDir: string, from: string, to: string): Promise<void> {
	const target = safePath(projectDir, to)
	await fs.mkdir(path.dirname(target), { recursive: true })
	await fs.rename(safePath(projectDir, from), target)
}

async function copyFile(projectDir: string, from: string, to: string): Promise<void> {
	const target = safePath(projectDir, to)
	await fs.mkdir(path.dirname(target), { recursive: true })
	await fs.cp(safePath(projectDir, from), target, { recursive: true })
}

/**
 * Executes a single AI-generated file operation against a project directory.
 */
export async function executeOperation(projectDir: string, operation: FileOperation): Promise<void> {
	switch (operation.tool) {
		case "create_file":
			return createFile(projectDir, operation.path, operation.content)
		case "patch_file":
			return patchFile(projectDir, operation.path, operation.search, operation.replace)
		case "multi_patch_file":
		case "multi_edit_file":
		case "patch_multiple":
		case "multi_patch":
		case "batch_patch":
			return multiPatchFile(projectDir, operation.path, operation.patches)
		case "replace_file":
			return replaceFile(projectDir, operation.path, operation.content)
		case "write_file":
			return createFile(projectDir, operation.path, operation.content)
		case "edit_file":
			return patchFile(projectDir, operation.path, operation.search, operation.replace)
		case "delete_file":
			return deleteFile(projectDir, operation.path)
		case "move_file":
			return moveFile(projectDir, operation.path, operation.to)
		case "copy_file":
			return copyFile(projectDir, operation.path, operation.to)
		case "create_directory":
			return fs.mkdir(safePath(projectDir, operation.path), { recursive: true }).then(() => undefined)
		default:
			// A hallucinated/unsupported tool name is a failure, not a no-op —
			// silently skipping it let the repair loop believe the edit
			// succeeded while the file was never touched.
			throw new Error(`Unknown tool: ${(operation as any).tool}`)
	}
}

/**
 * Applies all operations sequentially (order matters for patches).
 */
export async function applyOperations(projectDir: string, operations: FileOperation[]): Promise<void> {
	const errors: string[] = []
	for (const operation of operations) {
		try {
			await executeOperation(projectDir, operation)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			errors.push(message)
			warn(projectDir, `⚠ ${operation.tool} ${operation.path} — ${message}`)
		}
	}

	if (errors.length > 0) {
		throw new Error(`One or more file operations failed:\n${errors.join("\n")}`)
	}
}