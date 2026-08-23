import fs from "fs/promises"
import path from "path"
import OpenAI from "openai"
import type { ChatCompletionTool, ChatCompletionMessageParam } from "openai/resources/chat/completions"
import "./config.ts"

// ── Client factory ──────────────────────────────────────────────────────────

function getGeminiClient(): OpenAI {
	return new OpenAI({
		baseURL: process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai/",
		apiKey: process.env.GEMINI_API_KEY || "",
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
}

function getModelChain(): ModelEntry[] {
	const primary = process.env.AI_MODEL || "gemini-2.5-flash"
	const chain: ModelEntry[] = [
		{ client: getGeminiClient, model: primary },
	]

	// Add OpenRouter fallbacks if key is available
	if (process.env.OPENROUTER_API_KEY) {
		chain.push(
			{ client: getOpenRouterClient, model: "google/gemini-2.5-flash:free" },
			{ client: getOpenRouterClient, model: "google/gemma-4-27b-it:free" }
		)
	}

	return chain
}

// ── Retry helper ────────────────────────────────────────────────────────────

const MAX_RETRIES = parseInt(process.env.AI_MAX_RETRIES || "3", 10)
const RETRY_BASE_MS = 2_000

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
			try {
				console.log(`  [ai] Calling ${entry.model} (attempt ${attempt})`)
				const response = await client.chat.completions.create({
					model: entry.model,
					messages,
					tools
				})
				return response
			} catch (error: unknown) {
				const status = (error as any)?.status
				console.warn(`  ⚠ ${entry.model} error (${status}): ${(error as Error).message?.slice(0, 100)}`)

				if (!isRetryable(error) || attempt === MAX_RETRIES) {
					// Non-retryable or exhausted retries → try next model
					break
				}
				const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1)
				console.log(`  [ai] Retrying in ${delay}ms...`)
				await sleep(delay)
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
export type FileOperation = CreateFileOp | PatchFileOp | ReplaceFileOp

// ── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior frontend engineer. The user will describe a web application.
You will receive a Vite + React + TypeScript project that has already been scaffolded with the default template.

Your job is to use the provided tools to create and modify files so the project implements what the user asked for.

Rules:
- Only use the provided tools (find_file, create_file, patch_file, replace_file). Do NOT output code in plain text.
- Use find_file to read an existing file's content before patching it. This ensures your search strings match exactly.
- Use patch_file when you need to change a small part of an existing file. The "search" string must match EXACTLY.
- Use replace_file when you need to rewrite most of an existing file.
- Use create_file for brand-new files that don't exist yet.
- All file paths are relative to the project root (e.g. "src/App.tsx", "src/components/Header.tsx").
- Write complete, production-quality code. No placeholders or TODOs.
- You may add CSS files, components, assets, and new dependencies (via patch_file on package.json).
- Make sure the app compiles and builds cleanly with "npm run build".`

// ── Tool definitions ────────────────────────────────────────────────────────

const tools: ChatCompletionTool[] = [
	{
		type: "function",
		function: {
			name: "find_file",
			description: "Read an existing file's content. Use this to inspect a file before patching it so your search strings are exact.",
			parameters: {
				type: "object",
				properties: {
					path: { type: "string", description: "Relative file path from project root (e.g. src/App.tsx)" }
				},
				required: ["path"]
			}
		}
	},
	{
		type: "function",
		function: {
			name: "create_file",
			description: "Create a new file at the given path with the given content. Use for files that do not exist yet.",
			parameters: {
				type: "object",
				properties: {
					path: { type: "string", description: "Relative file path from project root (e.g. src/App.tsx)" },
					content: { type: "string", description: "Full file content to write" }
				},
				required: ["path", "content"]
			}
		}
	},
	{
		type: "function",
		function: {
			name: "patch_file",
			description: "Find an exact substring in an existing file and replace it. Use for small, targeted edits.",
			parameters: {
				type: "object",
				properties: {
					path: { type: "string", description: "Relative file path from project root" },
					search: { type: "string", description: "Exact substring to find (must match character-for-character)" },
					replace: { type: "string", description: "Replacement string" }
				},
				required: ["path", "search", "replace"]
			}
		}
	},
	{
		type: "function",
		function: {
			name: "replace_file",
			description: "Overwrite an existing file's entire content. Use when most of the file needs to change.",
			parameters: {
				type: "object",
				properties: {
					path: { type: "string", description: "Relative file path from project root" },
					content: { type: "string", description: "New complete file content" }
				},
				required: ["path", "content"]
			}
		}
	}
]

// ── Main generation function ────────────────────────────────────────────────

export async function generateToolCalls(prompt: string, projectDir: string): Promise<FileOperation[]> {
	const modelChain = getModelChain()

	const messages: ChatCompletionMessageParam[] = [
		{ role: "system", content: SYSTEM_PROMPT },
		{ role: "user", content: prompt }
	]

	const operations: FileOperation[] = []
	let iterations = 0
	const MAX_ITERATIONS = 10

	while (iterations < MAX_ITERATIONS) {
		iterations++

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

		for (const call of message.tool_calls) {
			const args = JSON.parse(call.function.arguments)
			const name = call.function.name
			let result = "OK"

			switch (name) {
				case "find_file": {
					// Read-only — return file content to the model
					const target = path.resolve(projectDir, args.path)
					try {
						result = await fs.readFile(target, "utf-8")
						console.log(`  ✓ find    ${args.path}`)
					} catch {
						result = `ERROR: file not found — ${args.path}`
						console.warn(`  ⚠ find    ${args.path} — not found`)
					}
					break
				}
				case "create_file":
					operations.push({ tool: "create_file", path: args.path, content: args.content })
					break
				case "patch_file":
					operations.push({ tool: "patch_file", path: args.path, search: args.search, replace: args.replace })
					break
				case "replace_file":
					operations.push({ tool: "replace_file", path: args.path, content: args.content })
					break
			}

			messages.push({
				role: "tool",
				tool_call_id: call.id,
				content: result
			})
		}

		// If the model indicated it's done (stop or no more tool calls), break
		if (choice.finish_reason === "stop") break
	}

	return operations
}
