import fs from "node:fs/promises"
import path from "node:path"
import { jobLog } from "./joblog.ts"
import { run, INSTALL_TIMEOUT_MS } from "./run.ts"

/**
 * Dependency reconciliation for AI-generated projects.
 *
 * Two separate things put a build into the state where it can never resolve
 * '@vitejs/plugin-react', and both are handled here:
 *
 * 1. The environment. The worker containers set NODE_ENV=production, and npm
 *    defaults `omit` to "dev" when it sees that — so devDependencies are never
 *    installed at all, and an explicit `npm install vite --save-dev` updates
 *    package.json, prints "up to date", and installs nothing. Every install
 *    issued from this file therefore passes --include=dev.
 *
 * 2. The AI. It owns package.json and can rewrite the manifest wholesale,
 *    dropping the toolchain it was told is "already installed".
 *
 * Either way the failure is self-sustaining: each repair round reinstalls from
 * the same broken premise, so the tree never comes back and the model burns
 * every repair attempt (and the provider's daily quota) on a problem that was
 * never its to solve. The toolchain is treated as ours, not the AI's:
 * re-asserted before every install, verified in node_modules after it, and
 * repaired straight from the build's own error text.
 */

/** Runtime packages the scaffold guarantees. Kept in sync with the scaffold. */
export const RUNTIME_DEPENDENCIES: Record<string, string> = {
	"react": "^19.1.0",
	"react-dom": "^19.1.0"
}

/** Build-time packages the scaffold guarantees. */
export const BUILD_DEPENDENCIES: Record<string, string> = {
	"vite": "^8.2.0",
	"@vitejs/plugin-react": "^6.0.0",
	"@types/react": "^19.1.0",
	"@types/react-dom": "^19.1.0",
	"typescript": "^5.8.0"
}

/**
 * Packages that must physically exist in node_modules for `vite build` to even
 * load its config. A missing @types/* only degrades editor types; a missing
 * plugin-react is a hard build failure, so only the latter kind is verified.
 */
const CRITICAL_MODULES = ["vite", "@vitejs/plugin-react", "react", "react-dom"]

const NODE_BUILTINS = new Set([
	"assert", "buffer", "child_process", "cluster", "console", "crypto", "dns",
	"events", "fs", "http", "http2", "https", "module", "net", "os", "path",
	"perf_hooks", "process", "querystring", "readline", "stream", "string_decoder",
	"timers", "tls", "tty", "url", "util", "v8", "vm", "worker_threads", "zlib"
])

/** npm's name grammar, minus the legacy uppercase allowance. */
const VALID_PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9-._]*\/)?[a-z0-9][a-z0-9-._]*$/

/** Cap on speculative installs so a hallucination spree cannot stall a build. */
const MAX_AUTO_INSTALL = 12

// --include=dev is mandatory: the worker sets NODE_ENV=production, which makes
// npm default to omit=dev and silently skip every devDependency — including the
// bundler. Without it `npm install vite --save-dev` writes package.json, reports
// "up to date", and installs nothing.
const INSTALL_FLAGS = "--include=dev --legacy-peer-deps --no-audit --no-fund --no-progress --loglevel=warn"

/**
 * Reduces an import specifier to the package that provides it, or null when it
 * is not an npm package at all (relative path, node builtin, Vite virtual
 * module, path alias, …).
 */
export function toPackageName(specifier: string): string | null {
	if (!specifier) return null
	if (specifier.startsWith(".") || specifier.startsWith("/")) return null
	if (specifier.startsWith("node:") || specifier.startsWith("virtual:")) return null

	const segments = specifier.split("/")
	const name = specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0]!
	if (!VALID_PACKAGE_NAME.test(name)) return null
	if (NODE_BUILTINS.has(name)) return null
	return name
}

function declaredPackages(pkg: any): Set<string> {
	return new Set([
		...Object.keys(pkg?.dependencies ?? {}),
		...Object.keys(pkg?.devDependencies ?? {}),
		...Object.keys(pkg?.peerDependencies ?? {}),
		...Object.keys(pkg?.optionalDependencies ?? {})
	])
}

function isToolchainPackage(name: string): boolean {
	return Object.prototype.hasOwnProperty.call(BUILD_DEPENDENCIES, name)
}

function pinnedVersion(name: string): string | undefined {
	return RUNTIME_DEPENDENCIES[name] ?? BUILD_DEPENDENCIES[name]
}

async function readPackageJson(projectDir: string): Promise<any | null> {
	try {
		const parsed = JSON.parse(await fs.readFile(path.join(projectDir, "package.json"), "utf-8"))
		return parsed && typeof parsed === "object" ? parsed : null
	} catch {
		return null
	}
}

/** True when the package is actually extracted in node_modules. */
export async function isInstalled(projectDir: string, name: string): Promise<boolean> {
	try {
		await fs.access(path.join(projectDir, "node_modules", ...name.split("/"), "package.json"))
		return true
	} catch {
		return false
	}
}

/**
 * Re-asserts the toolchain contract on package.json before every install:
 * valid JSON, a `build` script Vite can run, and the scaffold's dependencies
 * present regardless of what the AI wrote over them.
 */
export async function ensureProjectDependencies(projectDir: string): Promise<void> {
	const pkgPath = path.join(projectDir, "package.json")
	let pkg = await readPackageJson(projectDir)

	if (!pkg) {
		jobLog("package.json is missing or unparseable - restoring the scaffold manifest", "warn")
		pkg = { name: "vite-project", private: true, version: "0.0.0", type: "module" }
	}

	const before = JSON.stringify(pkg)

	pkg.dependencies = { ...pkg.dependencies }
	pkg.devDependencies = { ...pkg.devDependencies }
	pkg.scripts = { ...pkg.scripts }

	// A React app is an ESM Vite project, and "type" decides how Vite loads its
	// own config file.
	if (pkg.type !== "module") pkg.type = "module"

	// Vite compiles TS through esbuild. A standalone `tsc` gate only makes
	// AI-generated code fail on type warnings the bundle would tolerate.
	if (typeof pkg.scripts.build === "string" && /\btsc\b/.test(pkg.scripts.build)) {
		pkg.scripts.build = pkg.scripts.build.replace(/tsc(\s+-{1,2}[^\s&]+)*\s*&&\s*/g, "")
	}
	if (typeof pkg.scripts.build !== "string" || !pkg.scripts.build.trim()) {
		pkg.scripts.build = "vite build"
	}

	const restored: string[] = []
	for (const [name, version] of Object.entries(RUNTIME_DEPENDENCIES)) {
		if (pkg.dependencies[name] || pkg.devDependencies[name]) continue
		pkg.dependencies[name] = version
		restored.push(name)
	}
	for (const [name, version] of Object.entries(BUILD_DEPENDENCIES)) {
		if (pkg.dependencies[name] || pkg.devDependencies[name]) continue
		pkg.devDependencies[name] = version
		restored.push(name)
	}

	if (restored.length > 0) {
		jobLog(`Restoring toolchain dependencies dropped from package.json: ${restored.join(", ")}`, "warn")
	}

	if (JSON.stringify(pkg) !== before) {
		await fs.writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf-8")
	}
}

async function walkSourceFiles(directory: string, depth = 0): Promise<string[]> {
	if (depth > 6) return []
	let entries
	try {
		entries = await fs.readdir(directory, { withFileTypes: true })
	} catch {
		return []
	}
	const files: string[] = []
	for (const entry of entries) {
		if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue
		const target = path.join(directory, entry.name)
		if (entry.isDirectory()) files.push(...await walkSourceFiles(target, depth + 1))
		else if (/\.(tsx?|jsx?|mts|mjs|cts|cjs)$/.test(entry.name)) files.push(target)
	}
	return files
}

const IMPORT_PATTERNS = [
	/\bfrom\s*["']([^"']+)["']/g,
	/\bimport\s*["']([^"']+)["']/g,
	/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
	/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g
]

/** Packages the project imports but never declares in package.json. */
export async function findUndeclaredImports(projectDir: string): Promise<string[]> {
	const pkg = await readPackageJson(projectDir)
	const declared = declaredPackages(pkg)
	const missing = new Set<string>()

	for (const file of await walkSourceFiles(projectDir)) {
		let source: string
		try { source = await fs.readFile(file, "utf-8") } catch { continue }
		for (const pattern of IMPORT_PATTERNS) {
			pattern.lastIndex = 0
			let match: RegExpExecArray | null
			while ((match = pattern.exec(source)) !== null) {
				const name = toPackageName(match[1]!)
				if (name && !declared.has(name)) missing.add(name)
			}
		}
	}

	return [...missing]
}

/**
 * Extracts the package names a bundler/node failure says it could not resolve.
 * Subpaths reduce to their package ("lucide-react/icons" -> "lucide-react");
 * relative specifiers are ignored, since those are code bugs for the AI to fix.
 */
export function missingPackagesFromFailure(failure: string): string[] {
	const patterns = [
		/Cannot find package ['"]([^'"]+)['"]/g,
		/Cannot find module ['"]([^'"]+)['"]/g,
		/Could not resolve ['"]([^'"]+)['"]/g,
		/Failed to resolve import ['"]([^'"]+)['"]/g,
		/Rollup failed to resolve import ['"]([^'"]+)['"]/g,
		/Module not found:[^\n]*?['"]([^'"]+)['"]/g
	]

	const names = new Set<string>()
	for (const pattern of patterns) {
		pattern.lastIndex = 0
		let match: RegExpExecArray | null
		while ((match = pattern.exec(failure)) !== null) {
			const name = toPackageName(match[1]!)
			if (name) names.add(name)
		}
	}
	return [...names]
}

/** Installs a specific set of packages, tolerating a registry rejection. */
async function installPackages(projectDir: string, specs: string[], dev: boolean): Promise<boolean> {
	if (specs.length === 0) return false
	const command = `npm install ${specs.join(" ")} ${dev ? "--save-dev" : "--save"} ${INSTALL_FLAGS}`
	try {
		await run(command, { cwd: projectDir, timeoutMs: INSTALL_TIMEOUT_MS, stream: true })
		return true
	} catch (error) {
		// A hallucinated package name 404s here. That is the AI's problem to fix
		// on the next pass, not a reason to fail the deployment from this helper.
		jobLog(`Could not install ${specs.join(", ")}: ${(error as Error).message.split("\n")[0]}`, "warn")
		return false
	}
}

/**
 * Post-install verification. `npm install` reporting "up to date" is not proof
 * that the tree is usable: under an omit=dev default it reports exactly that
 * while installing none of the toolchain, which is the state that produced the
 * unresolvable-plugin loop.
 */
export async function ensureModulesResolvable(projectDir: string): Promise<void> {
	const missing: string[] = []
	for (const name of CRITICAL_MODULES) {
		if (!await isInstalled(projectDir, name)) missing.push(name)
	}
	if (missing.length === 0) return

	jobLog(`Toolchain packages missing from node_modules: ${missing.join(", ")} - installing them explicitly`, "warn")

	const declared = declaredPackages(await readPackageJson(projectDir))
	const spec = (name: string) => {
		if (declared.has(name)) return name
		const version = pinnedVersion(name)
		return version ? `${name}@${version}` : name
	}

	await installPackages(projectDir, missing.filter(isToolchainPackage).map(spec), true)
	await installPackages(projectDir, missing.filter(name => !isToolchainPackage(name)).map(spec), false)

	const stillMissing: string[] = []
	for (const name of missing) {
		if (!await isInstalled(projectDir, name)) stillMissing.push(name)
	}
	if (stillMissing.length > 0) {
		throw new Error(
			`Required packages are still missing after installation: ${stillMissing.join(", ")}. ` +
			`Add them to package.json with versions compatible with the existing Vite + React setup.`
		)
	}
	jobLog("Toolchain packages restored", "success")
}

/**
 * Deterministic first pass over a build failure: install what the error says is
 * missing before spending an AI repair attempt on it. Returns the packages that
 * are verifiably present afterwards, so the caller can rebuild immediately
 * instead of calling the model.
 */
export async function repairMissingDependencies(projectDir: string, failure: string): Promise<string[]> {
	const targets = missingPackagesFromFailure(failure).slice(0, MAX_AUTO_INSTALL)
	if (targets.length === 0) return []

	// A package that is already installed was not the cause — the resolver was
	// complaining about something else (a bad subpath export, say).
	const unresolved: string[] = []
	for (const name of targets) {
		if (!await isInstalled(projectDir, name)) unresolved.push(name)
	}
	if (unresolved.length === 0) return []

	const declared = declaredPackages(await readPackageJson(projectDir))
	const spec = (name: string) => {
		// Declared but absent means the tree is wrong, not the range: keep the
		// author's version. Undeclared means we choose one.
		if (declared.has(name)) return name
		const version = pinnedVersion(name)
		return version ? `${name}@${version}` : name
	}

	jobLog(`Build could not resolve ${unresolved.join(", ")} - installing before asking the AI to repair`, "warn")

	// Toolchain packages belong in devDependencies; anything else is imported by
	// application code and is therefore a runtime dependency.
	await installPackages(projectDir, unresolved.filter(isToolchainPackage).map(spec), true)
	await installPackages(projectDir, unresolved.filter(name => !isToolchainPackage(name)).map(spec), false)

	// Only report packages that genuinely landed — an install that "succeeded"
	// without producing the module must not short-circuit the AI pass.
	const installed: string[] = []
	for (const name of unresolved) {
		if (await isInstalled(projectDir, name)) installed.push(name)
	}
	return installed
}
