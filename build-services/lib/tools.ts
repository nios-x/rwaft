import fs from "fs/promises"
import path from "path"
import type { FileOperation } from "./ai.ts"

/**
 * Resolves a relative file path against the project root,
 * rejecting any traversal outside the sandbox.
 */
function safePath(projectDir: string, relativePath: string): string {
	const resolved = path.resolve(projectDir, relativePath)
	if (!resolved.startsWith(projectDir)) {
		throw new Error(`Path traversal blocked: ${relativePath}`)
	}
	return resolved
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
		console.warn(`  ⚠ patch   ${filePath} — search string not found, skipping`)
		return
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
		default:
			console.warn(`  ⚠ unknown tool: ${(operation as any).tool}, skipping`)
	}
}

/**
 * Applies all operations sequentially (order matters for patches).
 */
export async function applyOperations(projectDir: string, operations: FileOperation[]): Promise<void> {
	for (const operation of operations) {
		await executeOperation(projectDir, operation)
	}
}
