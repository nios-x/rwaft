import fs from "fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { redis } from "./lib/config.ts"
import { v2 as cloudinary } from "cloudinary"
import { getAllFileNames } from "./lib/helper.ts"
import { uploadFile } from "./lib/upload.ts"


const directory = path.dirname(fileURLToPath(import.meta.url))
const queue = "rwaft:deploy"
const root = path.join(directory, "builds")

const run = (command: string, cwd: string) => new Promise<void>((resolve, reject) => {
	const child = spawn(command, { cwd, shell: true, stdio: "inherit" })
	child.on("error", reject)
	child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} failed`)))
})

const downloadFile = async (file: { public_id: string, secure_url: string }, project: string, id: string) => {
    const relative = file.public_id.slice(`rwaft/${id}/`.length)
    const destination = path.join(project, relative)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    const response = await fetch(file.secure_url)
    await fs.writeFile(destination, Buffer.from(await response.arrayBuffer()))
}

const build = async (id: string) => {
    const project = path.join(root, id)
    await fs.rm(project, { recursive: true, force: true })
    await fs.mkdir(project, { recursive: true })


    // CLOUDINARY FILES
    const page = await cloudinary.api.resources({
        type: "upload",
        resource_type: "raw",
        prefix: `rwaft/${id}`,
        max_results: 500
    })

    // DOWNLOAD FILES IN SMALL CONCURRENT BATCHES
    const batchSize = 8
    for (let start = 0; start < page.resources.length; start += batchSize) {
        const batch = page.resources.slice(start, start + batchSize)
        await Promise.all(batch.map((file: { public_id: string, secure_url: string }) => downloadFile(file, project, id)))
    }

    await run("npm install", project)
    await run("npm run build", project)
}

const uploadBatchSize = 8


const removeSourceFiles = async (id: string) => {
    const sourcePrefix = `rwaft/${id}`
    const page = await cloudinary.api.resources({
        type: "upload",
        resource_type: "raw",
        prefix: sourcePrefix,
        max_results: 500
    })

    const publicIds = page.resources.map((file: { public_id: string }) => file.public_id)
    for (let index = 0; index < publicIds.length; index += 100) {
        await cloudinary.api.delete_resources(publicIds.slice(index, index + 100), {
            type: "upload",
            resource_type: "raw"
        })
    }
}



const uploadToS3 = async (id: string) => {
    const project = path.join(root, id)
    const candidates = ["dist", "build"]
    let outputPath: string | undefined

    for (const directory of candidates) {
        const candidate = path.join(project, directory)
        try {
            if ((await fs.stat(candidate)).isDirectory()) {
                outputPath = candidate
                break
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
        }
    }

    if (!outputPath) {
        throw new Error(`No build output found for deployment ${id}`)
    }

    const fileNames = await getAllFileNames(outputPath)
    for (let index = 0; index < fileNames.length; index += uploadBatchSize) {
        const batch = fileNames.slice(index, index + uploadBatchSize)
        await Promise.all(batch.map((fileName) => uploadFile(fileName, outputPath, `rwaft-dist/${id}`)))
    }

    await removeSourceFiles(id)
    await fs.rm(project, { recursive: true, force: true })
}




await fs.mkdir(root, { recursive: true })

try {
    await redis.connect()
} catch (error) {
    console.error("Failed to connect to Redis. Check REDIS_URL and network access:", error)
    process.exit(1)
}

console.log(`Worker listening on ${queue}`)

while (true) {
	const item = await redis.blPop(queue, 0)
	if (!item) continue
	try {
        await build(item.element)
        console.log("Built the Project")
        await uploadToS3(item.element)
        console.log("Uploaded to S3")
        
	} catch (error) {
		console.error(`Build failed for ${item.element}:`, error)
	}
}
