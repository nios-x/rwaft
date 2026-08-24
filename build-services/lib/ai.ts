import fs from "fs/promises"
import path from "path"
import OpenAI from "openai"
import type { ChatCompletionTool, ChatCompletionMessageParam } from "openai/resources/chat/completions"
import { executeToolRequest } from "./tools.ts"
import "./config.ts"

// ── Client factory ──────────────────────────────────────────────────────────

function getGeminiClient(apiKey: string): OpenAI {
	return new OpenAI({
		baseURL: process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai/",
		apiKey,
		fetch: globalThis.fetch
	})
}

function getOpenRouterClient(): OpenAI {
	return new OpenAI({
		baseURL: "https://openrouter.ai/api/v1",
		apiKey: process.env.OPENROUTER_API_KEY || "",
		fetch: globalThis.fetch
	})
}

// ── Model fallback chain ────────────────────────────────────────────────────

interface ModelEntry {
	client: () => OpenAI
	model: string
	provider: string
}

let nextGeminiKey = 0

const DEFAULT_GEMINI_MODELS = [
	"gemini-3.7-flash",
	"gemini-3.6-flash",
	"gemini-3.5-flash",
	"gemini-3.5-flash-lite",
	"gemini-3.1-flash-lite"
]

function getGeminiApiKeys(): string[] {
	const numberedKeys: string[] = []
	for (let index = 1; index <= 9; index++) {
		const key = process.env[`GEMINI_API_KEY${index}`]
		if (key) numberedKeys.push(key)
	}
	const keys = numberedKeys.length === 9
		? numberedKeys
		: [process.env.GEMINI_API_KEY, ...numberedKeys].slice(0, 9)

	return [...new Set(keys.filter((key): key is string => Boolean(key)))]
}

function getModelChain(): ModelEntry[] {
	const geminiKeys = getGeminiApiKeys()
	const chain: ModelEntry[] = []

	if (geminiKeys.length > 0) {
		const start = nextGeminiKey % geminiKeys.length
		nextGeminiKey = (nextGeminiKey + 1) % geminiKeys.length
		const rotatedKeys = [...geminiKeys.slice(start), ...geminiKeys.slice(0, start)]
		const configuredModel = process.env.AI_MODEL
		const models = configuredModel
			? [configuredModel, ...DEFAULT_GEMINI_MODELS.filter(model => model !== configuredModel)]
			: DEFAULT_GEMINI_MODELS

		for (const model of models) {
			chain.push(...rotatedKeys.map((key, index) => ({
				client: () => getGeminiClient(key),
				model,
				provider: `Gemini key ${start + index >= geminiKeys.length ? start + index - geminiKeys.length + 1 : start + index + 1}`
			})))
		}
	}

	// Add OpenRouter fallbacks if key is available
	if (process.env.OPENROUTER_API_KEY) {
		chain.push(
			{ client: getOpenRouterClient, model: process.env.OPENROUTER_MODEL || "google/gemini-3.5-flash-lite", provider: "OpenRouter" }
		)
	}

	return chain
}

// ── Context limits ──────────────────────────────────────────────────────────

const TOOL_RESULT_MAX_CHARS = 6_000
const CONTEXT_COMPACT_THRESHOLD = 40_000 // bytes before compaction kicks in
const COMPACT_KEEP_RECENT = 6 // keep this many recent messages at full size
const COMPACTED_RESULT_MAX = 200 // chars to keep for old tool results

function truncateResult(text: string): string {
	if (text.length <= TOOL_RESULT_MAX_CHARS) return text
	const half = Math.floor((TOOL_RESULT_MAX_CHARS - 60) / 2)
	return `${text.slice(0, half)}\n\n... [truncated ${text.length - TOOL_RESULT_MAX_CHARS} chars] ...\n\n${text.slice(-half)}`
}

/**
 * Shrinks old tool-result messages to short summaries when total context
 * exceeds the threshold. Keeps the system prompt, user prompt, and the
 * last COMPACT_KEEP_RECENT messages at full size.
 */
function compactMessages(messages: ChatCompletionMessageParam[]): void {
	const totalChars = messages.reduce((sum, m) => {
		const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "")
		return sum + content.length
	}, 0)

	if (totalChars < CONTEXT_COMPACT_THRESHOLD) return

	// Never compact: first 2 (system + user) and last COMPACT_KEEP_RECENT
	const compactEnd = Math.max(2, messages.length - COMPACT_KEEP_RECENT)
	let compacted = 0

	for (let i = 2; i < compactEnd; i++) {
		const msg = messages[i] as any
		if (msg.role === "tool" && typeof msg.content === "string" && msg.content.length > COMPACTED_RESULT_MAX) {
			msg.content = msg.content.slice(0, COMPACTED_RESULT_MAX) + "... [compacted]"
			compacted++
		}
	}

	if (compacted > 0) {
		console.log(`  [ai] Compacted ${compacted} old tool results to save context`)
	}
}

// ── Retry helper ────────────────────────────────────────────────────────────

const MAX_RETRIES = parseInt(process.env.AI_MAX_RETRIES || "3", 10)
const RETRY_BASE_MS = 2_000
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 60_000)

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function isRetryable(error: unknown): boolean {
	if (error && typeof error === "object" && "status" in error) {
		const status = (error as any).status
		return status === 429 || status === 503 || status === 500 || status === 502
	}
	return false
}

async function callWithRetry(
	modelChain: ModelEntry[],
	messages: ChatCompletionMessageParam[],
	tools: ChatCompletionTool[]
) {
	for (const entry of modelChain) {
		const client = entry.client()
		for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
			const controller = new AbortController()
			const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)
			try {
				console.log(`  [ai] Calling ${entry.model} via ${entry.provider} (attempt ${attempt})`)
				const response = await client.chat.completions.create({
					model: entry.model,
					messages,
					tools
				}, { signal: controller.signal })
				return response
			} catch (error: unknown) {
				const status = (error as any)?.status
				const timedOut = controller.signal.aborted
				const message = timedOut
					? `request timed out after ${AI_TIMEOUT_MS}ms`
					: (error as Error).message?.slice(0, 100)
				console.warn(`  ⚠ ${entry.model} error (${status || "timeout"}): ${message}`)

				if (!timedOut && (status === 429 || !isRetryable(error) || attempt === MAX_RETRIES)) {
					// Non-retryable or exhausted retries → try next model
					break
				}
				if (attempt === MAX_RETRIES) break
				const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1)
				console.log(`  [ai] Retrying in ${delay}ms...`)
				await sleep(delay)
			} finally {
				clearTimeout(timer)
			}
		}
		console.log(`  [ai] Model ${entry.model} exhausted, trying next fallback...`)
	}
	throw new Error("All AI models exhausted — no successful response")
}

// ── Tool-call shape returned to the caller ──────────────────────────────────

export type CreateFileOp = { tool: "create_file"; path: string; content: string }
export type PatchFileOp = { tool: "patch_file"; path: string; search: string; replace: string }
export type ReplaceFileOp = { tool: "replace_file"; path: string; content: string }
export type WriteFileOp = { tool: "write_file"; path: string; content: string }
export type EditFileOp = { tool: "edit_file"; path: string; search: string; replace: string }
export type DeleteFileOp = { tool: "delete_file"; path: string }
export type MoveFileOp = { tool: "move_file"; path: string; to: string }
export type CopyFileOp = { tool: "copy_file"; path: string; to: string }
export type CreateDirectoryOp = { tool: "create_directory"; path: string }
export type FileOperation = CreateFileOp | PatchFileOp | ReplaceFileOp | WriteFileOp | EditFileOp | DeleteFileOp | MoveFileOp | CopyFileOp | CreateDirectoryOp

// ── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior frontend engineer. The user will describe a web application.
You will receive a Vite + React + TypeScript project that has already been scaffolded with the default template.

Your job is to use the provided filesystem tools to create and modify files so the project implements what the user asked for.

Rules:
- Only use the provided tools. Do NOT output code in plain text.
- Use read_file to inspect an existing file before editing it.
- Use write_file for complete file contents, edit_file for exact search/replace, and delete_file, move_file, copy_file, or create_directory for filesystem management.
- Use list_files, search_files, find_symbol, find_references, and get_file_metadata to inspect the workspace.
- Use run_command to run shell commands (e.g. npm install), and install_package to add npm packages.
- All file paths are relative to the project root (e.g. "src/App.tsx", "src/components/Header.tsx").
- Write complete, production-quality code. No placeholders or TODOs.
- You may add CSS files, components, assets, and new dependencies (via edit_file on package.json or install_package).
- When using React hooks such as useState or useEffect, import each hook from "react" in the file that uses it.
- Ensure package.json includes react, react-dom, typescript, vite, and @vitejs/plugin-react when the Vite config imports the React plugin.
- Use type-only imports for TypeScript types when verbatimModuleSyntax is enabled.
- Ensure index.html references an entry file that exists. Use a relative path such as ./src/main.tsx, and create that file when it is missing.
- Keep the mount element ID in index.html identical to the ID queried by the entry file (normally <div id="root"></div> or <div id="app"></div>).
- App.tsx must only export the app component; never call createRoot, hydrateRoot, or ReactDOM.render from App.tsx. Mount React exactly once in the entry file.
- Ensure tsconfig.json sets compilerOptions.jsx to "react-jsx" when the project contains .tsx files.
- Set tsconfig.json compilerOptions.lib to ["ES2020", "DOM", "DOM.Iterable"] and allowImportingTsExtensions to true.
- Do not add compiler options that may not be supported by the installed TypeScript version, especially erasableSyntaxOnly.
- Replace the scaffold entry implementation instead of leaving imports for starter assets that do not exist; every imported file must exist.
- After inspecting a file, implement the required changes immediately. Do not spend multiple iterations only inspecting files.
- Keep Vite config syntax consistent with its extension: never use 'import type' or TypeScript annotations in vite.config.js; prefer vite.config.ts for TypeScript config.
- Ensure the entry file imports the app component and mounts it with ReactDOM before finishing.
- Before finishing, verify package.json and every imported module/config file so npm install and npm run build can resolve them.
- When repairing a failed build, inspect every named file and its imported types/modules before editing, then fix all reported errors in one coherent pass. Never hide errors with any, @ts-ignore, or broad casts, and never replace requested functionality with a placeholder.
- Make sure the app compiles and builds cleanly with "npm run build".`

// ── Tool definitions ────────────────────────────────────────────────────────
// Each tool now declares ONLY the parameters it actually uses, plus required
// fields. This prevents the AI from sending irrelevant/wrong keys and reduces
// the tool-definition token overhead sent every iteration.

type ToolSpec = { name: string; description: string; parameters: Record<string, any> }

const toolSpecs: ToolSpec[] = [
	{
		name: "list_files",
		description: "List all files in a directory. Path is relative to project root, defaults to '.'.",
		parameters: { type: "object", properties: { path: { type: "string", description: "Directory path relative to project root" } } }
	},
	{
		name: "read_file",
		description: "Read the contents of a file. Path is relative to project root.",
		parameters: { type: "object", properties: { path: { type: "string", description: "File path relative to project root" } }, required: ["path"] }
	},
	{
		name: "write_file",
		description: "Create or overwrite a file with the given content. Path is relative to project root.",
		parameters: { type: "object", properties: { path: { type: "string", description: "File path relative to project root" }, content: { type: "string", description: "Complete file content" } }, required: ["path", "content"] }
	},
	{
		name: "edit_file",
		description: "Replace an exact substring in a file. Use 'search' for the text to find and 'replace' for the replacement.",
		parameters: { type: "object", properties: { path: { type: "string" }, search: { type: "string", description: "Exact text to find" }, replace: { type: "string", description: "Replacement text" } }, required: ["path", "search", "replace"] }
	},
	{
		name: "delete_file",
		description: "Delete a file or directory.",
		parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] }
	},
	{
		name: "move_file",
		description: "Move/rename a file from 'path' to 'to'.",
		parameters: { type: "object", properties: { path: { type: "string" }, to: { type: "string" } }, required: ["path", "to"] }
	},
	{
		name: "copy_file",
		description: "Copy a file from 'path' to 'to'.",
		parameters: { type: "object", properties: { path: { type: "string" }, to: { type: "string" } }, required: ["path", "to"] }
	},
	{
		name: "create_directory",
		description: "Create a directory (including parents).",
		parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] }
	},
	{
		name: "search_files",
		description: "Search for text across all project files.",
		parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
	},
	{
		name: "find_symbol",
		description: "Find occurrences of a symbol name across the project.",
		parameters: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] }
	},
	{
		name: "find_references",
		description: "Find all references to a symbol.",
		parameters: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] }
	},
	{
		name: "get_file_metadata",
		description: "Get metadata (size, type, modified date) for a file.",
		parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] }
	},
	{
		name: "run_command",
		description: "Run a shell command in the project directory.",
		parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] }
	},
	{
		name: "install_package",
		description: "Install an npm package. Set dev to 'true' for devDependencies.",
		parameters: { type: "object", properties: { package: { type: "string" }, dev: { type: "string", enum: ["true", "false"] } }, required: ["package"] }
	}
]

const tools: ChatCompletionTool[] = toolSpecs.map(spec => ({
	type: "function",
	function: { name: spec.name, description: spec.description, parameters: spec.parameters }
}))

// ── Main generation function ────────────────────────────────────────────────

export async function generateToolCalls(prompt: string, projectDir: string): Promise<FileOperation[]> {
	const modelChain = getModelChain()

	const messages: ChatCompletionMessageParam[] = [
		{ role: "system", content: SYSTEM_PROMPT },
		{ role: "user", content: prompt }
	]

	const operations: FileOperation[] = []
	let iterations = 0
	const MAX_ITERATIONS = 20
	let consecutiveReadOnlyIterations = 0
	const MAX_READ_ONLY_ITERATIONS = 3

	while (iterations < MAX_ITERATIONS) {
		iterations++

		// Compact old tool results if context is getting too large
		compactMessages(messages)

		console.log(`  [ai] Iteration ${iterations} — sending ${messages.length} messages`)

		const response = await callWithRetry(modelChain, messages, tools)

		const choice = response.choices[0]
		if (!choice) break

		const message = choice.message

		// Diagnostic logging
		console.log(`  [ai] finish_reason: ${choice.finish_reason}`)
		console.log(`  [ai] tool_calls: ${message.tool_calls?.length ?? 0}`)
		if (message.content) {
			console.log(`  [ai] text response: ${message.content.slice(0, 200)}`)
		}

		if (!message.tool_calls?.length) break

		// Feed the assistant message back so the model maintains conversation context
		messages.push(message)

		let iterationProducedOperation = false

		for (const call of message.tool_calls) {
			// Fix 4: Gracefully handle malformed JSON in tool call arguments
			let args: Record<string, any>
			try {
				args = JSON.parse(call.function.arguments)
			} catch (parseError) {
				console.warn(`  ⚠ malformed JSON in tool call ${call.function.name}: ${(parseError as Error).message}`)
				messages.push({
					role: "tool",
					tool_call_id: call.id,
					content: "ERROR: Malformed JSON in function arguments. Please resend with valid JSON."
				})
				continue
			}

			const toolName = call.function.name
			let result = "OK"
			// Alias for the switch — keep 'name' available for args.name
			const name = toolName

			// Fix 1: Normalize file_path → path (AI sometimes uses file_path)
			if (!args.path && args.file_path) args.path = args.file_path

			switch (name) {
				case "list_files":
				case "read_file":
				case "find_file":
				case "search_files":
				case "find_symbol":
				case "find_references":
				case "get_file_metadata":
				case "run_command":
				case "run_background_command":
				case "kill_process":
				case "get_process_output":
				case "open_terminal":
				case "set_environment_variable":
				case "install_package":
				case "run_script":
					try {
						result = truncateResult(await executeToolRequest(projectDir, name, args))
					} catch (error) {
						result = `ERROR: ${error instanceof Error ? error.message : String(error)}`
					}
					break
				// Fix 2: Validate required fields before collecting operations
				case "create_file":
				case "write_file": {
					if (!args.path || typeof args.path !== "string") {
						console.warn(`  ⚠ ${name} missing path, skipping`)
						result = "ERROR: path argument is required and must be a non-empty string. Use the 'path' parameter."
						break
					}
					operations.push({ tool: name as "create_file" | "write_file", path: args.path, content: args.content ?? "" })
					iterationProducedOperation = true
					break
				}
				case "patch_file":
				case "edit_file": {
					if (!args.path || typeof args.path !== "string") {
						console.warn(`  ⚠ ${name} missing path, skipping`)
						result = "ERROR: path argument is required and must be a non-empty string. Use the 'path' parameter."
						break
					}
					operations.push({ tool: name as "patch_file" | "edit_file", path: args.path, search: args.search ?? "", replace: args.replace ?? "" })
					iterationProducedOperation = true
					break
				}
				case "replace_file": {
					if (!args.path || typeof args.path !== "string") {
						console.warn(`  ⚠ ${name} missing path, skipping`)
						result = "ERROR: path argument is required and must be a non-empty string. Use the 'path' parameter."
						break
					}
					operations.push({ tool: "replace_file", path: args.path, content: args.content ?? "" })
					iterationProducedOperation = true
					break
				}
				case "delete_file": {
					if (!args.path || typeof args.path !== "string") {
						console.warn(`  ⚠ ${name} missing path, skipping`)
						result = "ERROR: path argument is required and must be a non-empty string. Use the 'path' parameter."
						break
					}
					operations.push({ tool: "delete_file", path: args.path })
					iterationProducedOperation = true
					break
				}
				case "move_file": {
					if (!args.path || typeof args.path !== "string" || !args.to || typeof args.to !== "string") {
						console.warn(`  ⚠ ${name} missing path or to, skipping`)
						result = "ERROR: both 'path' and 'to' arguments are required and must be non-empty strings."
						break
					}
					operations.push({ tool: "move_file", path: args.path, to: args.to })
					iterationProducedOperation = true
					break
				}
				case "copy_file": {
					if (!args.path || typeof args.path !== "string" || !args.to || typeof args.to !== "string") {
						console.warn(`  ⚠ ${name} missing path or to, skipping`)
						result = "ERROR: both 'path' and 'to' arguments are required and must be non-empty strings."
						break
					}
					operations.push({ tool: "copy_file", path: args.path, to: args.to })
					iterationProducedOperation = true
					break
				}
				case "create_directory": {
					if (!args.path || typeof args.path !== "string") {
						console.warn(`  ⚠ ${name} missing path, skipping`)
						result = "ERROR: path argument is required and must be a non-empty string. Use the 'path' parameter."
						break
					}
					operations.push({ tool: "create_directory", path: args.path })
					iterationProducedOperation = true
					break
				}
			}

			messages.push({
				role: "tool",
				tool_call_id: call.id,
				content: result
			})
		}

		// Fix 3: Track consecutive read-only iterations and nudge the AI
		if (iterationProducedOperation) {
			consecutiveReadOnlyIterations = 0
		} else {
			consecutiveReadOnlyIterations++
			if (consecutiveReadOnlyIterations >= MAX_READ_ONLY_ITERATIONS) {
				console.warn(`  [ai] ${MAX_READ_ONLY_ITERATIONS} consecutive read-only iterations, nudging AI to produce file changes`)
				messages.push({
					role: "user",
					content: "You have spent several iterations only reading files without making changes. You must now produce the required file operations (write_file, edit_file, etc.) or finish. Do not call read_file again unless absolutely necessary."
				})
				consecutiveReadOnlyIterations = 0
			}
		}

		// If the model indicated it's done (stop or no more tool calls), break
		if (choice.finish_reason === "stop") break
	}

	return operations
}
