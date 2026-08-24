import fs from "fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { createRedisClient } from "./lib/config.ts"
import { v2 as cloudinary } from "cloudinary"
import { getAllFileNames } from "./lib/helper.ts"
import { uploadFile } from "./lib/upload.ts"
import { generateToolCalls } from "./lib/ai.ts"
import { applyOperations } from "./lib/tools.ts"


const directory = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(directory, "builds")

const DEPLOY_QUEUE = "rwaft:deploy"
const PROMPT_QUEUE = "rwaft:prompt"
const DEPLOYMENT_STATUS_PREFIX = "rwaft:deployment-status:"
const UPLOAD_BATCH_SIZE = 8
const COMMAND_TIMEOUT_MS = Number(process.env.COMMAND_TIMEOUT_MS || 60_000)
const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS || 10 * 60_000) // 10 minutes

const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 30_000)
const CLOUDINARY_API_TIMEOUT_MS = Number(process.env.CLOUDINARY_API_TIMEOUT_MS || 60_000)

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

// ── Shell runner ────────────────────────────────────────────────────────────

const run = (command: string, cwd: string) => new Promise<void>((resolve, reject) => {
	const child = spawn(command, { cwd, shell: true, stdio: "inherit" })
	let settled = false
	const timer = setTimeout(() => {
		if (settled) return
		settled = true
		child.kill()
		reject(new Error(`${command} timed out after ${COMMAND_TIMEOUT_MS}ms`))
	}, COMMAND_TIMEOUT_MS)
	child.on("error", (error) => {
		if (settled) return
		settled = true
		clearTimeout(timer)
		reject(error)
	})
	child.on("exit", (code) => {
		if (settled) return
		settled = true
		clearTimeout(timer)
		code === 0 ? resolve() : reject(new Error(`${command} failed with exit code ${code}`))
	})
})

const runWithOutput = (command: string, cwd: string) => new Promise<void>((resolve, reject) => {
	let output = ""
	const child = spawn(command, { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"] })
	let settled = false
	const collect = (chunk: Buffer) => {
		const text = chunk.toString()
		output += text
		process.stdout.write(text)
	}
	const timer = setTimeout(() => {
		if (settled) return
		child.kill()
		reject(new Error(`${command} timed out after ${COMMAND_TIMEOUT_MS}ms\n\n${output.slice(-12_000)}`))
	}, COMMAND_TIMEOUT_MS)

	child.stdout.on("data", collect)
	child.stderr.on("data", collect)
	child.on("error", (error) => {
		if (settled) return
		settled = true
		clearTimeout(timer)
		reject(error)
	})
	child.on("exit", (code) => {
		if (settled) return
		settled = true
		clearTimeout(timer)
		if (code === 0) {
			resolve()
			return
		}
		reject(new Error(`${command} failed\n\n${output.slice(-12_000)}`))
	})
})

// ── Cloudinary helpers ──────────────────────────────────────────────────────

const downloadFile = async (file: { public_id: string, secure_url: string }, project: string, id: string) => {
	const relative = file.public_id.slice(`rwaft/${id}/`.length)
	const destination = path.join(project, relative)
	await fs.mkdir(path.dirname(destination), { recursive: true })
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
	try {
		const response: any = await fetch(file.secure_url, { signal: controller.signal })
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
}

const cleanup = async (id: string, projectDir: string) => {
	await removeCloudinaryFiles(`rwaft/${id}`)
	await fs.rm(projectDir, { recursive: true, force: true })
}

// ── Worker: rwaft:deploy (git clone → build → upload) ───────────────────────

const buildFromCloudinary = async (id: string) => {
	const projectDir = path.join(root, id)
	await fs.rm(projectDir, { recursive: true, force: true })
	await fs.mkdir(projectDir, { recursive: true })

	// Download source files from Cloudinary
	const files = await fetchCloudinaryFiles(`rwaft/${id}`)
	const batchSize = 8
	for (let i = 0; i < files.length; i += batchSize) {
		const batch = files.slice(i, i + batchSize)
		await Promise.all(batch.map((file) => downloadFile(file, projectDir, id)))
	}

	await run("npm install", projectDir)
	await run("npm install -D @vitejs/plugin-react", projectDir)
	await run("npm run build", projectDir)

	return projectDir
}

const deployWorker = async () => {
	const redis = createRedisClient()
	await redis.connect()
	console.log(`[deploy] Listening on ${DEPLOY_QUEUE}`)

	while (true) {
		const item = await redis.blPop(DEPLOY_QUEUE, 0)
		if (!item) continue

		const id = item.element
		console.log(`[deploy] Building ${id}`)

		const jobTimer = setTimeout(() => {}, JOB_TIMEOUT_MS)
		try {
			await withTimeout((async () => {
				const projectDir = await buildFromCloudinary(id)
				console.log(`[deploy] Built ${id}`)

				await uploadBuildOutput(id, projectDir)
				console.log(`[deploy] Uploaded ${id}`)
				await redis.set(`${DEPLOYMENT_STATUS_PREFIX}${id}`, "ready", { EX: 3600 })

				await cleanup(id, projectDir)
				console.log(`[deploy] ✓ Deployed ${id}`)
			})(), JOB_TIMEOUT_MS, `deploy job ${id}`)
		} catch (error) {
			await redis.set(`${DEPLOYMENT_STATUS_PREFIX}${id}`, "failed", { EX: 3600 }).catch(() => {})
			console.error(`[deploy] Failed for ${id}:`, error)
			const projectDir = path.join(root, id)
			await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {})
		} finally {
			clearTimeout(jobTimer)
		}
	}
}

// ── Worker: rwaft:prompt (AI → scaffold → build → upload) ───────────────────

const TEMPLATE_REPO = "https://github.com/nios-x/vite-template"

const scaffoldViteProject = async (projectDir: string) => {
	await fs.rm(projectDir, { recursive: true, force: true })
	await run(`git clone ${TEMPLATE_REPO} ${projectDir}`, root)
	await run("npm install -D @vitejs/plugin-react", projectDir)
}

const MAX_BUILD_REPAIRS = 6

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
	} catch {
	}

	const indexPath = path.join(projectDir, "index.html")
	let indexHtml = await fs.readFile(indexPath, "utf-8")
	const appPath = path.join(projectDir, "src/App.tsx")
	const reactEntryPath = path.join(projectDir, "src/main.tsx")
	let hasAppComponent = false
	try {
		await fs.access(appPath)
		hasAppComponent = true
	} catch {
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
		"src/main.tsx",
		"src/main.ts",
		"src/index.tsx",
		"src/index.ts",
		"src/main.jsx",
		"src/main.js",
		"src/index.jsx",
		"src/index.js"
	]

	let entryPath: string | undefined
	for (const candidate of entryCandidates) {
		try {
			await fs.access(path.join(projectDir, candidate))
			entryPath = candidate
			break
		} catch {
		}
	}

	if (!entryPath) {
		throw new Error("Generated project has no supported entry file in src/")
	}

	const entrySource = await fs.readFile(path.join(projectDir, entryPath), "utf-8")
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
	initialOperations: Awaited<ReturnType<typeof generateToolCalls>>
) => {
	for (let attempt = 0; attempt <= MAX_BUILD_REPAIRS; attempt++) {
		try {
			if (attempt === 0) {
				await applyOperations(projectDir, initialOperations)
			}
			await normalizeGeneratedProject(projectDir)
			await runWithOutput("npm install", projectDir)
			await runWithOutput("npm run build", projectDir)
			return
		} catch (error) {
			if (attempt === MAX_BUILD_REPAIRS) throw error

			const failure = error instanceof Error ? error.message : String(error)
			console.warn(`[prompt] Project step failed, asking AI for repair (${attempt + 1}/${MAX_BUILD_REPAIRS})`)
			const failureGuidance = describeBuildFailure(failure)
			const repairPrompt = `A project step failed. Fix the project using the file tools.

Original user request:
${prompt}

Failure output:
${failure}

${failureGuidance}

Inspect the relevant files first and make all required changes in one repair pass. Fix every error shown above so both npm install and npm run build succeed. For React JSX files, tsconfig.json must set compilerOptions.jsx to react-jsx and allowImportingTsExtensions to true. Do not leave starter imports to missing assets; replace starter entry code or use only files that exist. Before finishing, use find_file on each changed shared type and entry file to verify imports and exports agree.`
			const repairOperations = await generateToolCalls(repairPrompt, projectDir)
			// Fix 5: Don't abort when repair returns zero operations — just retry
			if (repairOperations.length === 0) {
				console.warn(`[prompt] AI returned no repair operations (attempt ${attempt + 1}/${MAX_BUILD_REPAIRS}), retrying…`)
				continue
			}
			console.log(`[prompt] Applying ${repairOperations.length} repair operations`)
			// Fix 6: Repair application failures are non-fatal — continue to next attempt
			try {
				await applyOperations(projectDir, repairOperations)
			} catch (repairError) {
				const message = repairError instanceof Error ? repairError.message : String(repairError)
				console.warn(`[prompt] Repair application partially failed; will re-attempt build: ${message}`)
			}
		}
	}
}

const promptWorker = async () => {
	const redis = createRedisClient()
	await redis.connect()
	console.log(`[prompt] Listening on ${PROMPT_QUEUE}`)

	while (true) {
		const item = await redis.blPop(PROMPT_QUEUE, 0)
		if (!item) continue

		let id: string
		let prompt: string

		try {
			const payload = JSON.parse(item.element)
			id = payload.id
			prompt = payload.prompt
		} catch {
			console.error("[prompt] Invalid JSON payload, skipping")
			continue
		}

		console.log(`[prompt] Processing ${id}`)
		const projectDir = path.join(root, id)

		// Fix 7: Per-job timeout — no single job blocks the worker forever
		const jobController = new AbortController()
		const jobTimer = setTimeout(() => jobController.abort(), JOB_TIMEOUT_MS)

		try {
			const jobPromise = (async () => {
				// 1. Scaffold a fresh Vite + React + TS project
				console.log(`[prompt] Scaffolding Vite project`)
				await scaffoldViteProject(projectDir)

				// 2. Call AI to get file operations
				console.log(`[prompt] Generating tool calls from AI`)
				const operations = await generateToolCalls(prompt, projectDir)
				console.log(`[prompt] Received ${operations.length} operations`)

				// 3. Install dependencies and build, repairing failures through the AI
				console.log(`[prompt] Applying file operations`)
				console.log(`[prompt] Installing dependencies`)
				console.log(`[prompt] Building project`)
				await installAndBuildPromptProject(projectDir, prompt, operations)

				// 4. Upload build output to Cloudinary
				console.log(`[prompt] Uploading to Cloudinary`)
				await uploadBuildOutput(id, projectDir)

				// 5. Mark ready & cleanup
				await redis.set(`${DEPLOYMENT_STATUS_PREFIX}${id}`, "ready", { EX: 3600 })
				await fs.rm(projectDir, { recursive: true, force: true })
				console.log(`[prompt] ✓ Deployed ${id}`)
			})()

			// Race the job against the timeout
			await Promise.race([
				jobPromise,
				new Promise<never>((_, reject) => {
					jobController.signal.addEventListener("abort", () =>
						reject(new Error(`Job ${id} timed out after ${JOB_TIMEOUT_MS / 1000}s`))
					)
				})
			])
		} catch (error) {
			await redis.set(`${DEPLOYMENT_STATUS_PREFIX}${id}`, "failed", { EX: 3600 }).catch(() => {})
			console.error(`[prompt] Failed for ${id}:`, error)
			await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {})
		} finally {
			clearTimeout(jobTimer)
		}
	}
}

// ── Bootstrap ───────────────────────────────────────────────────────────────

// Prevent stray errors (like Redis ECONNRESET) from crashing the process
process.on("uncaughtException", (error) => {
	console.error("[process] Uncaught exception:", error.message)
})
process.on("unhandledRejection", (reason) => {
	console.error("[process] Unhandled rejection:", reason)
})

await fs.mkdir(root, { recursive: true })

/** Auto-restart a worker with exponential backoff (max 30s). */
async function runWorkerForever(name: string, worker: () => Promise<void>) {
	let failures = 0
	while (true) {
		try {
			await worker()
		} catch (error) {
			failures++
			const delay = Math.min(failures * 2_000, 30_000)
			console.error(`[${name}] Worker crashed (attempt ${failures}), restarting in ${delay}ms:`, error)
			await new Promise(r => setTimeout(r, delay))
		}
	}
}

await Promise.all([
	runWorkerForever("deploy", deployWorker),
	runWorkerForever("prompt", promptWorker)
])
