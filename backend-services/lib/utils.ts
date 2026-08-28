import fs from "fs/promises"
import path from "path"
import { randomBytes } from "node:crypto"

const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"
const ID_LENGTH = 8

/**
 * Deployment id.
 *
 * This is the only thing guarding a deployment's URL, so it is drawn from the
 * CSPRNG rather than Math.random. Rejection sampling keeps the distribution
 * uniform (256 % 36 != 0, so a plain modulo would bias the early letters).
 */
export const genId = (): string => {
	let id = ""
	while (id.length < ID_LENGTH) {
		for (const byte of randomBytes(ID_LENGTH * 2)) {
			if (byte >= 252) continue // 252 = 36 * 7; discard the biased tail
			id += ID_ALPHABET[byte % ID_ALPHABET.length]
			if (id.length === ID_LENGTH) break
		}
	}
	return id
}

export const isDeploymentId = (value: string): boolean => /^[a-z0-9]{8}$/.test(value)

/**
 * Client-supplied user ids key a Redis channel and a Redis list, so they are
 * constrained to an unambiguous, injection-free character set and a sane length.
 */
export const isUserId = (value: unknown): value is string =>
	typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value)

/** Generates a user id in the same shape the browser produces. */
export const genUserId = (): string => `u-${randomBytes(16).toString("hex")}`

/**
 * Accepts only public http(s) Git URLs. Blocks the ssh/file/git protocols and
 * obvious internal targets so `/deploy` cannot be used to make the server clone
 * from, or probe, the private network it runs in.
 */
export const validateRepositoryUrl = (raw: unknown): { ok: true; url: string } | { ok: false; reason: string } => {
	if (typeof raw !== "string" || raw.trim().length === 0) {
		return { ok: false, reason: "Repository URL is required" }
	}
	const value = raw.trim()
	if (value.length > 2_048) return { ok: false, reason: "Repository URL is too long" }

	let parsed: URL
	try {
		parsed = new URL(value)
	} catch {
		return { ok: false, reason: "Repository URL is not a valid URL" }
	}

	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
		return { ok: false, reason: "Only http(s) repository URLs are supported" }
	}
	if (parsed.username || parsed.password) {
		return { ok: false, reason: "Repository URL must not embed credentials" }
	}

	const host = parsed.hostname.toLowerCase()
	const isPrivateHost =
		host === "localhost" ||
		host === "0.0.0.0" ||
		host.endsWith(".local") ||
		host.endsWith(".internal") ||
		/^127\./.test(host) ||
		/^10\./.test(host) ||
		/^192\.168\./.test(host) ||
		/^169\.254\./.test(host) ||
		/^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
		host.startsWith("[")
	if (isPrivateHost) {
		return { ok: false, reason: "Repository URL must point at a public host" }
	}

	const allowedHosts = (process.env.ALLOWED_REPO_HOSTS || "github.com,gitlab.com,bitbucket.org")
		.split(",")
		.map((entry) => entry.trim().toLowerCase())
		.filter(Boolean)
	if (!allowedHosts.includes("*") && !allowedHosts.includes(host)) {
		return { ok: false, reason: `Repository host must be one of: ${allowedHosts.join(", ")}` }
	}

	return { ok: true, url: parsed.toString() }
}

export const getAllFileNames = (dir: string) => {
	const dfs = async (dir: string): Promise<string[]> => {
		let arr: string[] = []
		const files = await fs.readdir(dir)
		for (const file of files) {
			if (file === ".git") continue
			const fullPath = path.join(dir, file)
			const stat = await fs.stat(fullPath)
			if (stat.isDirectory()) {
				arr = arr.concat(await dfs(fullPath))
			} else {
				arr.push(fullPath)
			}
		}
		return arr
	}
	return dfs(dir)
}
