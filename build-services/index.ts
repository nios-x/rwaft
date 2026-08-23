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
const UPLOAD_BATCH_SIZE = 8

// ── Shell runner ────────────────────────────────────────────────────────────

const run = (command: string, cwd: string) => new Promise<void>((resolve, reject) => {
	const child = spawn(command, { cwd, shell: true, stdio: "inherit" })
	child.on("error", reject)
	child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} failed`)))
})

// ── Cloudinary helpers ──────────────────────────────────────────────────────

const downloadFile = async (file: { public_id: string, secure_url: string }, project: string, id: string) => {
	const relative = file.public_id.slice(`rwaft/${id}/`.length)
	const destination = path.join(project, relative)
	await fs.mkdir(path.dirname(destination), { recursive: true })
	const response: any = await fetch(file.secure_url)
	await fs.writeFile(destination, Buffer.from(await response.arrayBuffer()))
}

const fetchCloudinaryFiles = async (prefix: string) => {
	const page = await cloudinary.api.resources({
		type: "upload",
		resource_type: "raw",
		prefix,
		max_results: 500
	})
	return page.resources as { public_id: string; secure_url: string }[]
}

const removeCloudinaryFiles = async (prefix: string) => {
	const files = await fetchCloudinaryFiles(prefix)
	const publicIds = files.map((file) => file.public_id)

	for (let i = 0; i < publicIds.length; i += 100) {
		await cloudinary.api.delete_resources(publicIds.slice(i, i + 100), {
			type: "upload",
			resource_type: "raw"
		})
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
		await Promise.all(batch.map((file) => uploadFile(file, outputPath, `rwaft-dist/${id}`)))
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

		try {
			const projectDir = await buildFromCloudinary(id)
			console.log(`[deploy] Built ${id}`)

			await uploadBuildOutput(id, projectDir)
			console.log(`[deploy] Uploaded ${id}`)

			await cleanup(id, projectDir)
		} catch (error) {
			console.error(`[deploy] Failed for ${id}:`, error)
		}
	}
}

// ── Worker: rwaft:prompt (AI → scaffold → build → upload) ───────────────────

const TEMPLATE_REPO = "https://github.com/nios-x/vite-template"

const scaffoldViteProject = async (projectDir: string) => {
	await fs.rm(projectDir, { recursive: true, force: true })
	await run(`git clone ${TEMPLATE_REPO} ${projectDir}`, root)
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

		try {
			// 1. Scaffold a fresh Vite + React + TS project
			console.log(`[prompt] Scaffolding Vite project`)
			await scaffoldViteProject(projectDir)

			// 2. Call OpenAI to get file operations
			console.log(`[prompt] Generating tool calls from AI`)
			const operations = await generateToolCalls(prompt, projectDir)
			console.log(`[prompt] Received ${operations.length} operations`)

			// 3. Apply each operation sequentially
			console.log(`[prompt] Applying file operations`)
			await applyOperations(projectDir, operations)

			// 4. Install dependencies and build
			console.log(`[prompt] Installing dependencies`)
			await run("npm install", projectDir)

			console.log(`[prompt] Building project`)
			await run("npm run build", projectDir)

			// 5. Upload build output to Cloudinary
			console.log(`[prompt] Uploading to Cloudinary`)
			await uploadBuildOutput(id, projectDir)

			// 6. Cleanup
			await fs.rm(projectDir, { recursive: true, force: true })
			console.log(`[prompt] ✓ Deployed ${id}`)
		} catch (error) {
			console.error(`[prompt] Failed for ${id}:`, error)
			await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {})
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

await Promise.all([
	deployWorker().catch(error => {
		console.error("[deploy] Worker crashed:", error)
		process.exit(1)
	}),
	promptWorker().catch(error => {
		console.error("[prompt] Worker crashed:", error)
		process.exit(1)
	})
])
