import fs from "node:fs/promises"
import path from "node:path"
import { complete } from "./ai.ts"
import { jobLog } from "./joblog.ts"
import { loadSkill } from "./skills.ts"
import { KIT_REFERENCE } from "./foundation.ts"
import type { AppPlan, PagePlan } from "./plan.ts"

/**
 * Step 3 of generation: the pages.
 *
 * One request per page, all pages in parallel, no tools. Each request carries
 * everything the page needs (the plan, the design tokens, the kit's exact
 * imports, the other pages' routes), so the model never spends a turn reading
 * the project, and it answers with complete files in <file path="..."> tags,
 * the way Bolt, Dyad and open-lovable stream code.
 *
 * Everything that can be checked without a model is checked without one:
 * every file is parsed with Bun's TSX parser, unknown lucide icons are swapped
 * for a real one, and only a file that is actually broken goes back to the
 * model, alone, with the exact error.
 */

const PAGE_CONCURRENCY = Math.max(1, Number(process.env.PAGE_CONCURRENCY || 3))
const FILE_REPAIRS = Math.max(0, Number(process.env.FILE_REPAIRS || 2))
/** Extra files a page may add next to itself, so one page cannot sprawl. */
const MAX_FILES_PER_PAGE = 5
const FALLBACK_ICON = "Sparkles"

// ── Prompt ──────────────────────────────────────────────────────────────────

const PAGE_RULES = `You write one page of a React 19 + TypeScript + Tailwind CSS v4 site. The project, its design system and its component kit already exist; you return only the files for this page.

OUTPUT: complete files, each wrapped exactly like this, and nothing else (no prose, no markdown fences):
<file path="src/pages/Example.tsx">
...the whole file...
</file>
The page file is required and must be at exactly the path given below. You may add up to 4 helper files (components, hooks, types, or one .css file for keyframes Tailwind cannot express), as new files under src/components/<PageComponent>/ or src/hooks/; never rewrite src/App.tsx, src/main.tsx, src/index.css, src/design.ts or src/components/ui/.

ALREADY BUILT, import these instead of recreating them (paths are from src/pages/; from src/components/<PageComponent>/ prefix one more "../"):
${KIT_REFERENCE}
The page renders inside a layout that already provides the header, navigation and footer: never add another header, nav bar or footer.

DESIGN TOKENS are the only colours you may use, as Tailwind utilities:
bg-background text-foreground · bg-card text-card-foreground · bg-primary text-primary-foreground · bg-secondary text-secondary-foreground · bg-muted text-muted-foreground · bg-accent text-accent-foreground · border-border · ring-ring
Opacity modifiers and gradients of tokens are fine (bg-primary/10, from-primary to-accent). Fonts: font-heading for headings and display text, font-body otherwise. Corners: rounded-ui (or rounded-full for pills).
NEVER use raw colours: no hex or rgb values, no bg-white, text-black, gray-*, slate-*, zinc-*, blue-*, etc., no colours in style={{}}.

CONTENT: write real, specific copy for this product: names, numbers, prices, testimonials that fit it. Never lorem ipsum, "Feature 1", "Your title here" or TODO. Images only from https://picsum.photos/seed/<one-word>/<width>/<height>, with meaningful alt text.

QUALITY: mobile-first and responsive (sm:, md:, lg:), generous spacing and a clear type scale, visible hover and focus states, semantic HTML, <button> for actions, labels on inputs. Make it look designed: committed to the mood, not a generic template.

CODE: export default function <PageComponent>(). Import every hook you use from "react". TypeScript with no any. Packages available: react, react-router-dom, lucide-react; nothing else. Type timers as ReturnType<typeof setInterval>. Clean up effects. Keep each file under about 250 lines and split the rest into src/components/<PageComponent>/ files. Write complete code: never truncate, never "...", never placeholders.`

async function pageSystemPrompt(): Promise<string> {
	const skill = await loadSkill("frontend-design")
	const aesthetics = skill?.split("## Working inside this pipeline")[0]?.trim()
	return aesthetics ? `${PAGE_RULES}\n\n--- DESIGN QUALITY GUIDANCE (the rules above win any conflict) ---\n\n${aesthetics}` : PAGE_RULES
}

function pageBrief(plan: AppPlan, page: PagePlan, prompt: string): string {
	const others = plan.pages.map((item) => `${item.name} → ${item.path}`).join(", ")
	return [
		`The user asked for: ${prompt}`,
		"",
		`Product: ${plan.name}${plan.tagline ? ` · ${plan.tagline}` : ""} (a ${plan.kind}, ${plan.layout === "bare" ? "full-screen with no site chrome" : "with site header and footer"})`,
		`Visual direction: ${plan.design.mood}; ${plan.design.mode} mode; headings in ${plan.design.fonts.heading}, body in ${plan.design.fonts.body}.`,
		`Pages in this site (link to them with <Link to>): ${others}`,
		plan.notes ? `Shared data and behaviour: ${plan.notes}` : "",
		"",
		`Write the page "${page.name}" at ${page.path}. Component name: ${page.component}. File: src/pages/${page.component}.tsx.`,
		`Purpose: ${page.purpose}`,
		page.sections.length ? `Sections, in order:\n${page.sections.map((section, index) => `${index + 1}. ${section}`).join("\n")}` : "",
	].filter(Boolean).join("\n")
}

// ── Parsing ─────────────────────────────────────────────────────────────────

interface ParsedFile {
	path: string
	content: string
	truncated: boolean
}

const stripFence = (content: string) =>
	content.replace(/^\s*```[\w-]*\s*\n/, "").replace(/\n\s*```\s*$/, "").replace(/^\n+/, "")

/**
 * Reads <file path="..."> blocks; a block the answer never closed was cut off.
 * Tolerates the variations models actually produce: filePath= or name=, and
 * single, double or no quotes.
 */
export function parseFiles(answer: string): ParsedFile[] {
	const files: ParsedFile[] = []
	const opening = /<file\s+(?:path|filePath|name)\s*=\s*["']?([^"'>\s]+)["']?[^>]*>/g
	let match: RegExpExecArray | null
	while ((match = opening.exec(answer))) {
		const start = match.index + match[0].length
		const close = answer.indexOf("</file>", start)
		const nextOpen = answer.slice(start).search(/<file\s+(?:path|filePath|name)\s*=/)
		const end = close === -1 ? (nextOpen === -1 ? answer.length : start + nextOpen) : close
		files.push({ path: match[1]!.trim().replace(/^\.?\//, ""), content: stripFence(answer.slice(start, end)), truncated: close === -1 })
		opening.lastIndex = end
	}
	return files
}

// ── Checks ──────────────────────────────────────────────────────────────────

/** A syntax error with its position, or null. Bun parses TSX in milliseconds, long before vite build would. */
export function syntaxProblem(file: string, content: string): string | null {
	if (!/\.(tsx|ts|jsx|js)$/.test(file)) return null
	try {
		new Bun.Transpiler({ loader: file.endsWith(".ts") ? "ts" : "tsx" }).transformSync(content)
		return null
	} catch (error) {
		const first = ((error as { errors?: unknown[] }).errors?.[0] ?? error) as { message?: string; position?: { line: number; column: number; lineText?: string } }
		const where = first.position ? ` at line ${first.position.line}, column ${first.position.column}: ${first.position.lineText?.trim() ?? ""}` : ""
		return `Syntax error: ${first.message ?? String(error)}${where}`
	}
}

/** Files the foundation owns. A page answer may never overwrite them. */
const PROTECTED = new Set(["src/main.tsx", "src/App.tsx", "src/index.css", "src/design.ts", "src/components/Layout.tsx"])

/**
 * Where a page may write. Its own page file, plus any new source file under
 * src/ that is not the foundation's and not claimed by another page: models
 * naturally reach for src/hooks/useGame.ts or src/components/Road.tsx, and
 * forcing everything into one folder only produced rejected files.
 */
const writablePath = (plan: AppPlan, page: PagePlan, file: string, claimed: Map<string, string>) => {
	if (file === `src/pages/${page.component}.tsx`) return true
	if (!file.startsWith("src/") || file.includes("..") || !/\.(tsx|ts|css)$/.test(file)) return false
	if (PROTECTED.has(file) || file.startsWith("src/components/ui/")) return false
	if (plan.pages.some((other) => other !== page && file === `src/pages/${other.component}.tsx`)) return false
	const owner = claimed.get(file)
	return !owner || owner === page.component
}

/**
 * The model wrote the page but not at the path asked for, typically src/App.tsx
 * for a one-screen app, or src/pages/<OtherName>.tsx. Promotes the file that is
 * clearly the page rather than failing a build that has the code it needs.
 */
function promotePageFile(page: PagePlan, files: ParsedFile[]): ParsedFile[] {
	const expected = `src/pages/${page.component}.tsx`
	if (files.some((file) => file.path === expected)) return files
	const isDefault = (file: ParsedFile) => /\.(tsx|jsx)$/.test(file.path) && /export\s+default\s+/.test(file.content)
	const candidate =
		files.find((file) => file.path.startsWith("src/pages/") && isDefault(file)) ??
		files.find((file) => file.path === "src/App.tsx" && isDefault(file)) ??
		files.filter(isDefault).sort((a, b) => b.content.length - a.content.length)[0]
	if (!candidate) return files
	jobLog(`  Using ${candidate.path} as ${expected}`, "warn")
	// The file moves folder, so its relative imports move one level too when it came from src/.
	const content = candidate.path.split("/").length === 2
		? candidate.content.replace(/(from\s+|import\s+)(["'])\.\/(?!\/)/g, "$1$2../")
		: candidate.content
	return [{ ...candidate, path: expected, content }, ...files.filter((file) => file !== candidate)]
}

function contractProblems(page: PagePlan, file: ParsedFile): string[] {
	const problems: string[] = []
	if (file.truncated) problems.push("Your answer was cut off before </file>. Return the complete file, more concisely.")
	if (file.path === `src/pages/${page.component}.tsx` && !/export\s+default\s+/.test(file.content)) {
		problems.push(`The page must have \`export default function ${page.component}()\`.`)
	}
	const syntax = syntaxProblem(file.path, file.content)
	if (syntax) problems.push(syntax)
	return problems
}

// ── Model calls ─────────────────────────────────────────────────────────────

async function writeFiles(projectDir: string, files: ParsedFile[]) {
	for (const file of files) {
		const target = path.join(projectDir, file.path)
		await fs.mkdir(path.dirname(target), { recursive: true })
		await fs.writeFile(target, file.content.endsWith("\n") ? file.content : `${file.content}\n`, "utf-8")
	}
}

/** Sends one broken file back with its exact problem; returns the fixed file or null. */
async function repairFile(system: string, brief: string, file: string, content: string, problem: string): Promise<string | null> {
	const answer = await complete({
		system,
		label: `fix ${file}`,
		user: `${brief}\n\nThe file ${file} has a problem:\n${problem}\n\nHere is the current file:\n<file path="${file}">\n${content}\n</file>\n\nReturn the complete corrected file in one <file path="${file}"> block. Change only what the problem needs; keep everything else as it is.`,
	})
	const fixed = parseFiles(answer).find((candidate) => candidate.path === file) ?? parseFiles(answer)[0]
	if (!fixed || fixed.truncated) return null
	return fixed.content
}

/** Turns one page answer into the files to write, or explains why it can't. */
function filesFromAnswer(plan: AppPlan, page: PagePlan, answer: string, claimed: Map<string, string>): { files: ParsedFile[]; problem?: string } {
	let files = parseFiles(answer)
	// A model that ignored the tags but answered with one code block still gave us the page.
	if (files.length === 0) {
		const block = /```(?:tsx|ts|jsx)?\s*\n([\s\S]*?)```/.exec(answer)?.[1]
		if (block) files = [{ path: `src/pages/${page.component}.tsx`, content: block, truncated: false }]
	}
	const returned = files.map((file) => file.path)
	files = promotePageFile(page, files)

	const rejected = files.filter((file) => !writablePath(plan, page, file.path, claimed))
	if (rejected.length > 0) jobLog(`  Ignored files this page may not write: ${rejected.map((file) => file.path).join(", ")}`, "warn")
	files = files.filter((file) => writablePath(plan, page, file.path, claimed)).slice(0, MAX_FILES_PER_PAGE)

	if (!files.some((file) => file.path === `src/pages/${page.component}.tsx`)) {
		const seen = returned.length ? `It returned: ${returned.join(", ")}.` : `It returned no <file> blocks (answer began: ${JSON.stringify(answer.slice(0, 160))}).`
		return { files, problem: `The answer had no page file. ${seen}` }
	}
	return { files }
}

async function writePage(projectDir: string, plan: AppPlan, page: PagePlan, prompt: string, system: string, claimed: Map<string, string>): Promise<string[]> {
	const brief = pageBrief(plan, page, prompt)
	const expected = `src/pages/${page.component}.tsx`
	jobLog(`Writing the ${page.name} page…`)

	let { files, problem } = filesFromAnswer(plan, page, await complete({ system, user: brief, label: `page ${page.name}` }), claimed)
	if (problem) {
		// One more try with the exact complaint, before this becomes a failed build.
		jobLog(`  ${problem} Asking again`, "warn")
		const retry = await complete({
			system,
			label: `page ${page.name} (retry)`,
			user: `${brief}\n\nYour previous answer could not be used: ${problem}\nReturn the page as <file path="${expected}">…complete file…</file>, plus any helper files in their own <file> blocks.`,
		})
		;({ files, problem } = filesFromAnswer(plan, page, retry, claimed))
		if (problem) throw new Error(`The AI did not return ${expected}. ${problem}`)
	}
	for (const file of files) if (!claimed.has(file.path)) claimed.set(file.path, page.component)

	for (const file of files) {
		let problems = contractProblems(page, file)
		for (let attempt = 1; problems.length > 0 && attempt <= FILE_REPAIRS; attempt++) {
			jobLog(`  ${file.path}: ${problems[0]} Asking the AI to fix this one file (${attempt}/${FILE_REPAIRS})`, "warn")
			const fixed = await repairFile(system, brief, file.path, file.content, problems.join("\n"))
			if (fixed) {
				file.content = fixed
				file.truncated = false
			}
			problems = contractProblems(page, file)
		}
		// Left in place: the build step reports it and gets its own repair pass.
		if (problems.length > 0) jobLog(`  ${file.path} still has a problem: ${problems[0]}`, "warn")
	}

	await writeFiles(projectDir, files)
	jobLog(`✓ ${page.name} page: ${files.map((file) => file.path).join(", ")}`, "success")
	return files.map((file) => file.path)
}

async function pool<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
	const results: R[] = new Array(items.length)
	let next = 0
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (next < items.length) {
			const index = next++
			results[index] = await task(items[index]!)
		}
	})
	await Promise.all(workers)
	return results
}

// ── Deterministic fixes after all pages exist ──────────────────────────────

let lucideNames: Set<string> | null = null

/** Every name lucide-react really exports, read from the installed package's typings. */
async function readLucideNames(projectDir: string): Promise<Set<string> | null> {
	if (lucideNames) return lucideNames
	try {
		const typings = await fs.readFile(path.join(projectDir, "node_modules/lucide-react/dist/lucide-react.d.ts"), "utf-8")
		const exported = /export\s*\{([^}]*)\}/.exec(typings)?.[1]
		if (!exported) return null
		lucideNames = new Set(exported.split(",").map((entry) => entry.trim().split(/\s+as\s+/).pop()!.trim()).filter(Boolean))
		return lucideNames
	} catch {
		return null
	}
}

/**
 * A hallucinated icon (`import { Racecar } from "lucide-react"`) fails the
 * whole build. Aliasing a real icon to the invented name keeps every usage
 * working, without a model call.
 */
export async function fixIconImports(projectDir: string, files: string[]): Promise<void> {
	const names = await readLucideNames(projectDir)
	if (!names) return
	const replaced: string[] = []
	for (const file of files.filter((candidate) => /\.(tsx|ts)$/.test(candidate))) {
		const target = path.join(projectDir, file)
		const source = await fs.readFile(target, "utf-8")
		const updated = source.replace(/import\s*\{([^}]*)\}\s*from\s*["']lucide-react["']/g, (statement, specifiers: string) => {
			const fixed = specifiers.split(",").map((raw) => {
				const entry = raw.trim()
				if (!entry) return entry
				const [imported, local] = entry.replace(/^type\s+/, "").split(/\s+as\s+/).map((part) => part.trim()) as [string, string | undefined]
				if (names.has(imported)) return entry
				replaced.push(imported)
				return `${FALLBACK_ICON} as ${local ?? imported}`
			})
			return `import { ${fixed.filter(Boolean).join(", ")} } from "lucide-react"`
		})
		if (updated !== source) await fs.writeFile(target, updated, "utf-8")
	}
	if (replaced.length > 0) jobLog(`Replaced ${replaced.length} unknown icon${replaced.length === 1 ? "" : "s"} (${[...new Set(replaced)].join(", ")}) with a real one`, "warn")
}

async function exists(file: string): Promise<boolean> {
	try {
		await fs.access(file)
		return true
	} catch {
		return false
	}
}

/** Relative imports that point at nothing, per file. */
async function brokenImports(projectDir: string, files: string[]): Promise<Map<string, string[]>> {
	const broken = new Map<string, string[]>()
	for (const file of files.filter((candidate) => /\.(tsx|ts)$/.test(candidate))) {
		const source = await fs.readFile(path.join(projectDir, file), "utf-8")
		const specifiers = [...source.matchAll(/(?:from\s+|import\s+)["'](\.{1,2}\/[^"']+)["']/g)].map((match) => match[1]!)
		for (const specifier of specifiers) {
			const base = path.join(projectDir, path.dirname(file), specifier)
			const candidates = [base, `${base}.tsx`, `${base}.ts`, `${base}.css`, path.join(base, "index.tsx"), path.join(base, "index.ts")]
			let found = false
			for (const candidate of candidates) if (await exists(candidate)) { found = true; break }
			if (!found) broken.set(file, [...(broken.get(file) ?? []), specifier])
		}
	}
	return broken
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Which page wrote each file, so a later repair can carry that page's brief. */
const owners = new WeakMap<AppPlan, Map<string, string>>()

const pageOwning = (plan: AppPlan, file: string) => {
	const component = owners.get(plan)?.get(file)
	return plan.pages.find((page) => page.component === component || file === `src/pages/${page.component}.tsx`)
}

/** Writes every page of the plan. Returns the files written. */
export async function generatePages(projectDir: string, plan: AppPlan, prompt: string): Promise<string[]> {
	const system = await pageSystemPrompt()
	const claimed = new Map<string, string>()
	owners.set(plan, claimed)
	const written = (await pool(plan.pages, PAGE_CONCURRENCY, (page) => writePage(projectDir, plan, page, prompt, system, claimed))).flat()

	await fixIconImports(projectDir, written)

	// A page may import a piece it promised but never wrote. Give it one chance to fix that alone.
	const broken = await brokenImports(projectDir, written)
	for (const [file, specifiers] of broken) {
		const page = pageOwning(plan, file)
		if (!page) continue
		jobLog(`${file} imports ${specifiers.join(", ")}, which do not exist. Asking the AI to fix this one file`, "warn")
		const content = await fs.readFile(path.join(projectDir, file), "utf-8")
		const fixed = await repairFile(system, pageBrief(plan, page, prompt), file, content,
			`It imports ${specifiers.join(", ")}, which do not exist. Import only from the kit listed above or from files you include in this answer; otherwise inline the code in this file.`)
		if (fixed && !syntaxProblem(file, fixed)) await fs.writeFile(path.join(projectDir, file), fixed, "utf-8")
	}
	return written
}

/**
 * Build-failure repair that sends only the file the error names, instead of
 * starting an agent that has to rediscover the project. Returns true when it
 * changed something worth rebuilding.
 */
export async function repairFromBuildFailure(projectDir: string, plan: AppPlan, prompt: string, failure: string): Promise<boolean> {
	const named = [...new Set([...failure.matchAll(/(src\/[\w./-]+\.(?:tsx|ts|css))/g)].map((match) => match[1]!))]
		.filter((file) => file !== "src/main.tsx")
	const system = await pageSystemPrompt()
	const excerpt = failure.length > 4_000 ? `${failure.slice(0, 2_000)}\n…\n${failure.slice(-2_000)}` : failure
	let changed = false

	for (const file of named.slice(0, 2)) {
		const target = path.join(projectDir, file)
		if (!(await exists(target))) continue
		const page = pageOwning(plan, file)
		const brief = page ? pageBrief(plan, page, prompt) : `The user asked for: ${prompt}`
		jobLog(`Build error in ${file}: asking the AI to fix that file`, "warn")
		const content = await fs.readFile(target, "utf-8")
		const fixed = await repairFile(system, brief, file, content, `The production build failed with:\n${excerpt}`)
		if (fixed && !syntaxProblem(file, fixed) && fixed !== content) {
			await fs.writeFile(target, fixed, "utf-8")
			changed = true
		}
	}
	if (changed) await fixIconImports(projectDir, named)
	return changed
}
