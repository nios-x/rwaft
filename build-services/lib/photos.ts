import fs from "node:fs/promises"
import path from "node:path"
import { jobLog, serverLog } from "./joblog.ts"

/**
 * Real photographs for a generated site.
 *
 * The page writer can't search for photos, so it writes every image as
 * `https://picsum.photos/seed/<what-the-photo-shows>/<w>/<h>`. On its own
 * that URL gives a random photo (a café hero that is a keyboard). Before the
 * build, this looks each description up on Pexels and swaps in a matching
 * photo cropped to the same size, never the same photo twice in one site.
 *
 * It is optional by design: without PEXELS_API_KEY, or for a description
 * Pexels has nothing for, the picsum URL stays and the site still builds.
 * Pexels asks for a visible credit, so a site that uses its photos gets
 * `photoCredit: true` in src/design.ts and its layout shows "Photos from
 * Pexels". Sites built before the layout had that line are left on picsum.
 */

const PEXELS_API_KEY = process.env.PEXELS_API_KEY?.trim() || ""
export const photosEnabled = Boolean(PEXELS_API_KEY)

const SEARCH_URL = "https://api.pexels.com/v1/search"
const REQUEST_TIMEOUT_MS = Number(process.env.PHOTO_TIMEOUT_MS || 8_000)
/** Searches at once; Pexels allows 200 an hour, the cache does most of the saving. */
const CONCURRENCY = 4
const PER_QUERY = 10
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60
const cacheKey = (orientation: string, query: string) => `rwaft:photos:v1:${orientation}:${query}`

/** A literal picsum URL with a description in it; `${…}` seeds are left alone. */
const SEED_URL = /https:\/\/picsum\.photos\/seed\/([A-Za-z0-9][A-Za-z0-9-]{0,79})\/(\d{2,4})\/(\d{2,4})/g
const SOURCE_FILE = /\.(tsx|ts|jsx|js|css)$/

export interface PhotoCache {
	get(key: string): Promise<string | null>
	set(key: string, value: string, options: { EX: number }): Promise<unknown>
}

interface Candidate {
	id: number
	/** The original image; sized with query parameters. */
	src: string
}

type Orientation = "landscape" | "portrait" | "square"

const orientationOf = (width: number, height: number): Orientation =>
	width > height * 1.15 ? "landscape" : height > width * 1.15 ? "portrait" : "square"

/** "espresso-cup-on-marble-counter" -> "espresso cup on marble counter" */
export const queryOf = (seed: string) => seed.toLowerCase().replace(/-+/g, " ").trim()

/** Pexels' own resizer: an exact crop at the size the page asked for. */
export const sizedUrl = (src: string, width: number, height: number) =>
	`${src.split("?")[0]}?auto=compress&cs=tinysrgb&fit=crop&w=${width}&h=${height}`

async function search(query: string, orientation: Orientation, cache: PhotoCache | undefined): Promise<Candidate[]> {
	const key = cacheKey(orientation, query)
	const cached = await cache?.get(key).catch(() => null)
	if (cached) {
		try {
			return JSON.parse(cached) as Candidate[]
		} catch { /* fetch again */ }
	}

	const url = `${SEARCH_URL}?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=${PER_QUERY}`
	const response = await fetch(url, {
		headers: { Authorization: PEXELS_API_KEY },
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	})
	if (!response.ok) throw new Error(`Pexels answered ${response.status}`)
	const data = await response.json() as { photos?: Array<{ id?: unknown; src?: { original?: unknown } }> }
	const candidates = (data.photos ?? [])
		.filter((photo) => typeof photo.id === "number" && typeof photo.src?.original === "string" && photo.src.original.startsWith("https://images.pexels.com/"))
		.map((photo) => ({ id: photo.id as number, src: photo.src!.original as string }))
	await cache?.set(key, JSON.stringify(candidates), { EX: CACHE_TTL_SECONDS }).catch(() => { })
	return candidates
}

async function listSources(dir: string, base = dir): Promise<string[]> {
	const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
	const files: string[] = []
	for (const entry of entries) {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) files.push(...await listSources(full, base))
		else if (SOURCE_FILE.test(entry.name)) files.push(full)
	}
	return files
}

/**
 * Swaps every described picsum photo in the project's src/ for a matching
 * Pexels photo. Returns how many it replaced. Never throws: a site with the
 * picsum photos it already has is better than a failed build.
 */
export async function resolvePhotos(projectDir: string, cache?: PhotoCache): Promise<number> {
	if (!photosEnabled) return 0
	try {
		const designFile = path.join(projectDir, "src", "design.ts")
		const design = await fs.readFile(designFile, "utf-8").catch(() => "")
		// Only a layout that can show the credit may use the photos.
		if (!/"photoCredit":\s*(true|false)/.test(design)) return 0

		const files = await listSources(path.join(projectDir, "src"))
		const contents = new Map<string, string>()
		const wanted = new Map<string, { query: string; orientation: Orientation }>()
		for (const file of files) {
			const content = await fs.readFile(file, "utf-8")
			if (!content.includes("picsum.photos/seed/")) continue
			contents.set(file, content)
			for (const match of content.matchAll(SEED_URL)) {
				const query = queryOf(match[1]!)
				// One letter or a number says nothing about the photo; leave it on picsum.
				if (query.length < 3 || /^\d+$/.test(query)) continue
				const orientation = orientationOf(Number(match[2]), Number(match[3]))
				wanted.set(`${orientation}:${query}`, { query, orientation })
			}
		}
		if (wanted.size === 0) return 0

		jobLog(`Finding ${wanted.size} photo${wanted.size === 1 ? "" : "s"} that match what each section shows…`)
		const found = new Map<string, Candidate[]>()
		const queue = [...wanted.entries()]
		await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
			for (let next = queue.shift(); next; next = queue.shift()) {
				const [key, { query, orientation }] = next
				try {
					found.set(key, await search(query, orientation, cache))
				} catch (error) {
					serverLog(`[photos] "${query}" (${orientation}): ${(error as Error).message}`, "warn")
				}
			}
		}))

		// Hand out photos in reading order, never the same one twice in a site.
		const used = new Set<number>()
		const chosen = new Map<string, Candidate>()
		let replaced = 0
		for (const [file, content] of contents) {
			const next = content.replace(SEED_URL, (whole, seed: string, width: string, height: string) => {
				const key = `${orientationOf(Number(width), Number(height))}:${queryOf(seed)}`
				let photo = chosen.get(`${key}:${width}x${height}`)
				if (!photo) {
					photo = found.get(key)?.find((candidate) => !used.has(candidate.id))
					if (!photo) return whole
					used.add(photo.id)
					chosen.set(`${key}:${width}x${height}`, photo)
				}
				replaced++
				return sizedUrl(photo.src, Number(width), Number(height))
			})
			if (next !== content) await fs.writeFile(file, next, "utf-8")
		}

		if (replaced > 0) {
			await fs.writeFile(designFile, design.replace(/"photoCredit":\s*false/, '"photoCredit": true'), "utf-8")
			jobLog(`Matched ${replaced} image${replaced === 1 ? "" : "s"} with real photos from Pexels`, "success")
		} else {
			jobLog("No matching photos found; keeping the placeholder images", "warn")
		}
		return replaced
	} catch (error) {
		serverLog(`[photos] Skipped: ${(error as Error).message}`, "warn")
		return 0
	}
}
