import { isAccountId } from "./accounts.ts"
import {
	DEPLOYMENT_STATUS_PREFIX,
	MAX_DEPLOYMENTS_PER_ACCOUNT,
	accountDeploymentsKey,
	deploymentKey,
	type DeploymentStatus
} from "./constants.ts"
import { getRedisClient } from "./redis.ts"

/**
 * The dashboard's memory.
 *
 * Everything else the API keeps about a job expires after a day: its status,
 * its source, its pull request. An account's deployments, and what each one
 * was, are kept for good (the newest MAX_DEPLOYMENTS_PER_ACCOUNT of them), so
 * the dashboard can list them from any device. Anonymous builds aren't
 * recorded: nobody could prove they own them later.
 */

export type DeploymentKind = "prompt" | "deploy" | "pr"

export interface PullRequestSummary {
	url: string
	number: number | null
	title: string
	/** The branch the change was pushed to. */
	branch: string
	base: string
	/** Opened from the user's fork, because they couldn't push to the repository. */
	fork: boolean
}

export interface Deployment {
	id: string
	kind: DeploymentKind
	/** The live site; for a pull request job, the pull request (or the repository until it opens). */
	url: string
	createdAt: number
	/** "unknown" once the day-long status key is gone and the worker never said how it ended. */
	status: DeploymentStatus | "unknown"
	finishedAt: number | null
	error: string | null
	charged: number
	/** The prompt, the repository URL, or the change asked of a pull request. */
	source: string
	/** The build this one changed (a prompt follow-up, or a commit added to a pull request). */
	parent: string | null
	/** The first build of its chain: what the dashboard groups into one project. */
	root: string
	/** deploy: the repository URL it was built from. pr: "owner/name". */
	repo: string | null
	private: boolean
	/** Where "Push to GitHub" put a prompt build's code. */
	repoUrl: string | null
	pr: PullRequestSummary | null
}

export interface NewDeployment {
	id: string
	kind: DeploymentKind
	url: string
	source: string
	charged: number
	parent?: string
	repo?: string
	private?: boolean
}

const MAX_SOURCE_CHARS = 2_000
const MAX_ERROR_CHARS = 300
const FINAL_STATES = new Set(["ready", "failed"])
const STATES = new Set(["queued", "building", "ready", "failed"])

/** Writes fields onto a deployment only if it still exists, so a removed one isn't brought back. */
const UPDATE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then
	return redis.call('HSET', KEYS[1], unpack(ARGV))
end
return -1
`

/** Records a job the API just accepted. A no-op unless it runs under an account. */
export async function recordDeployment(accountId: string | undefined, entry: NewDeployment): Promise<void> {
	if (!accountId || !isAccountId(accountId)) return
	const redis = await getRedisClient()
	// A change joins the project its parent belongs to.
	const root = entry.parent ? (await redis.hGet(deploymentKey(entry.parent), "root")) || entry.parent : entry.id
	const now = Date.now()
	const listKey = accountDeploymentsKey(accountId)

	await redis.multi()
		.hSet(deploymentKey(entry.id), {
			owner: accountId,
			kind: entry.kind,
			url: entry.url,
			createdAt: String(now),
			status: "queued",
			charged: String(entry.charged),
			source: entry.source.slice(0, MAX_SOURCE_CHARS),
			root,
			...(entry.parent ? { parent: entry.parent } : {}),
			...(entry.repo ? { repo: entry.repo } : {}),
			...(entry.private ? { private: "1" } : {})
		})
		.zAdd(listKey, { score: now, value: entry.id })
		.exec()

	// Keep the newest; the oldest beyond the cap go, record and all.
	const overflow = (await redis.zCard(listKey)) - MAX_DEPLOYMENTS_PER_ACCOUNT
	if (overflow > 0) {
		const oldest = await redis.zRange(listKey, 0, overflow - 1)
		if (oldest.length > 0) await redis.multi().del(oldest.map(deploymentKey)).zRem(listKey, oldest).exec()
	}
}

/** Adds what happened later (a push to GitHub, an outcome) to a deployment that is still listed. */
export async function updateDeployment(id: string, fields: Record<string, string>): Promise<void> {
	const pairs = Object.entries(fields).flat()
	if (pairs.length === 0) return
	const redis = await getRedisClient()
	await redis.sendCommand(["EVAL", UPDATE_SCRIPT, "1", deploymentKey(id), ...pairs])
}

const toDeployment = (id: string, fields: Record<string, string>): Deployment | null => {
	if (!fields.owner || !fields.kind) return null
	const kind = fields.kind === "deploy" || fields.kind === "pr" ? fields.kind : "prompt"
	return {
		id,
		kind,
		url: fields.url || "",
		createdAt: Number(fields.createdAt) || 0,
		status: STATES.has(fields.status ?? "") ? fields.status as DeploymentStatus : "unknown",
		finishedAt: Number(fields.finishedAt) || null,
		error: fields.error ? fields.error.slice(0, MAX_ERROR_CHARS) : null,
		charged: Number(fields.charged) || 0,
		source: fields.source || "",
		parent: fields.parent || null,
		root: fields.root || id,
		repo: fields.repo || null,
		private: fields.private === "1",
		repoUrl: fields.repoUrl || null,
		pr: fields.prUrl
			? {
				url: fields.prUrl,
				number: Number(fields.prNumber) || null,
				title: fields.prTitle || "",
				branch: fields.prBranch || "",
				base: fields.prBase || "",
				fork: fields.prFork === "1"
			}
			: null
	}
}

/** Every deployment the account has, newest first. */
export async function listDeployments(accountId: string): Promise<Deployment[]> {
	const redis = await getRedisClient()
	const listKey = accountDeploymentsKey(accountId)
	const ids = (await redis.zRange(listKey, 0, -1)).reverse()
	if (ids.length === 0) return []

	// Issued in one tick, so node-redis pipelines them.
	const rows = await Promise.all(ids.map((id) => redis.hGetAll(deploymentKey(id))))
	const deployments: Deployment[] = []
	const missing: string[] = []
	ids.forEach((id, index) => {
		const fields = rows[index] as Record<string, string> | undefined
		const deployment = fields && fields.owner === accountId ? toDeployment(id, fields) : null
		if (deployment) deployments.push(deployment)
		else missing.push(id)
	})
	if (missing.length > 0) await redis.zRem(listKey, missing).catch(() => { })

	// Jobs the worker hasn't reported on (one from before it recorded outcomes,
	// or one it crashed on): their day-long status key may still know.
	const pending = deployments.filter((deployment) => !FINAL_STATES.has(deployment.status))
	if (pending.length > 0) {
		const statuses = await redis.mGet(pending.map((deployment) => `${DEPLOYMENT_STATUS_PREFIX}${deployment.id}`))
		await Promise.all(pending.map(async (deployment, index) => {
			const status = statuses[index]
			if (!status) {
				deployment.status = "unknown"
				return
			}
			if (status === deployment.status || !STATES.has(status)) return
			deployment.status = status as DeploymentStatus
			if (FINAL_STATES.has(status)) await updateDeployment(deployment.id, { status }).catch(() => { })
		}))
	}
	return deployments
}

/**
 * Takes a deployment, or its whole project, off the account's list. The live
 * site stays up: this only forgets it. Returns how many were removed; 0 when
 * the deployment isn't this account's.
 */
export async function removeDeployments(accountId: string, id: string, wholeProject: boolean): Promise<number> {
	const redis = await getRedisClient()
	const [owner, root] = await redis.hmGet(deploymentKey(id), ["owner", "root"])
	if (owner !== accountId) return 0

	const listKey = accountDeploymentsKey(accountId)
	let ids = [id]
	if (wholeProject) {
		const project = root || id
		const all = await redis.zRange(listKey, 0, -1)
		const roots = await Promise.all(all.map((other) => redis.hGet(deploymentKey(other), "root")))
		ids = all.filter((other, index) => other === project || roots[index] === project)
		if (!ids.includes(id)) ids.push(id)
	}
	await redis.multi().del(ids.map(deploymentKey)).zRem(listKey, ids).exec()
	return ids.length
}
