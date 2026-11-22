import fs from "node:fs/promises"
import path from "node:path"
import { complete } from "./ai.ts"
import { jobLog } from "./joblog.ts"
import { KIT_REFERENCE } from "./foundation.ts"
import { fixIconImports, parseFiles, repairFile, syntaxProblem } from "./pages.ts"
import { loadSkill } from "./skills.ts"
import { autofixUx } from "./uxcheck.ts"

/**
 * A follow-up change to an app that is already built: "make the hero darker",
 * "add a pricing page", "the contact form should ask for a phone number".
 *
 * One request carries every source file and the change. The model answers with
 * only the files it changes, each complete, in the same <file path="..."> tags
 * page generation uses. Bolt and Dyad edit the same way: whole files, never
 * diffs, because a model's diffs rarely apply to the file as it really is.
 * Every returned file is parsed before it is written, and a broken one goes
 * back to the model alone with its exact error, as pages do.
 */

const FILE_REPAIRS = Math.max(0, Number(process.env.FILE_REPAIRS || 2))
/** Source sent with a change. Beyond it the kit's own files are left out first. */
const MAX_SOURCE_CHARS = Number(process.env.EDIT_MAX_SOURCE_CHARS || 400_000)
const SOURCE_FILE = /\.(tsx|ts|css)$/
/** The skeleton every page hangs off. A change may rewrite these, never delete them. */
const UNDELETABLE = new Set(["src/App.tsx", "src/main.tsx", "src/index.css", "src/design.ts", "src/components/Layout.tsx", "index.html"])

const EDIT_RULES = `You change an existing React 19 + TypeScript + Tailwind CSS v4 site. You get every source file of the site and one change the user wants. Make that change completely, and leave everything else as it is.

OUTPUT: only the files you change or add, each complete and wrapped exactly like this, and nothing else (no prose, no markdown fences):
<file path="src/pages/Example.tsx">
...the whole file...
</file>
To delete a file: <delete path="src/components/Old.tsx" />
Never return a file you did not change. Never return part of a file, a diff, "..." or "rest unchanged": a returned file replaces the old one entirely.

HOW THIS SITE IS BUILT:
- src/App.tsx is the router: one <Route> per page; each page is src/pages/<Component>.tsx with \`export default function <Component>()\`.
- src/design.ts exports \`site\` (name, tagline, pages[{ name, path }]). The header navigation and footer in src/components/Layout.tsx read site.name and site.pages. To add a page: write src/pages/<Component>.tsx, add its <Route> in src/App.tsx, and add { name, path } to site.pages. To rename the site, change site.name and the <title> in index.html.
- Colours, fonts and the corner radius are design tokens in the @theme block of src/index.css (--color-primary, --font-heading, --radius-ui, ...). To change the palette or fonts, edit those values (and the Google Fonts @import URL) there, keep every token defined, and keep the light/dark mood consistent; src/design.ts mirrors them for reference.
- The component kit in src/components/ui/ is shared by every page (import paths as seen from src/pages/):
${KIT_REFERENCE}

RULES:
- Change only what the request needs. Keep existing copy, layout, behaviour and design unless the request is about them.
- Colours only through the token utilities (bg-primary, text-muted-foreground, border-border, bg-primary/10, ...). No raw hex or rgb, no bg-white, text-black, gray-*, slate-*, blue-* or colours in style={{}}.
- Content: real, specific copy that fits the product. Never lorem ipsum, "Feature 1" or TODO. Never invent testimonials, reviews, ratings, customer logos or user counts the user did not give. Sample emails use the .example domain. New images only as https://picsum.photos/seed/<what-it-shows>/<width>/<height>, written out literally, where <what-it-shows> is 2 to 5 lowercase hyphenated words describing the photo ("espresso-cup-on-marble-counter"); rwaft swaps it for a real photo of that. Keep existing image URLs as they are. Meaningful alt text and width and height attributes matching the URL.
- Quality: responsive (sm:, md:, lg:), visible hover and focus states, semantic HTML, <button> for actions, labels on inputs.
- Code: TypeScript with no any. Import every hook you use from "react". Packages available: react, react-router-dom, lucide-react; nothing else. Type timers as ReturnType<typeof setInterval>. Keep each file under about 250 lines; put new pieces in new files under src/components/ or src/hooks/.
- Paths: only files under src/ and index.html. Never change src/main.tsx.`

/**
 * A change meets the same UI/UX rules as a new page (skills/ui-ux-rules.md),
 * and anything it adds follows the design guidance (skills/frontend-design.md).
 * Both give way to "change only what the request needs": a follow-up never
 * restyles what nobody asked about.
 */
async function editSystemPrompt(): Promise<string> {
	const [design, ux] = await Promise.all([loadSkill("frontend-design"), loadSkill("ui-ux-rules")])
	const aesthetics = design?.split("## Working inside this pipeline")[0]?.trim()
	return [
		EDIT_RULES,
		ux ? `--- UI AND UX RULES (for what you change or add; the rules above win any conflict) ---\n\n${ux}` : "",
		aesthetics ? `--- DESIGN QUALITY GUIDANCE (only for what you add; keep the site's existing look; the rules above win any conflict) ---\n\n${aesthetics}` : "",
	].filter(Boolean).join("\n\n")
}

interface SourceFile {
	path: string
	content: string
}

const writable = (file: string) =>
	!file.includes("..") && file !== "src/main.tsx" && (file === "index.html" || (file.startsWith("src/") && SOURCE_FILE.test(file)))

/** Most useful first: the skeleton, then pages, then everything else, the shared kit last. */
const rank = (file: string) =>
	["src/App.tsx", "src/design.ts", "src/index.css", "src/components/Layout.tsx", "index.html"].includes(file) ? 0
		: file.startsWith("src/pages/") ? 1
		: file.startsWith("src/components/ui/") ? 3
		: 2

async function readSources(projectDir: string): Promise<SourceFile[]> {
	const files: SourceFile[] = []
	const walk = async (directory: string) => {
		for (const entry of await fs.readdir(path.join(projectDir, directory), { withFileTypes: true })) {
			const relative = `${directory}/${entry.name}`
			if (entry.isDirectory()) await walk(relative)
			else if (entry.isFile() && writable(relative)) files.push({ path: relative, content: await fs.readFile(path.join(projectDir, relative), "utf-8") })
		}
	}
	await walk("src")
	try {
		files.push({ path: "index.html", content: await fs.readFile(path.join(projectDir, "index.html"), "utf-8") })
	} catch { /* every scaffold has one; a missing one is restored by the build step */ }
	return files.sort((a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path))
}

function editBrief(sources: SourceFile[], request: string, history: string[]): string {
	let budget = MAX_SOURCE_CHARS
	const shown = sources.map((file) => {
		budget -= file.content.length
		// The kit is described in the rules already; its bodies are the first thing to go.
		return budget < 0 && file.path.startsWith("src/components/ui/")
			? `<file path="${file.path}">\n(left out for length: see the kit reference)\n</file>`
			: `<file path="${file.path}">\n${file.content}\n</file>`
	})
	const earlier = history.length === 0 ? [] : [
		`The site was first built from this request: ${history[0]}`,
		...(history.length > 1 ? [`Changes already made, oldest first:\n${history.slice(1).map((entry, index) => `${index + 1}. ${entry}`).join("\n")}`] : []),
		"",
	]
	// The request goes last, after the long context, where models weigh it most.
	return [...earlier, "THE CURRENT FILES:", ...shown, "", `THE CHANGE TO MAKE NOW: ${request}`].join("\n")
}

const parseDeletes = (answer: string) =>
	[...answer.matchAll(/<delete\s+(?:path|filePath|name)\s*=\s*["']?([^"'>\s]+)["']?\s*\/?>/g)].map((match) => match[1]!.trim().replace(/^\.?\//, ""))

function problemsIn(file: string, content: string, truncated: boolean): string[] {
	const problems: string[] = []
	if (truncated) problems.push("Your answer was cut off before </file>. Return the complete file, more concisely.")
	if (file.startsWith("src/pages/") && file.endsWith(".tsx") && !/export\s+default\s+/.test(content)) {
		problems.push("A page must have `export default function <Component>()`.")
	}
	const syntax = syntaxProblem(file, content)
	if (syntax) problems.push(syntax)
	return problems
}

/** Applies one requested change to the project on disk. Returns the files it wrote or deleted. */
export async function editApp(projectDir: string, request: string, history: string[]): Promise<string[]> {
	const sources = await readSources(projectDir)
	const before = new Map(sources.map((file) => [file.path, file.content]))
	const brief = editBrief(sources, request, history)
	jobLog(`Sending the AI your app's ${sources.length} source files and the change`)

	const system = await editSystemPrompt()
	let answer = await complete({ system, user: brief, label: "change" })
	if (parseFiles(answer).length === 0 && parseDeletes(answer).length === 0) {
		jobLog("The AI's answer had no file changes in it. Asking again", "warn")
		answer = await complete({
			system,
			label: "change (retry)",
			user: `${brief}\n\nYour previous answer contained no <file> blocks (it began: ${JSON.stringify(answer.slice(0, 160))}). Make the change: return every file you change, complete, in <file path="..."> blocks.`,
		})
	}

	const written: string[] = []
	const deleted: string[] = []
	for (const file of parseFiles(answer)) {
		if (!writable(file.path)) {
			jobLog(`  Ignored ${file.path}: a change may only touch src/ and index.html`, "warn")
			continue
		}
		let { content } = file
		let problems = problemsIn(file.path, content, file.truncated)
		for (let attempt = 1; problems.length > 0 && attempt <= FILE_REPAIRS; attempt++) {
			jobLog(`  ${file.path}: ${problems[0]} Asking the AI to fix this one file (${attempt}/${FILE_REPAIRS})`, "warn")
			const fixed = await repairFile(system, brief, file.path, content, problems.join("\n"))
			if (fixed) content = fixed
			problems = problemsIn(file.path, content, !fixed && file.truncated)
		}
		// A half-written replacement would lose working code; the old file is the better bet.
		if (problems.length > 0 && before.has(file.path)) {
			jobLog(`  Kept the previous ${file.path}: the new one still had a problem (${problems[0]})`, "warn")
			continue
		}
		// The usability check's own fixes (image sizes, transition-all, dvh, sample
		// emails); a change gets no extra model pass, so it stays one request.
		const polished = autofixUx(file.path, content, { prompt: request }).content
		if (polished !== content && !syntaxProblem(file.path, polished)) content = polished
		if (before.get(file.path) === content) continue
		const target = path.join(projectDir, file.path)
		await fs.mkdir(path.dirname(target), { recursive: true })
		await fs.writeFile(target, content.endsWith("\n") ? content : `${content}\n`, "utf-8")
		written.push(file.path)
	}

	for (const file of parseDeletes(answer)) {
		if (!writable(file) || UNDELETABLE.has(file) || !before.has(file) || written.includes(file)) continue
		await fs.rm(path.join(projectDir, file), { force: true })
		deleted.push(file)
	}

	const changed = [...written, ...deleted]
	if (changed.length === 0) {
		throw new Error("The AI didn't change any files for this request. Try describing the change in more detail")
	}
	await fixIconImports(projectDir, written)
	jobLog(`Changed ${changed.length} file${changed.length === 1 ? "" : "s"}: ${[...written, ...deleted.map((file) => `${file} (deleted)`)].join(", ")}`, "success")
	return changed
}
