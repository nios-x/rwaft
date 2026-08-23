import fs from "node:fs/promises";
import express from "express"
import { simpleGit } from 'simple-git';
import { genId, getAllFileNames } from "./lib/utils.ts"
import { uploadFile } from "./lib/upload.ts"
import { fileURLToPath } from "node:url"
import { v2 as cloudinary } from "cloudinary"
import path from "path"
import "dotenv/config";
import "./lib/cloudinary.ts";
import { getRedisClient } from "./lib/redis.ts";
import { corsmiddlewares } from "./lib/middleware.ts";


const app = express()
const PORT = process.env.PORT || 3000
const UPLOAD_BATCH_SIZE = 10
const DEPLOY_QUEUE = "rwaft:deploy"
const redisClient = await getRedisClient()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const deploymentDomain = process.env.DEPLOYMENT_DOMAIN || "localhost:3000"


app.use(corsmiddlewares)
app.use(express.json())

const sendCloudinaryFile = async (id: string, filePath: string, res: express.Response) => {
    const url = cloudinary.url(`rwaft-dist/${id}/${filePath}`, {
        type: "upload",
        resource_type: "raw",
        secure: true
    })
    const response: any = await fetch(url)
    if (!response.ok) throw new Error(`Cloudinary returned ${response.status}`)

    const types: Record<string, string> = {
        html: "text/html",
        css: "text/css",
        js: "application/javascript",
        json: "application/json",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        svg: "image/svg+xml",
        ico: "image/x-icon"
    }
    const extension = path.extname(filePath).slice(1).toLowerCase()
    res.type(types[extension] || "application/octet-stream")
    res.set("Content-Disposition", "inline")
    const file = Buffer.from(await response.arrayBuffer())
    res.send(file)
}


app.get("/{*splat}", async (req, res) => {
    const parts = Array.isArray(req.params.splat)
        ? req.params.splat
        : [req.params.splat]

    const hostnameId = req.hostname.split(".")[0] || ""
    const deploymentId = /^[a-z0-9]{8}$/.test(hostnameId)
        ? hostnameId
        : parts.shift()

    if (!deploymentId) {
        res.status(404).json({ status: "Deployment not found" })
        return
    }

    const requestedPath = parts.join("/") || "index.html"
    if (requestedPath.split("/").some((part) => part === "..")) {
        res.status(400).json({ status: "Invalid file path" })
        return
    }

    try {
        await sendCloudinaryFile(deploymentId, requestedPath, res)
    } catch (error) {
        if (requestedPath !== "index.html") {
            try {
                await sendCloudinaryFile(deploymentId, "index.html", res)
                return
            } catch { }
        }

        console.error(`Failed to find deployed file ${deploymentId}/${requestedPath}:`, error)
        res.status(404).json({ status: "File not found" })
    }
})

app.post("/deploy", async (req, res) => {
    if (!req.body || !req.body.url) {
        res.status(400).json({ "status": "No Url Provided" })
        return;
    }
    const id = genId()
    const outputPath = path.join(__dirname, "outputs", id)

    try {
        await simpleGit().clone(req.body.url, outputPath);
    } catch (error) {
        return res.status(500).json({ status: "failed", message: "Failed to clone repository" });
    }
    const fileNames = await getAllFileNames(outputPath)
    const uploadResults = [];
    console.log("PULLING REPOSITORY")
    try {
        for (let index = 0; index < fileNames.length; index += UPLOAD_BATCH_SIZE) {
            const batch = fileNames.slice(index, index + UPLOAD_BATCH_SIZE)
            const batchResults = await Promise.all(batch.map((fileName) => uploadFile(fileName, outputPath, `rwaft/${id}`)))
            uploadResults.push(...batchResults)
        }
    } catch (error) {
        console.error("Repository upload failed:", error)
        return res.status(500).json({ status: "failed", message: "Failed to upload repository files" });
    } finally {
        await fs.rm(outputPath, { recursive: true, force: true });
    }

    console.log("WAKING WORKER")

    try {
        await redisClient.rPush(DEPLOY_QUEUE, id)
    } catch (error) {
        console.error("Deployment queue push failed:", error)
        return res.status(500).json({ status: "failed", message: "Failed to queue repository deployment" });
    }

    res.status(200).json({
        status: "success",
        id,
        url: `${req.protocol}://${id}.${deploymentDomain}/`,
    })
})


app.post("/prompt", async (req, res) => {
    if (!req.body || !req.body.prompt) {
        res.status(400).json({ "status": "No Prompt Provided" })
        return;
    }
    const id = genId()
    const AI_PROMPT_QUEUE = "rwaft:prompt"
    try {
        await redisClient.rPush(AI_PROMPT_QUEUE, JSON.stringify({ id, prompt: req.body.prompt }))
    } catch (error) {
        console.error("Prompt queue push failed:", error)
        return res.status(500).json({ status: "failed", message: "Failed to queue prompt" });
    }

    res.status(200).json({
        status: "success",
        id,
        url: `${req.protocol}://${id}.${deploymentDomain}/`,
    })
})



app.listen(PORT, () => {
    console.log(`App is running on port ${PORT}`)
})
