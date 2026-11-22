import fs from "fs/promises"
import path from "path"
import OpenAI from "openai"
import type { ChatCompletionTool, ChatCompletionMessageParam } from "openai/resources/chat/completions"
import { executeOperation, executeToolRequest } from "./tools.ts"
import { jobLog, serverLog } from "./joblog.ts"
import { composeSystemPrompt } from "./skills.ts"
import "./config.ts"

// ── Client factory ──────────────────────────────────────────────────────────

/**
 * Gemini's OpenAI-compatible endpoint sends errors as a list,
 * `[{"error": {...}}]`, and the SDK only reads `body.error`. Every failure
 * was logged as "503 status code (no body)" with Google's reason thrown away,
 * so an invalid key looked the same as an overloaded model.
 */
async function geminiFetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> {
	const response = await globalThis.fetch(input, init)
	if (response.ok) return response
	const text = await response.text()
	let body = text
	try {
		const parsed: unknown = JSON.parse(text)
		if (Array.isArray(parsed) && parsed.length === 1) body = JSON.stringify(parsed[0])
	} catch {
		// Not JSON: the SDK reports the raw text as it is.
	}
	const headers = new Headers(response.headers)
	headers.delete("content-length")
	headers.delete("content-encoding")
	return new Response(body, { status: response.status, statusText: response.statusText, headers })
}

function getGeminiClient(apiKey: string): OpenAI {
	return new OpenAI({
		baseURL: process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai/",
		apiKey,
		fetch: geminiFetch,
		// The SDK otherwise retries 429/5xx twice more on the SAME key, hidden
		// from the log. Retries belong to callWithRetry's round robin.
		maxRetries: 0
	})
}

// ── Model fallback chain ────────────────────────────────────────────────────

interface ModelEntry {
	client: () => OpenAI
	model: string
	provider: string
}

/**
 * Process-wide round-robin position. Every attempt (a new request, a retry,
 * a parallel page call, an agent turn) takes the next key, so load spreads
 * evenly over all keys instead of one key absorbing every retry.
 */
let roundRobin = 0

/**
 * The models every call tries, in this order, on every key: Gemini 4 Hydrogen,
 * then Gemini 3.8 Flash when Hydrogen is overloaded or failing (see
 * OVERLOAD_SWITCH below). Fixed in code on purpose, so every deployment builds
 * with the same model; the old AI_MODEL variable no longer changes it.
 */
const GEMINI_MODELS = [
	"gemini-4-hydrogen",
	"gemini-3.8-flash"
]

interface GeminiApiKey {
	key: string
	label: string
}

function getGeminiApiKeys(): GeminiApiKey[] {
	const numberedKeys: GeminiApiKey[] = []
	for (let index = 9; index >= 1; index--) {
		const key = process.env[`GEMINI_API_KEY${index}`]
		if (key) numberedKeys.push({ key, label: `Gemini key ${index}` })
	}
	const keys = numberedKeys.length === 9
		? numberedKeys
		: [
			process.env.GEMINI_API_KEY ? { key: process.env.GEMINI_API_KEY, label: "Gemini default key" } : undefined,
			...numberedKeys
		].filter((entry): entry is GeminiApiKey => Boolean(entry)).slice(0, 9)

	const seen = new Set<string>()
	return keys.filter(entry => {
		if (seen.has(entry.key)) return false
		seen.add(entry.key)
		return true
	})
}

function getModelChain(): ModelEntry[] {
	const geminiKeys = getGeminiApiKeys()
	const chain: ModelEntry[] = []

	// Every key gets a turn on the preferred model before any key drops down
	// to the fallback, unless the model says it is overloaded (OVERLOAD_SWITCH).
	// Which key goes first is callWithRetry's round robin.
	for (const model of GEMINI_MODELS) {
		chain.push(...geminiKeys.map(entry => ({
			client: () => getGeminiClient(entry.key),
			model,
			provider: entry.label
		})))
	}

	// Any OpenAI-compatible API (OpenRouter, Groq, DeepSeek, ...), tried after
	// every Gemini model. A Gemini overload hits every key at once, so only a
	// second provider gets a build through it.
	const fallbackUrl = process.env.AI_FALLBACK_BASE_URL
	const fallbackKey = process.env.AI_FALLBACK_API_KEY
	const fallbackModel = process.env.AI_FALLBACK_MODEL
	if (fallbackUrl && fallbackKey && fallbackModel) {
		chain.push({
			client: () => new OpenAI({ baseURL: fallbackUrl, apiKey: fallbackKey, maxRetries: 0 }),
			model: fallbackModel,
			provider: "fallback provider"
		})
	}
	return chain
}

// ── Context limits ──────────────────────────────────────────────────────────

const TOOL_RESULT_MAX_CHARS = 6_000
/**
 * Chars of CONVERSATION (everything after the system and user messages) to
 * allow before old tool results get squeezed.
 *
 * Deliberately measured without the fixed prefix. The system prompt grows
 * every time a skill is attached to a pass — a threshold on total context
 * would silently convert that growth into a smaller working budget, and the
 * model would start losing files it had already read after two reads.
 */
const CONVERSATION_COMPACT_BUDGET = 36_000
const COMPACT_KEEP_RECENT = 6 // keep this many recent messages at full size
const COMPACTED_RESULT_MAX = 200 // chars to keep for old tool results

function truncateResult(text: string): string {
	if (text.length <= TOOL_RESULT_MAX_CHARS) return text
	const half = Math.floor((TOOL_RESULT_MAX_CHARS - 60) / 2)
	return `${text.slice(0, half)}\n\n... [truncated ${text.length - TOOL_RESULT_MAX_CHARS} chars] ...\n\n${text.slice(-half)}`
}

/**
 * Shrinks old tool-result messages to short summaries once the conversation
 * outgrows its budget. Keeps the system prompt, user prompt, and the
 * last COMPACT_KEEP_RECENT messages at full size.
 */
function compactMessages(messages: ChatCompletionMessageParam[]): void {
	const conversationChars = messages.slice(2).reduce((sum, m) => {
		const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "")
		return sum + content.length
	}, 0)

	if (conversationChars < CONVERSATION_COMPACT_BUDGET) return

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
		jobLog(`  [ai] Compacted ${compacted} old tool results to save context`)
	}
}

// ── Retry helper ────────────────────────────────────────────────────────────

const MAX_RETRIES = parseInt(process.env.AI_MAX_RETRIES || "3", 10)
const RETRY_BASE_MS = 2_000
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 60_000)

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

/**
 * Process-wide memory of rate-limited keys. Without it every call re-asks each
 * exhausted key in turn, so a build with five calls paid five rounds of 429s
 * before reaching a key that still had quota.
 */
const cooldownUntil = new Map<string, number>()
const MINUTE_COOLDOWN_MS = 60_000
const DAILY_COOLDOWN_MS = 6 * 60 * 60_000

/**
 * Keys Google refused outright (401/403, or a 400 about the key itself) and
 * key+model pairs it does not serve (404). Process-wide for the same reason as
 * cooldownUntil: pages build in parallel, and each one used to rediscover the
 * same dead key. Outlasts a build; a key fixed in the console comes back
 * without a restart.
 */
const rejectedUntil = new Map<string, number>()
const REJECTED_COOLDOWN_MS = 30 * 60_000

/**
 * A 503 means the model is overloaded for everyone, so the next key on the same
 * model rarely does better. After this many in one pass the call moves to the
 * next model, and every call puts this one last until OVERLOAD_COOLDOWN_MS.
 */
const OVERLOAD_SWITCH = 3
const overloadedUntil = new Map<string, number>()
const OVERLOAD_COOLDOWN_MS = 60_000

const isCooling = (until: Map<string, number>, id: string, now: number) => (until.get(id) ?? 0) > now

/** A 400 that is about the key or its project (billing, region), not the request. */
const KEY_PROBLEM = /api[ _]?key|FAILED_PRECONDITION|billing/i

function isRetryable(error: unknown): boolean {
	if (error && typeof error === "object" && "status" in error) {
		const status = (error as any).status
		return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504
	}
	return false
}

/** How long Google asked us to wait on a 429: RetryInfo's "retryDelay": "37s", or a Retry-After header. */
function retryAfterMs(error: unknown, errorResponse: string): number | undefined {
	const delay = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(errorResponse)?.[1]
	const header = error instanceof OpenAI.APIError ? error.headers?.["retry-after"] : undefined
	const seconds = Number(delay ?? header)
	return seconds > 0 ? Math.min(seconds * 1_000, DAILY_COOLDOWN_MS) : undefined
}

function getErrorResponse(error: unknown): string {
	if (!error || typeof error !== "object" || !("error" in error)) return ""
	const response = (error as { error?: unknown }).error
	if (response === undefined) return ""
	try {
		return typeof response === "string" ? response : JSON.stringify(response)
	} catch {
		return "[unserializable provider response]"
	}
}

async function callWithRetry(
	modelChain: ModelEntry[],
	messages: ChatCompletionMessageParam[],
	tools: ChatCompletionTool[] | undefined,
	exhaustedEntries: Set<string>,
	timeoutMs = AI_TIMEOUT_MS,
	reasoningEffort?: "low" | "medium" | "high"
) {
	// Dropped for the rest of this call if a model rejects the parameter.
	let effort = reasoningEffort
	if (modelChain.length === 0) {
		throw new Error("No Gemini API key configured — set GEMINI_API_KEY in build-services/.env")
	}

	const idOf = (entry: ModelEntry) => `${entry.model}:${entry.provider}`
	const usable = (entry: ModelEntry, now: number) => !exhaustedEntries.has(idOf(entry))
		&& !isCooling(rejectedUntil, idOf(entry), now)
		&& !isCooling(rejectedUntil, entry.provider, now)
	const models = [...new Set(modelChain.map((entry) => entry.model))]
	let attempt = 0
	let lastFailure = ""

	// A round gives every model one pass over its keys. Rounds rather than one
	// model's keys × MAX_RETRIES, so an overloaded model costs a few calls, not
	// the whole budget, before the next model gets a turn.
	for (let round = 1; round <= MAX_RETRIES; round++) {
		const roundStart = Date.now()
		// A model that just said "overloaded" goes last, not away: it may be the
		// only one these keys can reach.
		const order = [
			...models.filter((model) => !isCooling(overloadedUntil, model, roundStart)),
			...models.filter((model) => isCooling(overloadedUntil, model, roundStart))
		]

		for (const model of order) {
			const keys = modelChain.filter((entry) => entry.model === model)
			// Each usable key at most once per pass, in rotation.
			const tried = new Set<string>()
			let overloads = 0
			let stalls = 0

			while (true) {
				const now = Date.now()
				const live = keys.filter((entry) => usable(entry, now) && !tried.has(idOf(entry)))
				if (live.length === 0) break
				// Rate-limited keys sit out their cooldown, unless every key is cooling.
				const ready = live.filter((entry) => !isCooling(cooldownUntil, idOf(entry), now))
				const pool = ready.length > 0 ? ready : live
				const entry = pool[roundRobin++ % pool.length]!
				const entryId = idOf(entry)

				const controller = new AbortController()
				const timer = setTimeout(() => controller.abort(), timeoutMs)
				try {
					serverLog(`  [ai] Calling ${entry.model} via ${entry.provider} (attempt ${++attempt})`)
					const response = await entry.client().chat.completions.create({
						model: entry.model,
						messages,
						...(tools ? { tools } : {}),
						...(effort ? { reasoning_effort: effort } : {})
					}, { signal: controller.signal })
					return response
				} catch (error: unknown) {
					const status = (error as any)?.status
					const timedOut = controller.signal.aborted
					const errorResponse = getErrorResponse(error)
					if (status === 400 && effort && /reasoning/i.test(`${(error as Error).message} ${errorResponse}`)) {
						serverLog(`  [ai] ${entry.model} does not accept reasoning_effort; retrying without it`, "warn")
						effort = undefined
						attempt--
						continue
					}
					tried.add(entryId)
					const message = timedOut
						? `request timed out after ${timeoutMs}ms`
						: (error as Error).message?.slice(0, 160)
					const detail = `${message} ${errorResponse}`
					const code = status ?? (timedOut ? "timeout" : "network")
					lastFailure = `${entry.model} via ${entry.provider} (${code}): ${message}`
					serverLog(`  ⚠ ${entry.model} error (${code}) via ${entry.provider}: ${message}`, "warn")

					if (status === 429) {
						if (/per.?day|daily/i.test(detail)) {
							// A daily quota will not come back within this job: skip the pair until it might.
							rejectedUntil.set(entryId, Date.now() + DAILY_COOLDOWN_MS)
						} else {
							// A per-minute one will. Google usually says when; otherwise assume a minute.
							cooldownUntil.set(entryId, Date.now() + (retryAfterMs(error, errorResponse) ?? MINUTE_COOLDOWN_MS))
						}
					} else if (status === undefined) {
						// A stall or a dropped connection says nothing about the key. Twice on
						// one model means it is slow right now, not unlucky: try the next one.
						if (++stalls >= 2) break
					} else if (isRetryable(error)) {
						if (++overloads >= OVERLOAD_SWITCH) {
							overloadedUntil.set(model, Date.now() + OVERLOAD_COOLDOWN_MS)
							break
						}
					} else {
						if (errorResponse) serverLog(`  [ai] Provider response: ${errorResponse}`, "warn")
						if (status === 401 || status === 403 || (status === 400 && KEY_PROBLEM.test(detail))) {
							// The key itself is bad (invalid, expired, leaked, API not enabled, no billing): no model will take it.
							rejectedUntil.set(entry.provider, Date.now() + REJECTED_COOLDOWN_MS)
						} else if (status === 404) {
							// This key cannot reach this model, and will not on the next call either.
							rejectedUntil.set(entryId, Date.now() + REJECTED_COOLDOWN_MS)
						} else {
							// Any other 400: this request will not work on this key and model.
							exhaustedEntries.add(entryId)
						}
					}
				} finally {
					clearTimeout(timer)
				}
			}
			serverLog(overloads >= OVERLOAD_SWITCH
				? `  [ai] ${model} is overloaded, trying the next model...`
				: `  [ai] ${model} unavailable on every key, trying the next model...`, "warn")
		}

		if (!modelChain.some((entry) => usable(entry, Date.now()))) break
		if (round < MAX_RETRIES) {
			const backoff = RETRY_BASE_MS * Math.pow(2, Math.min(3, round + 1))
			// Jitter, as Google's retry guidance asks: pages that failed together
			// should not all come back at the same moment and fail together again.
			const delay = Math.round(backoff / 2 + Math.random() * (backoff / 2))
			serverLog(`  [ai] Every model failed this round; retrying in ${delay}ms...`)
			await sleep(delay)
		}
	}
	// The job's error reaches the user, so the provider detail stays in the server log.
	serverLog(lastFailure
		? `  [ai] All AI models failed. Last error: ${lastFailure}`
		: "  [ai] All AI models exhausted: every key is rejected or out of quota", "error")
	throw new Error("The AI service is busy right now. Please try again in a few minutes.")
}

// ── Tool-call shape returned to the caller ──────────────────────────────────

export type CreateFileOp = { tool: "create_file"; path: string; content: string }
export type PatchFileOp = { tool: "patch_file"; path: string; search: string; replace: string }
export type MultiPatchChunk = { search: string; replace: string }
export type MultiPatchFileOp = {
	tool: "multi_patch_file" | "multi_edit_file" | "patch_multiple" | "multi_patch" | "batch_patch"
	path: string
	patches: MultiPatchChunk[]
}
export type ReplaceFileOp = { tool: "replace_file"; path: string; content: string }
export type WriteFileOp = { tool: "write_file"; path: string; content: string }
export type EditFileOp = { tool: "edit_file"; path: string; search: string; replace: string }
export type DeleteFileOp = { tool: "delete_file"; path: string }
export type MoveFileOp = { tool: "move_file"; path: string; to: string }
export type CopyFileOp = { tool: "copy_file"; path: string; to: string }
export type CreateDirectoryOp = { tool: "create_directory"; path: string }
export type FileOperation = CreateFileOp | PatchFileOp | MultiPatchFileOp | ReplaceFileOp | WriteFileOp | EditFileOp | DeleteFileOp | MoveFileOp | CopyFileOp | CreateDirectoryOp

// ── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior frontend engineer. The user will describe a web application.
You will receive a Vite + React + TypeScript project that has already been scaffolded. The project has:
- src/main.tsx — the entry point that mounts <App /> (DO NOT modify this file)
- src/App.tsx — a stub component you MUST replace with the actual application
- src/index.css — a minimal CSS reset you should replace with full styles
- react, react-dom, @vitejs/plugin-react already installed

Your job is to use the provided filesystem tools to create and modify files so the project implements what the user asked for.

WORKFLOW — follow these steps in order:
1. Determine the pages or views needed. Inspect the scaffold first, then create a concise page map with each page's purpose, content, and primary actions. Identify the shared application shell and reusable components needed across pages.
2. Establish consistency before building broadly. Define shared TypeScript types and component prop contracts, then choose the shared visual language: typography, colors, spacing, borders, radii, responsive breakpoints, and interaction states. Reuse these decisions on every page.
3. Create each page one at a time. Build the shared shell and global styles first, then implement pages in page-map order. Finish each page's imports, types, responsive layout, and user interactions before starting the next. Every created component must be used by the application; do not create speculative or orphan components.
4. Fix bugs before moving forward. After each meaningful batch, inspect imports and run the available typecheck or build command. Resolve TypeScript, module-resolution, layout, and behavior errors before adding more pages. Before finishing, run npm run build and fix every blocking error without using any, @ts-ignore, broad casts, or placeholders.
5. Deploy last. Only deploy after the production build succeeds and the requested pages and primary flows work. Verify the existing deployment command, configuration, environment variables, and provider before running it. If credentials or provider details are unavailable, report the exact prerequisite instead of claiming deployment succeeded.

CRITICAL RULES — read these first:
- You MUST modify src/App.tsx. This is the root component. Replace the stub content with your actual application that imports and renders all your components.
- Every component file you create in src/components/ MUST be imported and rendered in App.tsx. Do not create orphan components.
- After the page map and shared contracts are clear, write App.tsx with the application shell and page-level structure, then create the supporting component files one page at a time.
- Do NOT leave the default App.tsx stub content ("Hello" or "app-root"). Replace it entirely.

General rules:
- Only use the provided tools. Do NOT output code in plain text.
- Use read_file to inspect an existing file before editing it.
- Use write_file for complete file contents, edit_file for exact search/replace, multi_patch_file for applying multiple search/replace patches in a file at once, and delete_file, move_file, copy_file, or create_directory for filesystem management.
- Use list_files, search_files, find_symbol, find_references, and get_file_metadata to inspect the workspace.
- Use run_command to run shell commands (e.g. npm install), and install_package to add npm packages.
- All file paths are relative to the project root (e.g. "src/App.tsx", "src/components/Header.tsx").
- Write complete, production-quality code. No placeholders or TODOs.
- You may add CSS files, components, assets, and new dependencies (via edit_file on package.json or install_package).
- Tailwind CSS v4 IS installed and wired up: vite.config.ts registers tailwindcss() from @tailwindcss/vite, and src/index.css starts with an @import of "tailwindcss". Style with Tailwind utility classes, plain CSS, or both.
- Keep that wiring intact. If you rewrite vite.config.ts, keep BOTH react() and tailwindcss(); if you rewrite src/index.css, keep the @import on the first line. Dropping either does not fail the build — it emits no Tailwind CSS and ships an unstyled page.
- This is Tailwind v4, which is configured in CSS, not JavaScript. Do NOT create tailwind.config.js/ts, and do NOT use the v3 directives @tailwind base/components/utilities. Declare theme tokens with @theme inside src/index.css.
- Do NOT use the NodeJS namespace (e.g. NodeJS.Timeout). Use ReturnType<typeof setTimeout> or number for timer types instead.
- When using React hooks such as useState or useEffect, import each hook from "react" in the file that uses it.
- Ensure package.json includes react, react-dom, typescript, vite, and @vitejs/plugin-react when the Vite config imports the React plugin.
- Use type-only imports for TypeScript types when verbatimModuleSyntax is enabled.
- Do NOT modify src/main.tsx or index.html — they are already configured correctly.
- App.tsx must only export the app component; never call createRoot, hydrateRoot, or ReactDOM.render from App.tsx. Mount React exactly once in the entry file.
- Ensure tsconfig.json sets compilerOptions.jsx to "react-jsx" when the project contains .tsx files.
- Set tsconfig.json compilerOptions.lib to ["ES2020", "DOM", "DOM.Iterable"] and allowImportingTsExtensions to true.
- Do not add compiler options that may not be supported by the installed TypeScript version, especially erasableSyntaxOnly.
- Every imported file must exist. Do not import modules that do not exist.
- After inspecting a file, implement the required changes immediately. Do not spend multiple iterations only inspecting files.
- Keep Vite config syntax consistent with its extension: never use 'import type' or TypeScript annotations in vite.config.js; prefer vite.config.ts for TypeScript config.
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
		name: "multi_patch_file",
		description: "Apply multiple exact search/replace patches to a file in a single tool call. Patches are applied sequentially.",
		parameters: {
			type: "object",
			properties: {
				path: { type: "string", description: "File path relative to project root" },
				patches: {
					type: "array",
					description: "Array of patch chunks to apply sequentially",
					items: {
						type: "object",
						properties: {
							search: { type: "string", description: "Exact text to find" },
							replace: { type: "string", description: "Replacement text" }
						},
						required: ["search", "replace"]
					}
				}
			},
			required: ["path", "patches"]
		}
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

export interface GenerateOptions {
	/**
	 * Skill files (build-services/skills/<name>.md) to append to the system
	 * prompt for this pass. Left empty by default so a repair conversation
	 * carries only the rules it needs.
	 */
	skills?: string[]
}

/**
 * The agentic tool loop. No longer the main generation path (see pages.ts):
 * it stays as the last-resort build repair. Every write is applied to disk as
 * it happens, so the returned operations are a record, not work to apply.
 */
export async function generateToolCalls(prompt: string, projectDir: string, options: GenerateOptions = {}): Promise<FileOperation[]> {
	const modelChain = getModelChain()
	const systemPrompt = await composeSystemPrompt(SYSTEM_PROMPT, options.skills ?? [])

	const messages: ChatCompletionMessageParam[] = [
		{ role: "system", content: systemPrompt },
		{ role: "user", content: prompt }
	]

	const operations: FileOperation[] = []
	const exhaustedEntries = new Set<string>()
	let iterations = 0
	const MAX_ITERATIONS = 20
	let consecutiveReadOnlyIterations = 0
	const MAX_READ_ONLY_ITERATIONS = 2
	let totalNudges = 0
	const MAX_TOTAL_NUDGES = 3

	while (iterations < MAX_ITERATIONS) {
		iterations++

		// Compact old tool results if context is getting too large
		compactMessages(messages)

		jobLog(`  [ai] Iteration ${iterations} — sending ${messages.length} messages`)
		const response = await callWithRetry(modelChain, messages, tools, exhaustedEntries)

		const choice = response.choices[0]
		if (!choice) break

		const message = choice.message

		// Diagnostic logging
		jobLog(`  [ai] finish_reason: ${choice.finish_reason}`)
		jobLog(`  [ai] tool_calls: ${message.tool_calls?.length ?? 0}`)
		if (message.content) {
			jobLog(`  [ai] text response: ${message.content.slice(0, 200)}`)
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
				jobLog(`  ⚠ malformed JSON in tool call ${call.function.name}: ${(parseError as Error).message}`, "warn")
				messages.push({
					role: "tool",
					tool_call_id: call.id,
					content: "ERROR: Malformed JSON in function arguments. Please resend with valid JSON."
				})
				continue
			}

			const toolName = call.function.name
			let result = "OK"
			const stagedBefore = operations.length
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
						jobLog(`  ⚠ ${name} missing path, skipping`, "warn")
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
						jobLog(`  ⚠ ${name} missing path, skipping`, "warn")
						result = "ERROR: path argument is required and must be a non-empty string. Use the 'path' parameter."
						break
					}
					operations.push({ tool: name as "patch_file" | "edit_file", path: args.path, search: args.search ?? "", replace: args.replace ?? "" })
					iterationProducedOperation = true
					break
				}
				case "multi_patch_file":
				case "multi_edit_file":
				case "patch_multiple":
				case "multi_patch":
				case "batch_patch": {
					if (!args.path || typeof args.path !== "string") {
						jobLog(`  ⚠ ${name} missing path, skipping`, "warn")
						result = "ERROR: path argument is required and must be a non-empty string. Use the 'path' parameter."
						break
					}
					let rawPatches = args.patches || args.edits || args.chunks || args.replacements || args.changes
					if (typeof rawPatches === "string") {
						try { rawPatches = JSON.parse(rawPatches) } catch { rawPatches = [] }
					}
					if (!Array.isArray(rawPatches) || rawPatches.length === 0) {
						jobLog(`  ⚠ ${name} missing or invalid patches array, skipping`, "warn")
						result = "ERROR: patches argument is required and must be a non-empty array of { search, replace } objects."
						break
					}

					const parsedPatches: MultiPatchChunk[] = []
					for (const p of rawPatches) {
						if (p && typeof p === "object") {
							const search = p.search ?? p.old_str ?? p.old ?? p.find ?? p.target
							const replace = p.replace ?? p.new_str ?? p.new ?? p.replacement ?? ""
							if (typeof search === "string" && search.length > 0) {
								parsedPatches.push({ search, replace: String(replace) })
							}
						}
					}

					if (parsedPatches.length === 0) {
						result = "ERROR: No valid search/replace patches found in the patches array."
						break
					}

					operations.push({
						tool: "multi_patch_file",
						path: args.path,
						patches: parsedPatches
					})
					iterationProducedOperation = true
					result = `OK: Staged ${parsedPatches.length} patches for ${args.path}`
					break
				}
				case "replace_file": {
					if (!args.path || typeof args.path !== "string") {
						jobLog(`  ⚠ ${name} missing path, skipping`, "warn")
						result = "ERROR: path argument is required and must be a non-empty string. Use the 'path' parameter."
						break
					}
					operations.push({ tool: "replace_file", path: args.path, content: args.content ?? "" })
					iterationProducedOperation = true
					break
				}
				case "delete_file": {
					if (!args.path || typeof args.path !== "string") {
						jobLog(`  ⚠ ${name} missing path, skipping`, "warn")
						result = "ERROR: path argument is required and must be a non-empty string. Use the 'path' parameter."
						break
					}
					operations.push({ tool: "delete_file", path: args.path })
					iterationProducedOperation = true
					break
				}
				case "move_file": {
					if (!args.path || typeof args.path !== "string" || !args.to || typeof args.to !== "string") {
						jobLog(`  ⚠ ${name} missing path or to, skipping`, "warn")
						result = "ERROR: both 'path' and 'to' arguments are required and must be non-empty strings."
						break
					}
					operations.push({ tool: "move_file", path: args.path, to: args.to })
					iterationProducedOperation = true
					break
				}
				case "copy_file": {
					if (!args.path || typeof args.path !== "string" || !args.to || typeof args.to !== "string") {
						jobLog(`  ⚠ ${name} missing path or to, skipping`, "warn")
						result = "ERROR: both 'path' and 'to' arguments are required and must be non-empty strings."
						break
					}
					operations.push({ tool: "copy_file", path: args.path, to: args.to })
					iterationProducedOperation = true
					break
				}
				case "create_directory": {
					if (!args.path || typeof args.path !== "string") {
						jobLog(`  ⚠ ${name} missing path, skipping`, "warn")
						result = "ERROR: path argument is required and must be a non-empty string. Use the 'path' parameter."
						break
					}
					operations.push({ tool: "create_directory", path: args.path })
					iterationProducedOperation = true
					break
				}
			}

			// Apply a write the moment the model makes it. Staging every write
			// until the loop ended meant the model's own read_file calls returned
			// stale content and its `npm run build` built the untouched scaffold,
			// which it then reported as "Build succeeded".
			if (operations.length > stagedBefore) {
				const operation = operations[operations.length - 1]!
				try {
					await executeOperation(projectDir, operation)
				} catch (error) {
					// Reported back so the model can correct it, and dropped from the
					// returned list so the caller never counts it as a change.
					operations.pop()
					result = `ERROR: ${error instanceof Error ? error.message : String(error)}`
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
				totalNudges++
				if (totalNudges >= MAX_TOTAL_NUDGES) {
					jobLog(`  [ai] AI unable to produce file changes after ${MAX_TOTAL_NUDGES} nudges, ending iteration`, "warn")
					break
				}
				jobLog(`  [ai] ${MAX_READ_ONLY_ITERATIONS} consecutive read-only iterations, nudging AI to produce file changes (nudge ${totalNudges}/${MAX_TOTAL_NUDGES})`, "warn")
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

// ── Plain completions (the main generation path) ────────────────────────────

/** Generation writes whole files in one response, which takes longer than a tool turn. */
const GENERATION_TIMEOUT_MS = Number(process.env.AI_GENERATION_TIMEOUT_MS || 180_000)

export interface CompleteOptions {
	system: string
	user: string
	/** Shown in the log, e.g. "plan" or "page Home". */
	label: string
	timeoutMs?: number
}

/**
 * Gemini 3 spends most of a response "thinking". These calls are fully
 * specified structured work, so a low effort is several times faster with no
 * visible loss; AI_REASONING_EFFORT overrides it ("" sends no parameter).
 */
const REASONING_EFFORT = (process.env.AI_REASONING_EFFORT ?? "low") as "low" | "medium" | "high" | ""

/**
 * One request, one answer, no tools: how Bolt, Dyad and open-lovable generate.
 * Everything the model needs is in the prompt, so it never spends a turn
 * discovering the project, and the whole answer arrives in a single response.
 */
export async function complete({ system, user, label, timeoutMs = GENERATION_TIMEOUT_MS }: CompleteOptions): Promise<string> {
	const started = Date.now()
	const response = await callWithRetry(
		getModelChain(),
		[{ role: "system", content: system }, { role: "user", content: user }],
		undefined,
		new Set<string>(),
		timeoutMs,
		REASONING_EFFORT || undefined
	)
	const content = response.choices[0]?.message?.content ?? ""
	const usage = response.usage
	const tokens = usage ? ` · ${usage.prompt_tokens} in / ${usage.completion_tokens} out tokens` : ""
	jobLog(`  [ai] ${label}: ${((Date.now() - started) / 1_000).toFixed(1)}s${tokens}`)
	if (!content.trim()) throw new Error(`The model returned an empty answer for ${label}`)
	return content
}
