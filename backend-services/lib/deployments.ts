import { isAccountId } from "./accounts.ts"
import { MAX_DEPLOYMENTS_PER_ACCOUNT, statusKey, type DeploymentStatus } from "./constants.ts"
import { T, kv, q } from "./db.ts"

/**
 * The dashboard's memory.
 *
 * Everything else the API keeps about a job expires after a day: its status,
 * its source, its pull request. An account's deployments, and what each one
 * was, are kept for good (the newest MAX_DEPLOYMENTS_PER_ACCOUNT of them), so
 * the dashboard can list them from any device. Anonymous builds aren't
 * recorded: nobody could prove they own them later.
 *
 * A deployment is a row of the deployments table: its owner, project root and
 * creation time as columns, and everything else as string fields in `data`
 * (jsonb), so later facts (an outcome, a push, a pull request) merge in.
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

/** Records a job the API just accepted. A no-op unless it runs under an account. */
export async function recordDeployment(accountId: string | undefined, entry: NewDeployment): Promise<void> {
	if (!accountId || !isAccountId(accountId)) return
	// A change joins the project its parent belongs to.
	const parent = entry.parent ? (await q<{ root: string }>(`select root from ${T.deployments} where id = $1`, [entry.parent]))[0] : undefined
	const root = entry.parent ? parent?.root || entry.parent : entry.id
	const now = Date.now()
	const data: Record<string, string> = {
		kind: entry.kind,
		url: entry.url,
		status: "queued",
		charged: String(entry.charged),
		source: entry.source.slice(0, MAX_SOURCE_CHARS),
		...(entry.parent ? { parent: entry.parent } : {}),
		...(entry.repo ? { repo: entry.repo } : {}),
		...(entry.private ? { private: "1" } : {})
	}
	await q(`insert into ${T.deployments} (id, owner, root, created_at, data) values ($1, $2, $3, $4::bigint, $5::jsonb)
		on conflict (id) do nothing`, [entry.id, accountId, root, now, data])

	// Keep the newest; the oldest beyond the cap go.
	await q(`delete from ${T.deployments} where owner = $1 and id not in (
		select id from ${T.deployments} where owner = $1 order by created_at desc limit $2::int)`, [accountId, MAX_DEPLOYMENTS_PER_ACCOUNT])
}

/** Adds what happened later (a push to GitHub, an outcome) to a deployment that is still listed. */
export async function updateDeployment(id: string, fields: Record<string, string>): Promise<void> {
	if (Object.keys(fields).length === 0) return
	// An UPDATE only touches a row that exists, so a removed deployment isn't brought back.
	await q(`update ${T.deployments} set data = data || $2::jsonb where id = $1`, [id, fields])
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

interface DeploymentRow {
	id: string
	owner: string
	root: string
	created_at: number | string
	data: Record<string, unknown> | string
}

/** The row as the string fields toDeployment reads, the same shape the record always had. */
const fieldsOf = (row: DeploymentRow): Record<string, string> => {
	const data = typeof row.data === "string" ? JSON.parse(row.data) as Record<string, unknown> : row.data
	const fields: Record<string, string> = {}
	for (const [key, value] of Object.entries(data ?? {})) if (value !== null && value !== undefined) fields[key] = String(value)
	return { ...fields, owner: row.owner, root: row.root, createdAt: String(row.created_at) }
}

/** Every deployment the account has, newest first. */
export async function listDeployments(accountId: string): Promise<Deployment[]> {
	const rows = await q<DeploymentRow>(`select id, owner, root, created_at, data from ${T.deployments} where owner = $1 order by created_at desc`, [accountId])
	const deployments = rows.map((row) => toDeployment(row.id, fieldsOf(row))).filter((deployment): deployment is Deployment => deployment !== null)

	// Jobs the worker hasn't reported on (one it crashed on): their day-long status may still know.
	const pending = deployments.filter((deployment) => !FINAL_STATES.has(deployment.status))
	if (pending.length > 0) {
		const statuses = await kv.getMany(pending.map((deployment) => statusKey(deployment.id)))
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
	const [target] = await q<{ owner: string; root: string }>(`select owner, root from ${T.deployments} where id = $1`, [id])
	if (!target || target.owner !== accountId) return 0
	const removed = wholeProject
		? await q(`delete from ${T.deployments} where owner = $1 and (id = $2 or root = $3 or id = $3) returning id`, [accountId, id, target.root || id])
		: await q(`delete from ${T.deployments} where owner = $1 and id = $2 returning id`, [accountId, id])
	return removed.length
}
