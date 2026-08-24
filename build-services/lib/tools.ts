import fs from "fs/promises"
import path from "path"
import { spawn, type ChildProcess } from "node:child_process"
import type { FileOperation } from "./ai.ts"

const COMMAND_TIMEOUT_MS = Number(process.env.COMMAND_TIMEOUT_MS || 60_000)
const backgroundProcesses = new Map<number, { child: ChildProcess; output: string }>()
let nextProcessId = 1

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

async function walkFiles(directory: string): Promise<string[]> {
	const results: string[] = []
	for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
		if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue
		const target = path.join(directory, entry.name)
		if (entry.isDirectory()) results.push(...await walkFiles(target))
		else results.push(target)
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
	return new Promise((resolve, reject) => {
		const child = spawn(command, { cwd: projectDir, shell: true, stdio: ["ignore", "pipe", "pipe"] })
		let output = ""
		const collect = (chunk: Buffer) => { output = outputLimit(output + chunk.toString()) }
		child.stdout.on("data", collect)
		child.stderr.on("data", collect)
		if (background) {
			const processId = nextProcessId++
			backgroundProcesses.set(processId, { child, output })
			child.stdout.on("data", () => { const processState = backgroundProcesses.get(processId); if (processState) processState.output = output })
			child.stderr.on("data", () => { const processState = backgroundProcesses.get(processId); if (processState) processState.output = output })
			child.on("exit", code => { const processState = backgroundProcesses.get(processId); if (processState) processState.output += `\nProcess exited with code ${code}` })
			resolve(`Started background process ${processId}`)
			return
		}
		const timer = setTimeout(() => {
			child.kill()
			reject(new Error(`${command} timed out after ${COMMAND_TIMEOUT_MS}ms\n\n${outputLimit(output)}`))
		}, COMMAND_TIMEOUT_MS)
		child.on("error", (error) => { clearTimeout(timer); reject(error) })
		child.on("exit", (code) => {
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
			const processState = backgroundProcesses.get(processId)
			if (!processState) return "Process not found"
			return outputLimit(processState.output || "No output yet")
		}
		case "kill_process": {
			const processId = Number(args.process_id || args.id)
			const processState = backgroundProcesses.get(processId)
			if (!processState) return "Process not found or already exited"
			processState.child.kill()
			backgroundProcesses.delete(processId)
			return `Killed process ${processId}`
		}
		case "open_terminal": return "Terminal commands run in the project workspace; use run_command to execute one"
		case "set_environment_variable":
			process.env[requiredArg(args, "name")] = args.value || ""
			return `Set environment variable ${args.name}`
		case "install_package":
			return runCommand(projectDir, `npm install ${args.package || args.name}${args.dev === "true" ? " --save-dev" : ""}`)
		default: throw new Error(`Unsupported tool: ${name}`)
	}
}

async function createFile(projectDir: string, filePath: string, content: string): Promise<void> {
	const target = safePath(projectDir, filePath)
	await fs.mkdir(path.dirname(target), { recursive: true })
	await fs.writeFile(target, content, "utf-8")
	console.log(`  ✓ create  ${filePath}`)
}

async function patchFile(projectDir: string, filePath: string, search: string, replace: string): Promise<void> {
	const target = safePath(projectDir, filePath)
	const original = await fs.readFile(target, "utf-8")

	if (!original.includes(search)) {
		throw new Error(`Patch search string not found in ${filePath}`)
	}

	const patched = original.replace(search, replace)
	await fs.writeFile(target, patched, "utf-8")
	console.log(`  ✓ patch   ${filePath}`)
}

async function replaceFile(projectDir: string, filePath: string, content: string): Promise<void> {
	const target = safePath(projectDir, filePath)
	await fs.mkdir(path.dirname(target), { recursive: true })
	await fs.writeFile(target, content, "utf-8")
	console.log(`  ✓ replace ${filePath}`)
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
			console.warn(`  ⚠ unknown tool: ${(operation as any).tool}, skipping`)
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
			console.warn(`  ⚠ ${operation.tool} ${operation.path} — ${message}`)
		}
	}

	if (errors.length > 0) {
		throw new Error(`One or more file operations failed:\n${errors.join("\n")}`)
	}
}
