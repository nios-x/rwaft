import fs from "fs/promises"
import path from "path"
import OpenAI from "openai"
import type { ChatCompletionTool, ChatCompletionMessageParam } from "openai/resources/chat/completions"

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

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
	const messages: ChatCompletionMessageParam[] = [
		{ role: "system", content: SYSTEM_PROMPT },
		{ role: "user", content: prompt }
	]

	const operations: FileOperation[] = []
	let iterations = 0
	const MAX_ITERATIONS = 10

	while (iterations < MAX_ITERATIONS) {
		iterations++

		const response = await client.chat.completions.create({
			model: "gpt-4o",
			messages,
			tools,
			tool_choice: iterations === 1 ? "required" : "auto"
		})

		const choice = response.choices[0]
		if (!choice || !choice.message.tool_calls?.length) break

		// Collect tool calls and build per-call results
		messages.push(choice.message)

		for (const call of choice.message.tool_calls) {
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
