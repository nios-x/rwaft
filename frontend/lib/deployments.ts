import { BACKEND_URL, readApiJson } from "./config"
import type { BuildState } from "./builds"
import { buildTitle, type RecentBuild } from "./recentBuilds"
import type { BuildKind } from "./stages"

/**
 * The dashboard's data: what the API remembers for a signed-in account
 * (backend-services/lib/deployments.ts), merged with the builds this browser
 * remembers, grouped into projects. A project is a first build plus every
 * change made to it since.
 */

export type DeploymentStatus = "queued" | "building" | "ready" | "failed" | "unknown"

export interface PullRequestSummary {
	url: string
	number: number | null
	title: string
	branch: string
	base: string
	fork: boolean
}

export interface Deployment {
	id: string
	kind: BuildKind
	/** The live site; for a pull request job, the pull request (or its repository until it opens). */
	url: string
	createdAt: number
	status: DeploymentStatus
	finishedAt: number | null
	error: string | null
	charged: number
	/** The prompt, the repository URL, or the change asked of a pull request. */
	source: string
	parent: string | null
	root: string
	/** deploy: the repository URL. pr: "owner/name". */
	repo: string | null
	private: boolean
	/** Where "Push to GitHub" put a prompt build's code. */
	repoUrl: string | null
	pr: PullRequestSummary | null
	/** Known only to this browser: built before the dashboard existed, or before signing in. */
	local?: boolean
}

export interface RepoLink {
	/** "owner/name". */
	label: string
	url: string
	github: boolean
}

export interface Project {
	/** The first build's id. */
	id: string
	kind: BuildKind
	title: string
	/** Newest first. */
	deployments: Deployment[]
	latest: Deployment
	/** The newest deployment that went live: the one the project's link points at. */
	live: Deployment | null
	createdAt: number
	updatedAt: number
	repo: RepoLink | null
	/** The newest pull request a PR project opened or added to. */
	pr: PullRequestSummary | null
	charged: number
	/** Every deployment is known only to this browser. */
	local: boolean
}

export const STATUS_STATE: Record<DeploymentStatus, BuildState | null> = {
	queued: "line",
	building: "building",
	ready: "live",
	failed: "failed",
	unknown: null,
}

export const STATUS_LABEL: Record<DeploymentStatus, string> = {
	queued: "In line",
	building: "Building",
	ready: "Live",
	failed: "Failed",
	unknown: "No status",
}

export const KIND_LABEL: Record<BuildKind, string> = {
	prompt: "App",
	deploy: "Repository",
	pr: "Pull request",
}

export const inFlight = (deployment: Pick<Deployment, "status">) =>
	deployment.status === "queued" || deployment.status === "building"

/** A URL without its protocol or trailing slash, as an address bar shows it. */
export const hostOf = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "")

/** "owner/name" from a repository URL on any host. */
export function repoFromUrl(url: string): RepoLink | null {
	try {
		const parsed = new URL(url)
		const [owner, name] = parsed.pathname.replace(/^\/+|\.git$|\/+$/g, "").split("/")
		if (!owner || !name) return null
		return { label: `${owner}/${name}`, url: `${parsed.origin}/${owner}/${name}`, github: parsed.hostname.replace(/^www\./, "") === "github.com" }
	} catch {
		return null
	}
}

export async function fetchDeployments(headers: Record<string, string>): Promise<Deployment[]> {
	const response = await fetch(`${BACKEND_URL}/me/deployments`, { headers, cache: "no-store" })
	const data = await readApiJson<{ deployments?: Deployment[]; message?: string }>(response)
	if (!response.ok || !Array.isArray(data.deployments)) {
		throw new Error(data.message || "Your deployments couldn't be loaded")
	}
	return data.deployments
}

/** Forgets a deployment, or its whole project, on the server. The live sites stay up. */
export async function removeFromServer(id: string, wholeProject: boolean, headers: Record<string, string>): Promise<void> {
	const response = await fetch(`${BACKEND_URL}/me/deployments/${id}${wholeProject ? "?scope=project" : ""}`, { method: "DELETE", headers })
	// 404: never on the server (a build only this browser knows), which is fine.
	if (response.ok || response.status === 404) return
	const data = await readApiJson<{ message?: string }>(response).catch(() => ({ message: undefined }))
	throw new Error(data.message || "That couldn't be removed right now")
}

const fromRecentBuild = (build: RecentBuild, root: string): Deployment => ({
	id: build.id,
	kind: build.kind,
	url: build.pr?.url ?? build.url,
	createdAt: build.at,
	status: build.outcome ?? "unknown",
	finishedAt: build.settledAt ?? null,
	error: null,
	charged: build.charged || 0,
	source: build.source ?? "",
	parent: build.parentId ?? null,
	root,
	repo: build.kind === "deploy" ? build.source ?? null : build.repo ?? null,
	private: build.private ?? false,
	repoUrl: build.repoUrl ?? null,
	pr: build.pr ? { url: build.pr.url, number: build.pr.number, title: build.pr.title, branch: "", base: "", fork: build.pr.fork } : null,
	local: true,
})

/**
 * The server's records, plus this browser's builds the server never saw.
 * Where both know a build, the server wins, and the browser only fills what
 * the server lacks (a push or pull request from before the dashboard).
 */
export function mergeDeployments(server: Deployment[], local: RecentBuild[]): Deployment[] {
	const byId = new Map(server.map((deployment) => [deployment.id, { ...deployment }]))
	const localById = new Map(local.map((build) => [build.id, build]))

	const rootOf = (build: RecentBuild): string => {
		let current = build
		for (let hops = 0; hops < 50; hops++) {
			const parent = current.parentId
			if (!parent) return current.id
			const known = byId.get(parent)
			if (known) return known.root
			const next = localById.get(parent)
			if (!next) return parent
			current = next
		}
		return current.id
	}

	for (const build of local) {
		const known = byId.get(build.id)
		if (!known) {
			byId.set(build.id, fromRecentBuild(build, rootOf(build)))
			continue
		}
		if (!known.repoUrl && build.repoUrl) known.repoUrl = build.repoUrl
		if (!known.pr && build.pr) known.pr = { url: build.pr.url, number: build.pr.number, title: build.pr.title, branch: "", base: "", fork: build.pr.fork }
	}
	return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt)
}

const TITLE_LIMIT = 48

/**
 * A name for a project from the prompt that started it: the thing itself,
 * without the article or the list of features ("A menu page for a small café
 * with opening hours, …" becomes "Menu page for a small café"). The full
 * prompt stays on screen beside it.
 */
export function shortTitle(source: string): string {
	let text = source.replace(/\s+/g, " ").trim()
	text = text.replace(/^(please\s+)?(make|build|create|generate)\s+(me\s+)?/i, "").replace(/^(a|an|the)\s+/i, "")
	const cut = text.search(/,|;|:|\.\s|\s(with|that|which|where|so|using|including)\s|\s[-–—]\s/i)
	if (cut >= 12) text = text.slice(0, cut)
	if (text.length > TITLE_LIMIT) {
		const words = text.slice(0, TITLE_LIMIT + 1).split(" ")
		text = `${words.slice(0, -1).join(" ")}…`
	}
	text = text.replace(/[.,;:\s]+$/, "")
	return text ? text.charAt(0).toUpperCase() + text.slice(1) : ""
}

function projectTitle(kind: BuildKind, first: Deployment, deployments: Deployment[]): string {
	if (kind === "deploy") return repoFromUrl(first.source)?.label ?? buildTitle({ kind, source: first.source, id: first.id })
	if (kind === "pr") {
		const titled = deployments.find((deployment) => deployment.pr?.title)
		if (titled?.pr) return titled.pr.title
	}
	return shortTitle(first.source) || buildTitle({ kind, source: first.source, id: first.id })
}

export function groupProjects(deployments: Deployment[]): Project[] {
	const groups = new Map<string, Deployment[]>()
	for (const deployment of deployments) {
		const list = groups.get(deployment.root)
		if (list) list.push(deployment)
		else groups.set(deployment.root, [deployment])
	}

	const projects: Project[] = []
	for (const [id, list] of groups) {
		list.sort((a, b) => b.createdAt - a.createdAt)
		const latest = list[0]!
		const first = list.find((deployment) => deployment.id === id) ?? list[list.length - 1]!
		const kind = first.kind
		const repo =
			kind === "deploy" ? repoFromUrl(first.repo ?? first.source)
			: kind === "pr" ? (first.repo ? { label: first.repo, url: `https://github.com/${first.repo}`, github: true } : null)
			: (() => {
				const pushed = list.find((deployment) => deployment.repoUrl)
				return pushed?.repoUrl ? repoFromUrl(pushed.repoUrl) : null
			})()
		projects.push({
			id,
			kind,
			title: projectTitle(kind, first, list),
			deployments: list,
			latest,
			live: list.find((deployment) => deployment.status === "ready") ?? null,
			createdAt: list[list.length - 1]!.createdAt,
			updatedAt: latest.createdAt,
			repo,
			pr: list.find((deployment) => deployment.pr)?.pr ?? null,
			charged: list.reduce((sum, deployment) => sum + deployment.charged, 0),
			local: list.every((deployment) => deployment.local),
		})
	}
	return projects.sort((a, b) => b.updatedAt - a.updatedAt)
}

/** What the console needs to open a deployment, written to this browser's list first. */
export function toRecentBuild(deployment: Deployment, existing?: RecentBuild): RecentBuild {
	const outcome = deployment.status === "ready" || deployment.status === "failed" ? deployment.status : undefined
	return {
		...existing,
		id: deployment.id,
		kind: deployment.kind,
		url: existing?.url ?? deployment.url,
		at: deployment.createdAt,
		charged: deployment.charged,
		source: deployment.source || existing?.source,
		...(deployment.parent ? { parentId: deployment.parent } : {}),
		...(outcome ? { outcome, settledAt: existing?.settledAt ?? deployment.finishedAt ?? deployment.createdAt } : {}),
		...(deployment.repoUrl ? { repoUrl: deployment.repoUrl } : {}),
		...(deployment.kind === "pr" && deployment.repo ? { repo: deployment.repo, private: deployment.private } : {}),
		...(deployment.pr ? { pr: { url: deployment.pr.url, title: deployment.pr.title, number: deployment.pr.number, files: existing?.pr?.files ?? [], fork: deployment.pr.fork } } : {}),
	}
}

/** "3m 12s" from request to outcome; the queue wait is part of it, as the maker lived it. */
export function duration(deployment: Pick<Deployment, "createdAt" | "finishedAt">): string | null {
	if (!deployment.finishedAt || deployment.finishedAt < deployment.createdAt) return null
	const seconds = Math.round((deployment.finishedAt - deployment.createdAt) / 1_000)
	if (seconds < 60) return `${seconds}s`
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes}m ${seconds % 60}s`
	return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export const fullDate = (ts: number) =>
	new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
