import fs from "fs/promises"
import path from "path"
import OpenAI from "openai"
import type { ChatCompletionTool, ChatCompletionMessageParam } from "openai/resources/chat/completions"
import { executeToolRequest, executeOperation } from "./tools.ts"
import { jobLog } from "./joblog.ts"
import { composeSystemPrompt } from "./skills.ts"
import "./config.ts"

// ── Client factory ──────────────────────────────────────────────────────────

function getGeminiClient(apiKey: string): OpenAI {
	return new OpenAI({
		baseURL: process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai/",
		apiKey,
		fetch: globalThis.fetch
	})
}

function getOpenRouterClientForKey(apiKey: string): OpenAI {
	return new OpenAI({
		baseURL: "https://openrouter.ai/api/v1",
		apiKey,
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
	"gemini-3.5-flash"
]

interface GeminiApiKey {
	key: string
	label: string
}

interface OpenRouterApiKey {
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

function getOpenRouterApiKeys(): OpenRouterApiKey[] {
	const entries: OpenRouterApiKey[] = []
	for (let index = 7; index >= 1; index--) {
		const key = process.env[`OPENROUTER_API_KEY${index}`]
		if (key) entries.push({ key, label: `OpenRouter key ${index}` })
	}
	if (process.env.OPENROUTER_API_KEY) {
		entries.unshift({ key: process.env.OPENROUTER_API_KEY, label: "OpenRouter default key" })
	}

	const seen = new Set<string>()
	return entries.filter(entry => {
		if (seen.has(entry.key)) return false
		seen.add(entry.key)
		return true
	})
}

function getModelChain(): ModelEntry[] {
	const geminiKeys = getGeminiApiKeys()
	const chain: ModelEntry[] = []

	// Try OpenRouter first, but move to Gemini after five failed requests.
	const openRouterModel = process.env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-lightning:free"
	for (const entry of getOpenRouterApiKeys()) {
		chain.push({
			client: () => getOpenRouterClientForKey(entry.key),
			model: openRouterModel!,
			provider: entry.label
		})
	}

	if (geminiKeys.length > 0) {
		const start = nextGeminiKey % geminiKeys.length
		nextGeminiKey = (nextGeminiKey + 1) % geminiKeys.length
		const rotatedKeys = [...geminiKeys.slice(start), ...geminiKeys.slice(0, start)]
		const configuredModel = process.env.AI_MODEL
		const models = configuredModel
			? [configuredModel, ...DEFAULT_GEMINI_MODELS.filter(model => model !== configuredModel)]
			: DEFAULT_GEMINI_MODELS

		for (const model of models) {
			chain.push(...rotatedKeys.map(entry => ({
				client: () => getGeminiClient(entry.key),
				model,
				provider: entry.label
			})))
		}
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
const MAX_OPENROUTER_ATTEMPTS = 7
const RETRY_BASE_MS = 2_000
// Generous because a first pass routinely writes a whole page component in one
// call, and a slow free-tier model can spend well over a minute on that.
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 120_000)

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function isRetryable(error: unknown): boolean {
	if (error && typeof error === "object" && "status" in error) {
		const status = (error as any).status
		return status === 429 || status === 503 || status === 500 || status === 502
	}
	return false
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
	exhaustedEntries: Set<string>
) {
	let openRouterFailures = 0

	for (const entry of modelChain) {
		const entryId = `${entry.model}:${entry.provider}`
		if (exhaustedEntries.has(entryId)) continue
		const isOpenRouter = entry.provider.startsWith("OpenRouter")
		if (isOpenRouter && openRouterFailures >= MAX_OPENROUTER_ATTEMPTS) continue

		const client = entry.client()
		for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
			if (isOpenRouter && openRouterFailures >= MAX_OPENROUTER_ATTEMPTS) break
			const controller = new AbortController()
			const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)
			try {
				jobLog(`  [ai] Calling ${entry.model} via ${entry.provider} (attempt ${attempt})`)
				const response = await client.chat.completions.create({
					model: entry.model,
					messages,
					...(tools ? { tools } : {})
				}, { signal: controller.signal })
				return response
			} catch (error: unknown) {
				const status = (error as any)?.status
				const timedOut = controller.signal.aborted
				const message = timedOut
					? `request timed out after ${AI_TIMEOUT_MS}ms`
					: (error as Error).message?.slice(0, 100)
				const errorResponse = getErrorResponse(error)
				if (isOpenRouter) openRouterFailures++
				jobLog(`  ⚠ ${entry.model} error (${status || "timeout"}): ${message}`, "warn")
				if (errorResponse) jobLog(`  [ai] Provider response: ${errorResponse}`, "warn")
				if (isOpenRouter && openRouterFailures >= MAX_OPENROUTER_ATTEMPTS) {
					jobLog(`  [ai] OpenRouter reached ${MAX_OPENROUTER_ATTEMPTS} failed requests; switching to Gemini`, "warn")
				}

				if (!timedOut && (status === 429 || !isRetryable(error) || attempt === MAX_RETRIES)) {
					// Non-retryable or exhausted retries → try next model
					break
				}
				if (attempt === MAX_RETRIES) break
				const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1)
				jobLog(`  [ai] Retrying in ${delay}ms...`)
				await sleep(delay)
			} finally {
				clearTimeout(timer)
			}
		}
		exhaustedEntries.add(entryId)
		jobLog(`  [ai] Model ${entry.model} exhausted, trying next fallback...`)
	}
	throw new Error("All AI models exhausted — no successful response")
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

const SYSTEM_PROMPT = `You are a senior product engineer and designer building a complete, working web application — the kind a real user would open and actually use, not a mockup.

You receive a Vite + React 19 + TypeScript project that has already been scaffolded and installed:
- src/main.tsx — the entry point that mounts <App /> (DO NOT modify this file)
- src/App.tsx — a stub you MUST replace with the real application
- src/index.css — a minimal stylesheet you should replace (keep its first line, see below)
- react, react-dom, lucide-react (icons), Tailwind CSS v4 and the Vite toolchain are installed

HOW THE WORKSPACE BEHAVES
- Every file tool is applied to disk immediately. read_file always returns the current content, including files you wrote this session, and a tool result starting with ERROR means that change did NOT happen — fix the call and retry it.
- When you stop calling tools, the system runs the production build and a type check. If either fails you get the errors back in this conversation and must fix them. You are finished only when the build passes.
- The finished site is served from a sub-path (e.g. https://host/<id>/), so root-absolute URLs break in production.

WORKFLOW
1. Read the product brief (if one is given) and the user's request. Decide the views, the data model and the visual language before writing code.
2. Write the foundations first: shared TypeScript types, seed data, a small store/hook for state and persistence, then src/index.css with @theme tokens.
3. Build the app shell and each view as its own component under src/components/ (or src/views/), then wire them all into src/App.tsx. Write each file completely in one write_file call.
4. Re-read anything you are unsure about and fix inconsistencies (props, exports, imports) before you stop.

FUNCTIONALITY — this is what separates a real app from slop
- Every button, link, tab, toggle, form and menu must DO something real. No dead controls, no href="#", no onClick={() => {}}, no "coming soon".
- Implement the core feature end to end. A todo app adds, edits, completes, deletes and filters; a store has a working cart with quantities and totals; a dashboard's filters actually filter; a game is playable with win/lose/restart.
- Keep state in React (useState/useReducer/context). Persist user-created data to localStorage (read with a safe JSON.parse fallback) so a reload keeps it.
- Navigation: switch views with React state or the URL hash (window.location.hash + a hashchange listener). Do NOT use BrowserRouter or root-absolute links like href="/about" — they break on the sub-path. If you install react-router-dom, use HashRouter.
- Forms validate input, show inline errors, disable submit while invalid, and confirm success in the UI (toast, inline message, updated list). Never use alert() for feedback.
- Handle empty states ("No tasks yet — add your first"), search/filter with no results, and destructive actions (confirm or undo).
- There is no backend. Ship realistic seed data in a src/data file and simulate async work with state when useful. Do not call APIs that need keys.

CONTENT & VISUALS
- Write real, specific copy for the domain: product names, prices, bios, stats, testimonials. Never lorem ipsum, "Item 1", "Feature title" or "Your text here".
- Use lucide-react for icons (import { Search } from "lucide-react"). Do not hand-roll icon SVG paths.
- For photos use https://picsum.photos/seed/<descriptive-word>/<w>/<h> (always resolves) or CSS gradients / illustrations. Never use source.unsplash.com or via.placeholder.com — they are dead. Always set width/height or aspect-ratio and alt text.
- Responsive from 360px to wide desktop, visible keyboard focus, semantic HTML (header/nav/main/section/button/label), WCAG AA contrast.

CRITICAL RULES
- You MUST replace src/App.tsx. It is the root component and must import and render your components. Do NOT leave the stub ("Hello" / "app-root").
- Every component file you create must be used. No orphan or speculative components.
- Only use the provided tools. Do NOT output code in plain text.
- Do NOT modify src/main.tsx or index.html. App.tsx must only export the component — never call createRoot, hydrateRoot or ReactDOM.render there.
- Every imported module must exist: relative files you created, or packages in package.json. Add packages with install_package, never by hand-editing package.json.

TOOLING RULES
- Use write_file for whole files, edit_file for one exact search/replace, multi_patch_file for several in one file. read_file a file before patching it; search strings must match exactly and uniquely.
- Use list_files, search_files, find_symbol and find_references to inspect the workspace; run_command runs a shell command (e.g. "npm run build" to check your work early).
- All paths are relative to the project root (e.g. "src/components/Header.tsx").
- Write complete, production-quality code. No placeholders or TODOs.
- Tailwind CSS v4 is installed and wired up: vite.config.ts registers tailwindcss() from @tailwindcss/vite, and src/index.css starts with @import "tailwindcss". If you rewrite vite.config.ts keep BOTH react() and tailwindcss(); if you rewrite src/index.css keep that @import (a Google Fonts @import url(...) may sit next to it — all @imports come first). Dropping either ships an unstyled page without failing the build.
- This is Tailwind v4, configured in CSS: declare tokens with @theme in src/index.css. Do NOT create tailwind.config.js/ts and do NOT use @tailwind base/components/utilities.
- Import each React hook from "react" in the file that uses it. Use type-only imports for types (verbatimModuleSyntax is on).
- Do NOT use the NodeJS namespace (NodeJS.Timeout); use ReturnType<typeof setTimeout>.
- Do not add tsconfig options unsupported by the installed TypeScript (e.g. erasableSyntaxOnly). Keep tsconfig.json compilerOptions.jsx "react-jsx".
- Values that live inside a component (state, props, locals) cannot be read from module scope — that compiles but crashes on load.
- When repairing a failed build, inspect every named file and the types/modules it imports, then fix all reported errors in one coherent pass. Never hide errors with any, @ts-ignore or broad casts, and never replace requested functionality with a placeholder.`

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

// ── Planning pass ───────────────────────────────────────────────────────────

const PLANNER_PROMPT = `You are the product lead for an AI app builder. Turn a short user request into a precise, buildable product brief for a single-page React app that an engineer will implement in one pass.

Constraints the app must live within: client-side only (React 19 + TypeScript + Tailwind v4 + lucide-react icons), no backend and no API keys, state in React persisted to localStorage, navigation by React state or URL hash, served from a sub-path.

Write the brief in compact markdown with exactly these sections:
## Concept — app name, one-sentence pitch, who it is for.
## Design direction — a specific aesthetic that fits the domain (not generic SaaS), a palette of 5-6 hex colors with roles (background, surface, text, muted, accent, danger), a Google Fonts pairing (display + body; avoid Inter/Roboto/Arial), and the signature visual detail people will remember.
## Views — every screen/section, in order, with what it shows and its primary actions.
## Features — the concrete behaviours, as testable statements ("Adding a task with an empty title shows an inline error and does not save"). Cover the full core loop plus empty states, search/filter, and edit/delete where they apply.
## Data — TypeScript-style shape of each entity, what is persisted to localStorage, and 6-12 realistic seed records described concretely (real-sounding names, prices, dates).
## Copy — the hero headline, key labels and empty-state messages, written for the domain.

Be ambitious about polish but keep scope buildable: roughly 5-12 components. Honour everything the user explicitly asked for; fill gaps with sensible, specific choices. Do not write code.`

/**
 * One tool-free call that expands a terse prompt ("a habit tracker") into a
 * concrete brief. Generation quality tracks prompt specificity far more than
 * anything else, and users rarely write specific prompts. Best effort: any
 * failure falls back to the raw prompt.
 */
export async function planApplication(prompt: string): Promise<string | undefined> {
	try {
		const response = await callWithRetry(getModelChain(), [
			{ role: "system", content: PLANNER_PROMPT },
			{ role: "user", content: prompt }
		], undefined, new Set())
		const brief = response.choices[0]?.message?.content?.trim()
		return brief && brief.length > 200 ? brief : undefined
	} catch (error) {
		jobLog(`  [ai] Planning pass failed, building from the raw prompt: ${(error as Error).message}`, "warn")
		return undefined
	}
}

// ── Main generation function ────────────────────────────────────────────────

export interface GenerateOptions {
	/**
	 * Skill files (build-services/skills/<name>.md) to append to the system
	 * prompt for this pass. Left empty by default so a repair conversation
	 * carries only the rules it needs.
	 */
	skills?: string[]
	/**
	 * Runs when the model says it is done. Returns failure text (fed back into
	 * the same conversation for another round) or null when the project is
	 * good. Fixing inside the conversation that wrote the code beats a cold
	 * repair pass: the model still knows what every file is for.
	 */
	verify?: () => Promise<string | null>
	/** Advisory checks (placeholder content, dead links); reported once, never fatal. */
	review?: () => Promise<string[]>
	/** How many times `verify` may send the model back to work. */
	maxVerifyRounds?: number
	maxIterations?: number
}

const DEFAULT_MAX_ITERATIONS = Number(process.env.AI_MAX_ITERATIONS || 40)

/** Turns a tool call into a file operation, or an error string for the model. */
function toFileOperation(name: string, args: Record<string, any>): FileOperation | string {
	const needsPath = () => !args.path || typeof args.path !== "string"
	const pathError = "ERROR: path argument is required and must be a non-empty string. Use the 'path' parameter."
	switch (name) {
		case "create_file":
		case "write_file":
			if (needsPath()) return pathError
			if (typeof args.content !== "string") return "ERROR: content argument is required and must be the complete file text."
			return { tool: name, path: args.path, content: args.content }
		case "replace_file":
			if (needsPath()) return pathError
			if (typeof args.content !== "string") return "ERROR: content argument is required and must be the complete file text."
			return { tool: "replace_file", path: args.path, content: args.content }
		case "patch_file":
		case "edit_file":
			if (needsPath()) return pathError
			if (typeof args.search !== "string" || !args.search) return "ERROR: search argument is required and must be the exact text to replace."
			return { tool: name, path: args.path, search: args.search, replace: String(args.replace ?? "") }
		case "multi_patch_file":
		case "multi_edit_file":
		case "patch_multiple":
		case "multi_patch":
		case "batch_patch": {
			if (needsPath()) return pathError
			let rawPatches = args.patches || args.edits || args.chunks || args.replacements || args.changes
			if (typeof rawPatches === "string") {
				try { rawPatches = JSON.parse(rawPatches) } catch { rawPatches = [] }
			}
			if (!Array.isArray(rawPatches) || rawPatches.length === 0) {
				return "ERROR: patches argument is required and must be a non-empty array of { search, replace } objects."
			}
			const patches: MultiPatchChunk[] = []
			for (const p of rawPatches) {
				if (!p || typeof p !== "object") continue
				const search = p.search ?? p.old_str ?? p.old ?? p.find ?? p.target
				const replace = p.replace ?? p.new_str ?? p.new ?? p.replacement ?? ""
				if (typeof search === "string" && search.length > 0) patches.push({ search, replace: String(replace) })
			}
			if (patches.length === 0) return "ERROR: No valid search/replace patches found in the patches array."
			return { tool: "multi_patch_file", path: args.path, patches }
		}
		case "delete_file":
			if (needsPath()) return pathError
			return { tool: "delete_file", path: args.path }
		case "move_file":
		case "copy_file":
			if (needsPath() || !args.to || typeof args.to !== "string") {
				return "ERROR: both 'path' and 'to' arguments are required and must be non-empty strings."
			}
			return { tool: name, path: args.path, to: args.to }
		case "create_directory":
			if (needsPath()) return pathError
			return { tool: "create_directory", path: args.path }
		default:
			return `ERROR: Unknown tool "${name}". Use one of: ${toolSpecs.map(spec => spec.name).join(", ")}.`
	}
}

const READ_TOOLS = new Set([
	"list_files", "read_file", "find_file", "search_files", "find_symbol", "find_references",
	"get_file_metadata", "run_command", "run_background_command", "kill_process",
	"get_process_output", "open_terminal", "set_environment_variable", "install_package", "run_script"
])

/**
 * Runs a tool-calling conversation against the project. File operations are
 * applied to disk as they arrive, so the model's reads, searches and builds
 * see its own work. The returned list is what was successfully applied; it is
 * informational — callers must not apply it again.
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
	const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS
	const maxVerifyRounds = options.maxVerifyRounds ?? 3
	let iterations = 0
	let verifyRounds = 0
	let reviewed = !options.review
	let consecutiveReadOnlyIterations = 0
	const MAX_READ_ONLY_ITERATIONS = 3
	let totalNudges = 0
	const MAX_TOTAL_NUDGES = 3

	while (iterations < maxIterations) {
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

		if (!message.tool_calls?.length) {
			// The model thinks it is done. Check that claim before accepting it.
			if (options.verify && verifyRounds < maxVerifyRounds && operations.length > 0) {
				verifyRounds++
				jobLog(`  [ai] Verifying the build (${verifyRounds}/${maxVerifyRounds})...`)
				const failure = await options.verify()
				if (failure) {
					jobLog("  [ai] Build failed - sending the errors back to the model", "warn")
					messages.push({ role: "assistant", content: message.content || "Done." })
					messages.push({
						role: "user",
						content: `The production build failed. Your changes are on disk; fix the root cause of every error below with the file tools, then stop again to re-run the check.\n\n${truncateResult(failure)}`
					})
					continue
				}
				jobLog("  [ai] Build verified", "success")
			}
			if (!reviewed && options.review) {
				reviewed = true
				const issues = await options.review()
				if (issues.length > 0) {
					jobLog(`  [ai] Review found ${issues.length} placeholder/dead-UI issue(s) - asking for a polish pass`, "warn")
					messages.push({ role: "assistant", content: message.content || "Done." })
					messages.push({
						role: "user",
						content: `The app builds. A review found these problems that make it feel unfinished or broken in production. Fix each one properly (real behaviour, real content, working navigation), then stop:\n\n${issues.map(issue => `- ${issue}`).join("\n")}`
					})
					// A polish pass can break the build, so it earns one more check.
					if (verifyRounds >= maxVerifyRounds) verifyRounds = maxVerifyRounds - 1
					continue
				}
			}
			break
		}

		// Feed the assistant message back so the model maintains conversation context
		messages.push(message)

		let iterationProducedOperation = false

		for (const call of message.tool_calls) {
			// Gracefully handle malformed JSON in tool call arguments
			let args: Record<string, any>
			try {
				args = JSON.parse(call.function.arguments || "{}")
			} catch (parseError) {
				jobLog(`  ⚠ malformed JSON in tool call ${call.function.name}: ${(parseError as Error).message}`, "warn")
				messages.push({
					role: "tool",
					tool_call_id: call.id,
					content: "ERROR: Malformed JSON in function arguments. Please resend with valid JSON."
				})
				continue
			}

			const name = call.function.name
			// The AI sometimes uses file_path instead of path
			if (!args.path && args.file_path) args.path = args.file_path

			let result: string
			if (READ_TOOLS.has(name)) {
				try {
					result = truncateResult(await executeToolRequest(projectDir, name, args))
				} catch (error) {
					result = `ERROR: ${truncateResult(error instanceof Error ? error.message : String(error))}`
				}
			} else {
				const operation = toFileOperation(name, args)
				if (typeof operation === "string") {
					jobLog(`  ⚠ ${name}: ${operation}`, "warn")
					result = operation
				} else {
					try {
						await executeOperation(projectDir, operation)
						operations.push(operation)
						iterationProducedOperation = true
						result = `OK: ${operation.tool} ${operation.path} applied`
					} catch (error) {
						const reason = error instanceof Error ? error.message : String(error)
						jobLog(`  ⚠ ${operation.tool} ${operation.path} — ${reason}`, "warn")
						result = `ERROR: ${reason}. The file was NOT changed. read_file it and retry with text that matches exactly.`
					}
				}
			}

			messages.push({
				role: "tool",
				tool_call_id: call.id,
				content: result
			})
		}

		// Track consecutive read-only iterations and nudge the AI
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
		// Deliberately no break on finish_reason "stop" here: several providers
		// report "stop" alongside tool calls, and breaking then cut generation
		// off after the first batch of files. The model ends the pass by
		// replying without tool calls.
	}

	if (iterations >= maxIterations) jobLog(`  [ai] Reached the ${maxIterations}-iteration limit`, "warn")
	return operations
}
