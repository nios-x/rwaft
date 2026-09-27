/**
 * Post-build validation: things a green bundle can still be wrong about.
 */

import fs from "node:fs/promises"
import path from "node:path"
import { run } from "./run.ts"

const TYPECHECK_TIMEOUT_MS = Number(process.env.TYPECHECK_TIMEOUT_MS || 120_000)

/**
 * TypeScript codes meaning "this identifier does not exist".
 *
 * TS2304 is `Cannot find name 'x'`; TS2552 is the same with a spelling
 * suggestion attached. Both are guaranteed runtime ReferenceErrors, which is
 * what separates them from the cosmetic diagnostics we deliberately ignore.
 */
const UNDEFINED_NAME_CODES = ["TS2304", "TS2552"]

/** Picks the fatal lines out of a tsc run. Exported for testing. */
export function undefinedNameErrors(tscOutput: string): string[] {
	return tscOutput
		.split("\n")
		.filter((line) => UNDEFINED_NAME_CODES.some((code) => line.includes(`error ${code}:`)))
		.map((line) => line.trim())
}

/**
 * Fails a build that references names which do not exist.
 *
 * scaffoldViteProject deliberately rewrites the template's `tsc && vite build`
 * down to `vite build`, because tsc as a build gate fails AI-generated code on
 * cosmetic type complaints that Vite bundles through happily. That trade is the
 * right one, but it also removed the only thing catching an undefined
 * identifier — and that one is not cosmetic. A deployment shipped a
 * module-scope style object reading `playerX`, a component state variable: the
 * bundle built, five artifacts uploaded, the job reported "live", and the page
 * died on load with `Uncaught ReferenceError: playerX is not defined`.
 *
 * So run the checker and discard everything it says except the codes that mean
 * a name is not defined. The throw lands in the caller's repair loop, which
 * already knows how to ask the AI to fix a failed build.
 *
 * Deliberately fail-open. A non-zero exit is the normal case here (cosmetic
 * errors are expected), and if the checker cannot run at all there are no
 * matching lines, so a missing toolchain lets the build through rather than
 * blocking every deploy.
 */
export async function assertNoUndefinedIdentifiers(projectDir: string): Promise<void> {
	let output: string
	try {
		output = (await run("npx --no-install tsc --noEmit", {
			cwd: projectDir,
			timeoutMs: TYPECHECK_TIMEOUT_MS
		})).output
	} catch (error) {
		// tsc exits non-zero for ANY diagnostic, so this is the expected path.
		output = error instanceof Error ? error.message : String(error)
	}

	const fatal = undefinedNameErrors(output)
	if (fatal.length === 0) return

	throw new Error(
		`The code references names that do not exist, so the page would crash on load ` +
		`even though the bundle built:\n\n${fatal.join("\n")}\n\n` +
		`A value that lives inside a component (state, props, a local) cannot be read ` +
		`from module scope. Move the usage inside the component, or lift the value out of it.`
	)
}

/**
 * Patterns that build fine and still ship a broken or obviously unfinished
 * site. Each one has cost a real deployment: a BrowserRouter app rendering
 * nothing under its /<id>/ sub-path, hero images from a dead placeholder host,
 * nav links that go nowhere. Only source files under src/ are scanned.
 */
const PLACEHOLDER_RULES: Array<{ pattern: RegExp; reason: string }> = [
	{ pattern: /lorem ipsum/i, reason: "lorem ipsum placeholder copy - write real content for the domain" },
	{ pattern: /\b(TODO|FIXME)\b/, reason: "unfinished TODO/FIXME - implement it" },
	{ pattern: /href=["']#["']/, reason: 'dead link href="#" - link to a real view (hash route) or use a <button> with a handler' },
	{ pattern: /on[A-Z]\w*=\{\s*\(\s*\w*\s*\)\s*=>\s*(\{\s*\}|null|undefined)\s*\}/, reason: "event handler that does nothing - wire it to real behaviour" },
	{ pattern: /\balert\s*\(/, reason: "alert() used for feedback - show an in-app toast or inline message" },
	{ pattern: /source\.unsplash\.com|via\.placeholder\.com/, reason: "image host that no longer serves images - use https://picsum.photos/seed/<word>/<w>/<h>" },
	{ pattern: /<BrowserRouter\b|createBrowserRouter\s*\(/, reason: "BrowserRouter renders nothing when the site is served from a sub-path - use HashRouter or hash-based navigation" },
	{ pattern: /(?:href|src)=["']\/(?!\/)[^"']*["']/, reason: "root-absolute URL breaks under the sub-path the site is served from - use a hash route (#/page) or an imported asset" },
	{ pattern: /coming soon/i, reason: '"coming soon" feature - implement it or remove the control' }
]

const MAX_PLACEHOLDER_ISSUES = 25

async function listSourceFiles(directory: string, depth = 0): Promise<string[]> {
	if (depth > 6) return []
	let entries
	try {
		entries = await fs.readdir(directory, { withFileTypes: true })
	} catch {
		return []
	}
	const files: string[] = []
	for (const entry of entries) {
		const target = path.join(directory, entry.name)
		if (entry.isDirectory()) files.push(...await listSourceFiles(target, depth + 1))
		else if (/\.(tsx|jsx|ts|js)$/.test(entry.name)) files.push(target)
	}
	return files
}

/**
 * Advisory scan for placeholder content and dead UI in src/. Returns
 * "file:line: reason" strings; never throws. Callers feed these back to the
 * model as a polish pass rather than failing the build on them.
 */
export async function findPlaceholderIssues(projectDir: string): Promise<string[]> {
	const issues: string[] = []
	for (const file of await listSourceFiles(path.join(projectDir, "src"))) {
		let source: string
		try { source = await fs.readFile(file, "utf-8") } catch { continue }
		const relative = path.relative(projectDir, file)
		source.split(/\r?\n/).forEach((line, index) => {
			for (const { pattern, reason } of PLACEHOLDER_RULES) {
				if (issues.length >= MAX_PLACEHOLDER_ISSUES) return
				if (pattern.test(line)) issues.push(`${relative}:${index + 1}: ${reason} (\`${line.trim().slice(0, 100)}\`)`)
			}
		})
	}
	return issues
}
