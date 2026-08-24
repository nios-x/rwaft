import fs from "node:fs/promises";
import express from "express"
import { simpleGit } from 'simple-git';
import { genId, getAllFileNames } from "./lib/utils.ts"
import { uploadFile } from "./lib/upload.ts"
import { fileURLToPath } from "node:url"
import path from "path"
import "dotenv/config";
import { getRawAssetUrl } from "./lib/cloudinary.ts";
import { getRedisClient } from "./lib/redis.ts";
import { corsmiddlewares } from "./lib/middleware.ts";


const app = express()
const PORT = process.env.PORT || 3000
const UPLOAD_BATCH_SIZE = 10
const DEPLOY_QUEUE = "rwaft:deploy"
const DEPLOYMENT_STATUS_PREFIX = "rwaft:deployment-status:"
const redisClient = await getRedisClient()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const deploymentDomain = process.env.DEPLOYMENT_DOMAIN || "localhost:3001"


app.use(corsmiddlewares)
app.use(express.json())

const sendCloudinaryFile = async (id: string, filePath: string, res: express.Response) => {
    const url = getRawAssetUrl(`rwaft-dist/${id}/${filePath}`)
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

    const deploymentStatus = await redisClient.get(`${DEPLOYMENT_STATUS_PREFIX}${deploymentId}`)
    if (deploymentStatus === "building") {
        res.status(202).type("html").send(`<!doctype html><title>Building deployment</title><meta http-equiv="refresh" content="3"> <p>Your site is still building. This page will refresh automatically.</p>`)
        return
    }
    if (deploymentStatus === "failed") {
        res.status(503).send("Deployment failed")
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
            const batchResults = await Promise.all(batch.map(async (fileName) => {
                try {
                    return await uploadFile(fileName, outputPath, `rwaft/${id}`)
                } catch (error) {
                    const detail = error as { message?: string; http_code?: number }
                    throw new Error(`Failed to upload ${path.relative(outputPath, fileName)}: ${detail.message ?? String(error)}${detail.http_code ? ` (HTTP ${detail.http_code})` : ""}`)
                }
            }))
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
        await redisClient.set(`${DEPLOYMENT_STATUS_PREFIX}${id}`, "building", { EX: 3600 })
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
        await redisClient.set(`${DEPLOYMENT_STATUS_PREFIX}${id}`, "building", { EX: 3600 })
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
