import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import http from "node:http"
import {
	cloudinary,
	cloudinaryConfig,
	createRedisClient,
	getRawAssetUrl,
	DEPLOY_QUEUE,
	PROMPT_QUEUE,
	DEPLOY_PROCESSING,
	PROMPT_PROCESSING,
	DEPLOYMENT_STATUS_PREFIX
} from "./lib/config.ts"
import { getAllFileNames } from "./lib/helper.ts"
import { uploadFile } from "./lib/upload.ts"
import { generateToolCalls } from "./lib/ai.ts"
import { applyOperations, releaseJobState } from "./lib/tools.ts"
import {
	runWithJobContext,
	jobLog,
	jobStatus,
	flushLogs,
	closeLogPublisher,
	type JobKind
} from "./lib/joblog.ts"
import { run, installDependencies, buildProject } from "./lib/run.ts"

console.log("[build-services] Cloudinary config:", {
	cloud_name: cloudinaryConfig.cloud_name,
	api_key: cloudinaryConfig.api_key ? `...${cloudinaryConfig.api_key.slice(-4)}` : "MISSING",
	api_secret: cloudinaryConfig.api_secret ? "SET" : "MISSING",
	upload_preset: cloudinaryConfig.upload_preset || "NONE"
})

/**
 * Build scratch space. Defaults to the OS temp dir rather than a folder inside
 * the deployed source tree: on Render the application directory is small, and
 * writing multi-hundred-megabyte node_modules trees into it is what exhausts
 * the container disk mid-build.
 */
const root = process.env.BUILD_ROOT || path.join(os.tmpdir(), "rwaft-builds")

const UPLOAD_BATCH_SIZE = Number(process.env.UPLOAD_BATCH_SIZE || 8)
const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS || 15 * 60_000)
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 30_000)
const CLOUDINARY_API_TIMEOUT_MS = Number(process.env.CLOUDINARY_API_TIMEOUT_MS || 60_000)
const STATUS_TTL_SECONDS = Number(process.env.STATUS_TTL_SECONDS || 24 * 60 * 60)
/** How long BLMOVE parks before looping, so shutdown stays responsive. */
const QUEUE_BLOCK_SECONDS = Number(process.env.QUEUE_BLOCK_SECONDS || 5)
/** Abandon a build directory older than this during periodic sweeps. */
const STALE_BUILD_MS = Number(process.env.STALE_BUILD_MS || 60 * 60_000)

type FetchResponse = { ok: boolean; status: number; arrayBuffer: () => Promise<ArrayBuffer> }

interface JobPayload {
	id: string
	userId: string
	url?: string
	prompt?: string
	deploymentUrl?: string
	/**
	 * Path the built site's assets will be served from ("/" for wildcard
	 * subdomain hosting, "/<id>/" for path-based hosting). Bundlers bake
	 * absolute asset URLs into index.html at build time, so this has to be
	 * applied during the build, not at serve time.
	 */
	assetBase?: string
}

let shuttingDown = false

/** Promise-based timeout race helper. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	let timer: ReturnType<typeof setTimeout>
	return Promise.race([
		promise,
		new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
		})
	]).finally(() => clearTimeout(timer!))
}

// Disable jest-worker parallelism in CRA's Terser plugin.
// react-scripts' bundled TerserPlugin uses jest-worker's NodeThreadsWorker,
// which crashes ("Unexpected response from worker: undefined") on Node
// versions newer than react-scripts was built against. No CRA env var
// exists for this, so patch the generated webpack config directly.
const disableCraParallelMinification = async (projectDir: string) => {
	const webpackConfigPath = path.join(projectDir, "node_modules/react-scripts/config/webpack.config.js")
	try {
		const config = await fs.readFile(webpackConfigPath, "utf-8")
		const patched = config.replace(/parallel:\s*true/g, "parallel: false")
		if (patched !== config) {
			await fs.writeFile(webpackConfigPath, patched, "utf-8")
			jobLog("Disabled parallel Terser minification (jest-worker workaround)")
		}
	} catch (error) {
		jobLog(`Could not patch react-scripts webpack config: ${(error as Error).message}`, "warn")
	}
}

// ── Cloudinary helpers ──────────────────────────────────────────────────────

const downloadFile = async (file: { public_id: string, secure_url: string }, project: string, id: string) => {
	const relative = file.public_id.slice(`rwaft/${id}/`.length)
	const destination = path.join(project, relative)
	await fs.mkdir(path.dirname(destination), { recursive: true })
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
	try {
		const response = await fetch(getRawAssetUrl(file.public_id), { signal: controller.signal }) as unknown as FetchResponse
		if (!response.ok) throw new Error(`Cloudinary returned ${response.status} for ${file.public_id}`)
		await fs.writeFile(destination, Buffer.from(await response.arrayBuffer()))
	} finally {
		clearTimeout(timer)
	}
}

const fetchCloudinaryFiles = async (prefix: string) => {
	const page = await withTimeout(
		cloudinary.api.resources({
			type: "upload",
			resource_type: "raw",
			prefix,
			max_results: 500
		}),
		CLOUDINARY_API_TIMEOUT_MS,
		`cloudinary.api.resources(${prefix})`
	)
	return page.resources as { public_id: string; secure_url: string }[]
}

const removeCloudinaryFiles = async (prefix: string) => {
	const files = await fetchCloudinaryFiles(prefix)
	const publicIds = files.map((file) => file.public_id)

	for (let i = 0; i < publicIds.length; i += 100) {
		await withTimeout(
			cloudinary.api.delete_resources(publicIds.slice(i, i + 100), {
				type: "upload",
				resource_type: "raw"
			}),
			CLOUDINARY_API_TIMEOUT_MS,
			`cloudinary.api.delete_resources`
		)
	}
}

// ── Upload build output ─────────────────────────────────────────────────────

const findBuildOutput = async (projectDir: string): Promise<string> => {
	for (const candidate of ["dist", "build"]) {
		const dir = path.join(projectDir, candidate)
		try {
			if ((await fs.stat(dir)).isDirectory()) return dir
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
		}
	}
	throw new Error(`No build output found in ${projectDir}`)
}

const uploadBuildOutput = async (id: string, projectDir: string) => {
	const outputPath = await findBuildOutput(projectDir)
	const fileNames = await getAllFileNames(outputPath)
	jobLog(`Uploading ${fileNames.length} build artifacts...`)

	for (let i = 0; i < fileNames.length; i += UPLOAD_BATCH_SIZE) {
		const batch = fileNames.slice(i, i + UPLOAD_BATCH_SIZE)
		await Promise.all(batch.map((file) =>
			withTimeout(
				uploadFile(file, outputPath, `rwaft-dist/${id}`),
				CLOUDINARY_API_TIMEOUT_MS,
				`upload ${path.basename(file)}`
			)
		))
	}
	jobLog(`Uploaded ${fileNames.length} artifacts`, "success")
}

const cleanup = async (id: string, projectDir: string) => {
	await removeCloudinaryFiles(`rwaft/${id}`)
	await fs.rm(projectDir, { recursive: true, force: true })
}

// ── Deploy flow: Cloudinary source -> build -> upload ───────────────────────

const buildFromCloudinary = async (id: string, assetBase: string) => {
	const projectDir = path.join(root, id)
	await fs.rm(projectDir, { recursive: true, force: true })
	await fs.mkdir(projectDir, { recursive: true })

	jobLog("Fetching repository files...")
	const files = await fetchCloudinaryFiles(`rwaft/${id}`)
	if (files.length === 0) {
		throw new Error("No source files were staged for this deployment")
	}
	const batchSize = 8
	for (let i = 0; i < files.length; i += batchSize) {
		const batch = files.slice(i, i + batchSize)
		await Promise.all(batch.map((file) => downloadFile(file, projectDir, id)))
	}
	jobLog(`Fetched ${files.length} source files`, "success")

	await installDependencies(projectDir, "--legacy-peer-deps")

	let pkg: any = {}
	try {
		pkg = JSON.parse(await fs.readFile(path.join(projectDir, "package.json"), "utf-8"))
	} catch {
		throw new Error("Repository has no readable package.json at its root")
	}
	if (!pkg.scripts?.build) {
		throw new Error('Repository package.json has no "build" script')
	}

	const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
	const isCRA = !!allDeps["react-scripts"]
	const isVite = !!allDeps["vite"]
	if (isCRA) await disableCraParallelMinification(projectDir)

	// Apply the deployment's asset base. Without this, a site hosted under
	// /<id>/ requests its bundles from /assets/... and renders a blank page.
	let buildEnv: Record<string, string> | undefined
	let buildArgs = ""
	if (isCRA) {
		// CRA: disable the ESLint plugin (known jest/globals bug), skip sourcemaps
		// (jest-worker crashes on modern Node), and stop warnings failing the build.
		buildEnv = {
			DISABLE_ESLINT_PLUGIN: "true",
			CI: "false",
			GENERATE_SOURCEMAP: "false",
			// CRA expects no trailing slash.
			PUBLIC_URL: assetBase.replace(/\/+$/, "") || "/"
		}
	} else if (isVite) {
		buildArgs = `--base=${assetBase}`
	} else if (assetBase !== "/") {
		jobLog(
			"This project uses a bundler other than Vite or CRA, so the asset base path could not be set automatically. " +
			"If the deployed page loads blank, configure the bundler to emit relative asset URLs.",
			"warn"
		)
	}

	await buildProject(projectDir, buildEnv, buildArgs)
	return projectDir
}

// ── Prompt flow: scaffold -> AI -> build -> upload ──────────────────────────

const TEMPLATE_REPO = process.env.TEMPLATE_REPO || "https://github.com/nios-x/vite-template"

const scaffoldViteProject = async (projectDir: string) => {
	await fs.rm(projectDir, { recursive: true, force: true })
	await fs.mkdir(root, { recursive: true })
	jobLog("Scaffolding a fresh Vite + React + TypeScript project...")
	await run(`git clone --depth 1 ${TEMPLATE_REPO} ${JSON.stringify(projectDir)}`, {
		cwd: root,
		timeoutMs: 120_000
	})
	await fs.rm(path.join(projectDir, ".git"), { recursive: true, force: true })

	// ── Convert vanilla TS template -> React + TS ───────────────────────
	for (const file of ["src/main.ts", "src/counter.ts", "src/style.css"]) {
		await fs.rm(path.join(projectDir, file), { force: true })
	}

	const pkgPath = path.join(projectDir, "package.json")
	const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8"))
	pkg.dependencies = {
		...pkg.dependencies,
		react: "^19.1.0",
		"react-dom": "^19.1.0"
	}
	pkg.devDependencies = {
		...pkg.devDependencies,
		"@vitejs/plugin-react": "^6.0.0",
		"@types/react": "^19.1.0",
		"@types/react-dom": "^19.1.0"
	}
	await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2), "utf-8")

	await fs.writeFile(path.join(projectDir, "src/main.tsx"), [
		'import { StrictMode } from "react"',
		'import { createRoot } from "react-dom/client"',
		'import App from "./App"',
		'import "./index.css"',
		'',
		'createRoot(document.getElementById("root")!).render(',
		'\t<StrictMode>',
		'\t\t<App />',
		'\t</StrictMode>',
		')',
		''
	].join("\n"), "utf-8")

	await fs.writeFile(path.join(projectDir, "src/App.tsx"), [
		'export default function App() {',
		'\treturn <div id="app-root">Hello</div>',
		'}',
		''
	].join("\n"), "utf-8")

	await fs.writeFile(path.join(projectDir, "src/index.css"), [
		'*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }',
		'body { font-family: system-ui, -apple-system, sans-serif; -webkit-font-smoothing: antialiased; }',
		''
	].join("\n"), "utf-8")

	await fs.writeFile(path.join(projectDir, "index.html"), [
		'<!doctype html>',
		'<html lang="en">',
		'  <head>',
		'    <meta charset="UTF-8" />',
		'    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
		'    <title>App</title>',
		'  </head>',
		'  <body>',
		'    <div id="root"></div>',
		'    <script type="module" src="./src/main.tsx"></script>',
		'  </body>',
		'</html>',
		''
	].join("\n"), "utf-8")

	await fs.writeFile(path.join(projectDir, "vite.config.ts"), [
		'import { defineConfig } from "vite"',
		'import react from "@vitejs/plugin-react"',
		'',
		'export default defineConfig({',
		'\tplugins: [react()]',
		'})',
		''
	].join("\n"), "utf-8")

	await fs.rm(path.join(projectDir, "vite.config.js"), { force: true })

	await installDependencies(projectDir, "--legacy-peer-deps")
}

const MAX_BUILD_REPAIRS = Number(process.env.MAX_BUILD_REPAIRS || 6)

const describeBuildFailure = (failure: string) => {
	const guidance: string[] = []
	if (/TS\d{4}:|TypeScript|implicitly has an 'any' type/.test(failure)) {
		guidance.push(`TypeScript diagnostics: treat all TS errors as one related contract problem. Inspect every named file plus the shared types they import. Reconcile interfaces, object literals, props, state setters, callback parameters, unions, indexed records, and function argument types. Fix missing exports and incorrect relative imports at their source. Do not use any, @ts-ignore, or broad casts to hide errors.`)
	}
	if (/Cannot find module|Module .* has no exported member|does not provide an export|Could not resolve/.test(failure)) {
		guidance.push(`Module diagnostics: verify each import path against the actual file location and extension, then inspect the target file's named/default exports. Choose the import style that matches the real export; do not duplicate modules or create placeholder exports.`)
	}
	if (/npm ERR|ERESOLVE|not found|package\.json|dependency/i.test(failure)) {
		guidance.push(`Dependency diagnostics: inspect package.json and the lockfile if present. Add a missing runtime package to dependencies, a build-only package to devDependencies, or remove an unused import. Keep versions compatible with the existing Vite/React setup.`)
	}
	if (/vite|asset|CSS|css|JSX|JSX element|Unexpected token|failed to load/i.test(failure)) {
		guidance.push(`Vite/asset diagnostics: inspect vite.config, index.html, the entry file, and every referenced asset. Keep JSX in .tsx/.jsx files, use valid Vite asset imports or public paths, and remove stale starter references only when they are not needed.`)
	}
	if (guidance.length === 0) {
		guidance.push(`General build diagnostics: inspect every named file and the nearest shared dependency/configuration. Fix the root cause for syntax, runtime, routing, asset, dependency, or build-tool errors rather than suppressing the message.`)
	}

	return `${guidance.join("\n\n")}\n\nAlways preserve the requested behavior and make the smallest coherent multi-file repair. Do not replace the application with a placeholder.`
}

const normalizeGeneratedProject = async (projectDir: string) => {
	const tsconfigPath = path.join(projectDir, "tsconfig.json")
	let tsconfig = await fs.readFile(tsconfigPath, "utf-8")
	tsconfig = tsconfig.replace(/^\s*"erasableSyntaxOnly"\s*:\s*[^,\r\n]+,?\s*\r?\n?/m, "")
	const setCompilerOption = (name: string, value: string) => {
		const optionPattern = new RegExp(`("${name}"\\s*:\\s*)("[^"]*"|true|false|\\[[^\\]]*\\])`)
		if (optionPattern.test(tsconfig)) {
			tsconfig = tsconfig.replace(optionPattern, `$1${value}`)
			return
		}

		const compilerOptionsStart = tsconfig.search(/"compilerOptions"\s*:\s*\{/)
		if (compilerOptionsStart === -1) {
			throw new Error("Generated tsconfig.json has no compilerOptions object")
		}
		const openingBrace = tsconfig.indexOf("{", compilerOptionsStart)
		tsconfig = `${tsconfig.slice(0, openingBrace + 1)}\n    "${name}": ${value},${tsconfig.slice(openingBrace + 1)}`
	}
	setCompilerOption("jsx", '"react-jsx"')
	setCompilerOption("lib", '["ES2020", "DOM", "DOM.Iterable"]')
	setCompilerOption("allowImportingTsExtensions", "true")
	setCompilerOption("noEmit", "true")
	await fs.writeFile(tsconfigPath, tsconfig, "utf-8")

	const viteConfigTs = path.join(projectDir, "vite.config.ts")
	const viteConfigJs = path.join(projectDir, "vite.config.js")

	try {
		await fs.access(viteConfigTs)
		await fs.rm(viteConfigJs, { force: true })
	} catch { /* no TS config; leave whatever exists */ }

	const indexPath = path.join(projectDir, "index.html")
	let indexHtml = await fs.readFile(indexPath, "utf-8")
	const appPath = path.join(projectDir, "src/App.tsx")
	const reactEntryPath = path.join(projectDir, "src/main.tsx")
	let hasAppComponent = false
	try {
		await fs.access(appPath)
		hasAppComponent = true
	} catch { /* no App.tsx yet */ }

	// ── Auto-generate App.tsx from orphan components ────────────────────
	let appIsStub = false
	if (hasAppComponent) {
		const stubCheck = await fs.readFile(appPath, "utf-8")
		appIsStub = /^\s*export\s+default\s+function\s+App\s*\(\s*\)\s*\{[\s\S]*?app-root[\s\S]*?Hello[\s\S]*?\}\s*$/m.test(stubCheck)
			|| (stubCheck.trim().length < 150 && /app-root|>\s*Hello\s*</.test(stubCheck))
		if (appIsStub) {
			jobLog("App.tsx still contains stub content - auto-generating from components")
		}
	}
	if (!hasAppComponent || appIsStub) {
		const componentsDir = path.join(projectDir, "src/components")
		let componentFiles: string[] = []
		try {
			const entries = await fs.readdir(componentsDir, { withFileTypes: true })
			componentFiles = entries
				.filter(e => !e.isDirectory() && /\.(tsx|jsx)$/.test(e.name))
				.map(e => e.name)
		} catch { /* no components directory */ }

		if (componentFiles.length > 0) {
			jobLog(`Auto-generating App.tsx from ${componentFiles.length} component(s)`)
			const imports: string[] = []
			const renders: string[] = []
			for (const file of componentFiles) {
				const componentName = file.replace(/\.(tsx|jsx)$/, "")
				const source = await fs.readFile(path.join(componentsDir, file), "utf-8")
				const defaultExportMatch = source.match(/export\s+default\s+(?:function|class)\s+(\w+)/)
				const namedExportMatch = source.match(/export\s+(?:function|class)\s+(\w+)/)
				const exportName = defaultExportMatch?.[1] || namedExportMatch?.[1] || componentName
				const isDefault = Boolean(defaultExportMatch) || /export\s+default\s/.test(source)

				if (isDefault) {
					imports.push(`import ${exportName} from "./components/${componentName}"`)
				} else {
					imports.push(`import { ${exportName} } from "./components/${componentName}"`)
				}
				renders.push(`\t\t\t<${exportName} />`)
			}

			await fs.writeFile(appPath, [
				...imports,
				'',
				'export default function App() {',
				'\treturn (',
				'\t\t<div>',
				...renders,
				'\t\t</div>',
				'\t)',
				'}',
				''
			].join("\n"), "utf-8")
			hasAppComponent = true
		}
	}

	if (hasAppComponent) {
		const appSource = await fs.readFile(appPath, "utf-8")
		if (/\b(?:createRoot|hydrateRoot)\s*\(|\bReactDOM\.render\s*\(/.test(appSource)) {
			throw new Error("src/App.tsx must export a component and must not mount React")
		}

		await fs.writeFile(reactEntryPath, `import { StrictMode } from "react"\nimport { createRoot } from "react-dom/client"\nimport App from "./App"\nimport "./index.css"\n\ncreateRoot(document.getElementById("root")!).render(\n\t<StrictMode>\n\t\t<App />\n\t</StrictMode>\n)\n`, "utf-8")
		for (const alternateEntry of ["src/main.ts", "src/index.tsx", "src/index.ts", "src/main.jsx", "src/main.js", "src/index.jsx", "src/index.js"]) {
			await fs.rm(path.join(projectDir, alternateEntry), { force: true })
		}
	}

	const entryCandidates = [
		"src/main.tsx", "src/main.ts", "src/index.tsx", "src/index.ts",
		"src/main.jsx", "src/main.js", "src/index.jsx", "src/index.js"
	]

	let entryPath: string | undefined
	for (const candidate of entryCandidates) {
		try {
			await fs.access(path.join(projectDir, candidate))
			entryPath = candidate
			break
		} catch { /* try next */ }
	}

	if (!entryPath) {
		throw new Error("Generated project has no supported entry file in src/")
	}

	const entrySource = await fs.readFile(path.join(projectDir, entryPath), "utf-8")
	if (/setupCounter|Get started|counter\.ts/.test(entrySource)) {
		throw new Error("Entry file still contains vanilla Vite template content - AI failed to replace it")
	}

	const mountMatch = entrySource.match(/querySelector(?:<[^>]*>)?\s*\(\s*["']#([^"']+)["']\s*\)|getElementById(?:<[^>]*>)?\s*\(\s*["']([^"']+)["']\s*\)/)
	const mountId = mountMatch?.[1] || mountMatch?.[2] || "root"
	const headMatch = indexHtml.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)
	const headContent = headMatch?.[1]?.trim() || '<meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">'
	indexHtml = `<!doctype html>
<html lang="en">
  <head>
    ${headContent}
  </head>
  <body>
    <div id="${mountId}"></div>
    <script type="module" src="./${entryPath}"></script>
  </body>
</html>
`
	await fs.writeFile(indexPath, indexHtml, "utf-8")
}

const installAndBuildPromptProject = async (
	projectDir: string,
	prompt: string,
	initialOperations: Awaited<ReturnType<typeof generateToolCalls>>,
	assetBase: string
) => {
	for (let attempt = 0; attempt <= MAX_BUILD_REPAIRS; attempt++) {
		try {
			if (attempt === 0) {
				await applyOperations(projectDir, initialOperations)
			}
			await normalizeGeneratedProject(projectDir)
			await installDependencies(projectDir)
			// The scaffold is always Vite, so --base is always the right lever.
			await buildProject(projectDir, undefined, `--base=${assetBase}`)

			// ── Post-build validation: reject boilerplate output ─────────
			const distIndex = path.join(projectDir, "dist", "index.html")
			try {
				const distHtml = await fs.readFile(distIndex, "utf-8")
				if (/Get started|setupCounter|counter\.ts|Edit <code>src\/main/.test(distHtml)) {
					throw new Error("Build output contains default Vite template content - AI failed to generate the requested application")
				}
			} catch (e) {
				if ((e as Error).message.includes("Vite template")) throw e
				// A missing dist/index.html already surfaced as a build failure.
			}

			return
		} catch (error) {
			if (attempt === MAX_BUILD_REPAIRS) throw error

			const failure = error instanceof Error ? error.message : String(error)
			jobLog(`Build step failed - asking the AI to repair (${attempt + 1}/${MAX_BUILD_REPAIRS})`, "warn")
			const failureGuidance = describeBuildFailure(failure)
			const repairPrompt = `A project step failed. Fix the project using the file tools.

Original user request:
${prompt}

Failure output:
${failure}

${failureGuidance}

Inspect the relevant files first and make all required changes in one repair pass. Fix every error shown above so both npm install and npm run build succeed. For React JSX files, tsconfig.json must set compilerOptions.jsx to react-jsx and allowImportingTsExtensions to true. Do not leave starter imports to missing assets; replace starter entry code or use only files that exist. Before finishing, use find_file on each changed shared type and entry file to verify imports and exports agree.`
			const repairOperations = await generateToolCalls(repairPrompt, projectDir)
			if (repairOperations.length === 0) {
				jobLog(`AI returned no repair operations (attempt ${attempt + 1}/${MAX_BUILD_REPAIRS}), retrying...`, "warn")
				continue
			}
			jobLog(`Applying ${repairOperations.length} repair operations`)
			try {
				await applyOperations(projectDir, repairOperations)
			} catch (repairError) {
				const message = repairError instanceof Error ? repairError.message : String(repairError)
				jobLog(`Repair application partially failed; re-attempting build: ${message}`, "warn")
			}
		}
	}
}

// ── Reliable queue plumbing ─────────────────────────────────────────────────

type RedisLike = ReturnType<typeof createRedisClient>

/**
 * BLMOVE via sendCommand: atomically pops from the pending queue and records the
 * job on a processing list. If the worker dies mid-build the entry survives
 * there and is recovered at next boot, instead of vanishing with the process.
 *
 * sendCommand is used rather than the typed helper because its argument shape
 * has drifted across node-redis majors; the raw command has not.
 */
async function claimJob(redis: RedisLike, queue: string, processing: string): Promise<string | null> {
	const reply = await redis.sendCommand([
		"BLMOVE", queue, processing, "LEFT", "RIGHT", String(QUEUE_BLOCK_SECONDS)
	])
	if (reply === null || reply === undefined) return null
	return typeof reply === "string" ? reply : String(reply)
}

/** Requeues anything abandoned by a previously crashed worker. */
async function recoverOrphanedJobs(redis: RedisLike, queue: string, processing: string, label: string) {
	const orphans = await redis.lRange(processing, 0, -1)
	if (orphans.length === 0) return
	console.log(`[${label}] Recovering ${orphans.length} interrupted job(s) from a previous run`)
	for (const raw of orphans) {
		await redis.lPush(queue, raw)
		await redis.lRem(processing, 1, raw)
	}
}

/** Deletes build directories left behind by crashes. */
async function sweepStaleBuilds() {
	let entries
	try {
		entries = await fs.readdir(root, { withFileTypes: true })
	} catch { return }
	const now = Date.now()
	for (const entry of entries) {
		if (!entry.isDirectory()) continue
		const target = path.join(root, entry.name)
		try {
			const stat = await fs.stat(target)
			if (now - stat.mtimeMs > STALE_BUILD_MS) {
				await fs.rm(target, { recursive: true, force: true })
				console.log(`[sweep] Removed stale build directory ${entry.name}`)
			}
		} catch { /* raced with a running job; ignore */ }
	}
}

function parsePayload(raw: string, label: string): JobPayload | null {
	try {
		const parsed = JSON.parse(raw)
		if (!parsed?.id || typeof parsed.id !== "string") throw new Error("missing id")
		return {
			id: parsed.id,
			// Anonymous submissions still get a channel, keyed by the job itself.
			userId: typeof parsed.userId === "string" && parsed.userId ? parsed.userId : `anon-${parsed.id}`,
			url: parsed.url,
			prompt: parsed.prompt,
			deploymentUrl: parsed.deploymentUrl,
			assetBase: typeof parsed.assetBase === "string" ? parsed.assetBase : `/${parsed.id}/`
		}
	} catch (error) {
		console.error(`[${label}] Discarding malformed payload: ${(error as Error).message}`)
		return null
	}
}

/**
 * Shared job pump: claim -> run inside a per-user log context -> ack.
 * `handler` throws to mark the job failed.
 */
async function pump(
	label: string,
	kind: JobKind,
	queue: string,
	processing: string,
	handler: (payload: JobPayload) => Promise<void>
) {
	const redis = createRedisClient()
	await redis.connect()
	await recoverOrphanedJobs(redis, queue, processing, label)
	console.log(`[${label}] Listening on ${queue}`)

	while (!shuttingDown) {
		let raw: string | null = null
		try {
			raw = await claimJob(redis, queue, processing)
		} catch (error) {
			if (shuttingDown) break
			console.error(`[${label}] Queue read failed, backing off:`, (error as Error).message)
			await new Promise(r => setTimeout(r, 2_000))
			continue
		}
		if (!raw) continue

		const payload = parsePayload(raw, label)
		if (!payload) {
			await redis.lRem(processing, 1, raw).catch(() => { })
			continue
		}

		const { id, userId } = payload
		const projectDir = path.join(root, id)

		await runWithJobContext({ jobId: id, userId, kind }, async () => {
			try {
				jobStatus("building")
				jobLog(`Starting ${kind} job ${id}`)
				await redis.set(`${DEPLOYMENT_STATUS_PREFIX}${id}`, "building", { EX: STATUS_TTL_SECONDS })

				await withTimeout(handler(payload), JOB_TIMEOUT_MS, `${kind} job ${id}`)

				await redis.set(`${DEPLOYMENT_STATUS_PREFIX}${id}`, "ready", { EX: STATUS_TTL_SECONDS })
				jobLog(`Deployment ${id} is live`, "success")
				jobStatus("ready", { url: payload.deploymentUrl })
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				await redis.set(`${DEPLOYMENT_STATUS_PREFIX}${id}`, "failed", { EX: STATUS_TTL_SECONDS }).catch(() => { })
				jobLog(`Deployment ${id} failed: ${message}`, "error")
				jobStatus("failed", { error: message })
			} finally {
				releaseJobState(projectDir)
				await fs.rm(projectDir, { recursive: true, force: true }).catch(() => { })
				// Ack last: until this runs, a crash leaves the job recoverable.
				await redis.lRem(processing, 1, raw!).catch(() => { })
				await flushLogs()
			}
		})
	}

	await redis.quit().catch(() => { })
}

const deployWorker = () => pump("deploy", "deploy", DEPLOY_QUEUE, DEPLOY_PROCESSING, async (payload) => {
	const projectDir = path.join(root, payload.id)
	await buildFromCloudinary(payload.id, payload.assetBase || `/${payload.id}/`)
	await uploadBuildOutput(payload.id, projectDir)
	await cleanup(payload.id, projectDir)
})

const promptWorker = () => pump("prompt", "prompt", PROMPT_QUEUE, PROMPT_PROCESSING, async (payload) => {
	if (!payload.prompt) throw new Error("Prompt job carried no prompt text")
	const projectDir = path.join(root, payload.id)

	await scaffoldViteProject(projectDir)

	jobLog("Asking the AI to write your application...")
	const operations = await generateToolCalls(payload.prompt, projectDir)
	jobLog(`AI produced ${operations.length} file operations`)

	await installAndBuildPromptProject(
		projectDir,
		payload.prompt,
		operations,
		payload.assetBase || `/${payload.id}/`
	)
	await uploadBuildOutput(payload.id, projectDir)
})

// ── Health probe ────────────────────────────────────────────────────────────

/**
 * A tiny HTTP listener so the worker can also run on hosts that require an open
 * port (Render web services). Skipped entirely when PORT is unset, which is the
 * normal case for a background worker.
 */
function startHealthServer() {
	const port = Number(process.env.PORT || 0)
	if (!port) return undefined
	const server = http.createServer((req, res) => {
		if (req.url === "/health" || req.url === "/healthz") {
			res.writeHead(200, { "Content-Type": "application/json" })
			res.end(JSON.stringify({ status: shuttingDown ? "draining" : "healthy", service: "worker" }))
			return
		}
		res.writeHead(404).end()
	})
	server.listen(port, "0.0.0.0", () => console.log(`[worker] Health probe on port ${port}`))
	return server
}

// ── Bootstrap ───────────────────────────────────────────────────────────────

process.on("uncaughtException", (error) => {
	console.error("[process] Uncaught exception:", error)
})
process.on("unhandledRejection", (reason) => {
	console.error("[process] Unhandled rejection:", reason)
})

await fs.mkdir(root, { recursive: true })
await sweepStaleBuilds()
const sweepTimer = setInterval(() => { sweepStaleBuilds().catch(() => { }) }, STALE_BUILD_MS)
const healthServer = startHealthServer()

/** Auto-restart a worker with exponential backoff (max 30s). */
async function runWorkerForever(name: string, worker: () => Promise<void>) {
	let failures = 0
	while (!shuttingDown) {
		try {
			await worker()
			if (shuttingDown) break
			failures = 0
		} catch (error) {
			if (shuttingDown) break
			failures++
			const delay = Math.min(failures * 2_000, 30_000)
			console.error(`[${name}] Worker crashed (attempt ${failures}), restarting in ${delay}ms:`, error)
			await new Promise(r => setTimeout(r, delay))
		}
	}
}

let shutdownStarted = false
const shutdown = async (signal: string) => {
	if (shutdownStarted) return
	shutdownStarted = true
	shuttingDown = true
	console.log(`[worker] ${signal} received - finishing current job, then exiting`)
	clearInterval(sweepTimer)
	healthServer?.close()
	// Give the in-flight job a bounded window to finish and flush its logs.
	setTimeout(() => {
		console.warn("[worker] Shutdown grace period elapsed, forcing exit")
		process.exit(0)
	}, Number(process.env.SHUTDOWN_GRACE_MS || 25_000)).unref()
	await closeLogPublisher().catch(() => { })
}

process.on("SIGTERM", () => { void shutdown("SIGTERM") })
process.on("SIGINT", () => { void shutdown("SIGINT") })

await Promise.all([
	runWorkerForever("deploy", deployWorker),
	runWorkerForever("prompt", promptWorker)
])
