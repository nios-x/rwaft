import { createServer } from "node:http"
import { readFile, stat } from "node:fs/promises"
import { extname, join, normalize, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

export const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)))

const TYPES = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".woff2": "font/woff2",
	".woff": "font/woff",
	".wav": "audio/wav",
	".mp3": "audio/mpeg",
	".mp4": "video/mp4",
}

/** A static server for the composition. Port 0 picks a free one. */
export function startServer(port = 0) {
	const server = createServer(async (req, res) => {
		try {
			const path = decodeURIComponent(new URL(req.url, "http://x").pathname)
			const file = normalize(join(ROOT, path === "/" ? "index.html" : path))
			if (file !== ROOT && !file.startsWith(ROOT + sep)) {
				res.writeHead(403).end()
				return
			}
			const info = await stat(file)
			if (!info.isFile()) throw new Error("not a file")
			res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" })
			res.end(await readFile(file))
		} catch {
			res.writeHead(404).end("not found")
		}
	})
	return new Promise((done) => server.listen(port, "127.0.0.1", () => done({ server, url: `http://127.0.0.1:${server.address().port}` })))
}
