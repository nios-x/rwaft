import { PR_TOKEN_DEADLINES, PR_WATCHING, prTokenKey, prWatchKey, type createRedisClient } from "./config.ts"
import { flushLogs, jobLog, runWithJobContext, type LogLevel } from "./joblog.ts"
import { GitHubClient, GitHubError, openToken, revokeToken } from "./github.ts"
import { updatePullRequest, type PullRequestRef } from "./pr.ts"
import { withBuildSlot } from "./jobslot.ts"

/**
 * Watching a pull request's checks, and fixing the ones that fail.
 *
 * rwaft can't build or test a repository it never clones, but the project's
 * own CI can. After a pull request opens (or a follow-up lands), the job
 * hands its token here instead of revoking it. Each visit reads the checks on
 * the branch's head commit; when they finish failing, the AI gets the
 * failing checks' logs and pushes a fix to the same branch, at most
 * CI_MAX_FIXES times, and the watch starts over on the new commit. It ends
 * when the checks pass, can't be fixed, stop being ours to touch, or take too
 * long, and the token is revoked then.
 *
 * Watches live in Redis, not in this process: PR_WATCHING is a sorted set of
 * job ids scored by when to look next. A visit claims its entry by moving the
 * score a lease ahead, so a worker that dies mid-visit leaves it to be picked
 * up again, and every visit pushes the token's revoke deadline forward, so a
 * watch nobody visits anymore gets its token revoked by the API's sweep.
 *
 * Its log lines go to the pull request job's own log; the console reads them
 * (frontend/lib/stages.ts), so keep the wording in sync.
 */

type RedisLike = ReturnType<typeof createRedisClient>

const WATCH_WINDOW_MS = Number(process.env.CI_WATCH_WINDOW_MS || 30 * 60_000)
const NO_CHECKS_MS = Number(process.env.CI_NO_CHECKS_MS || 4 * 60_000)
const MAX_FIXES = Math.max(0, Number(process.env.CI_MAX_FIXES || 2))
const POLL_MS = Number(process.env.CI_POLL_MS || 30_000)
const FIRST_LOOK_MS = 15_000
const LOOP_MS = 5_000
const MAX_PARALLEL = 3
const FIX_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS || 15 * 60_000)
/** A visit's claim on its watch; longer than a fix, so a slow fix isn't visited twice. */
const LEASE_MS = FIX_TIMEOUT_MS + 5 * 60_000
/** How far each visit pushes the token's revoke deadline. */
const TOKEN_HEARTBEAT_MS = LEASE_MS + 10 * 60_000
const WATCH_KEEP_SECONDS = 24 * 60 * 60
const LOG_CHARS_PER_CHECK = 12_000
const MAX_CHECKS_REPORTED = 3

export interface Watch {
	jobId: string
	userId: string
	pr: PullRequestRef
	/** The head commit whose checks are being followed. */
	sha: string
	/** When that commit was pushed. */
	since: number
	fixes: number
	/** The last "Checks: …" line logged, so only changes are logged. */
	summary?: string
	announced?: boolean
}

/** Hands a finished PR job's token to the watch. The caller must not revoke it after this. */
export async function startWatching(redis: RedisLike, watch: Watch): Promise<void> {
	await redis.multi()
		.set(prWatchKey(watch.jobId), JSON.stringify(watch), { EX: WATCH_KEEP_SECONDS })
		.zAdd(PR_WATCHING, { score: Date.now() + FIRST_LOOK_MS, value: watch.jobId })
		.zAdd(PR_TOKEN_DEADLINES, { score: Date.now() + TOKEN_HEARTBEAT_MS, value: watch.jobId })
		.exec()
}

/** Claims a due watch by moving it a lease ahead; 1 when this visit owns it. */
const CLAIM_SCRIPT = `
local score = redis.call('ZSCORE', KEYS[1], ARGV[1])
if score and tonumber(score) <= tonumber(ARGV[2]) then
	redis.call('ZADD', KEYS[1], ARGV[3], ARGV[1])
	return 1
end
return 0
`

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Visits due watches until told to stop. Runs beside the job pumps in the worker. */
export async function watchChecksForever(createClient: () => RedisLike, stopping: () => boolean): Promise<void> {
	const redis = createClient()
	await redis.connect()
	const active = new Set<string>()
	console.log(`[ci] Watching pull request checks (${PR_WATCHING})`)
	while (!stopping()) {
		try {
			const now = Date.now()
			const due = await redis.zRangeByScore(PR_WATCHING, "-inf", now, { LIMIT: { offset: 0, count: MAX_PARALLEL * 2 } })
			for (const jobId of due) {
				if (active.has(jobId) || active.size >= MAX_PARALLEL) continue
				const claimed = Number(await redis.sendCommand(["EVAL", CLAIM_SCRIPT, "1", PR_WATCHING, jobId, String(now), String(now + LEASE_MS)]))
				if (claimed !== 1) continue
				active.add(jobId)
				void visitWatch(redis, jobId)
					.catch((error) => console.error(`[ci] Visit to ${jobId} failed:`, (error as Error).message))
					.finally(() => active.delete(jobId))
			}
		} catch (error) {
			if (stopping()) break
			console.error("[ci] Watch loop failed, backing off:", (error as Error).message)
		}
		await sleep(LOOP_MS)
	}
	// Whatever is mid-visit keeps its lease and is picked up again after a restart.
	await redis.quit().catch(() => { })
}

type Step =
	| { done: true; message: string; level: LogLevel }
	| { done: false; delay: number; watch: Watch }

/** One visit to one watch: look at its checks, then wait, finish or fix. Exported for tests. */
export async function visitWatch(redis: RedisLike, jobId: string): Promise<void> {
	const raw = await redis.get(prWatchKey(jobId))
	if (!raw) {
		await redis.zRem(PR_WATCHING, jobId)
		return
	}
	const watch = JSON.parse(raw) as Watch
	await runWithJobContext({ jobId, userId: watch.userId, kind: "pr" }, async () => {
		let token: string | null = null
		try {
			const sealed = await redis.get(prTokenKey(jobId))
			if (!sealed) {
				await finish(redis, watch, null, "Stopped watching checks: GitHub access for it ran out", "warn")
				return
			}
			try {
				token = openToken(sealed)
			} catch {
				await finish(redis, watch, null, "Stopped watching checks: GitHub access for it couldn't be read", "warn")
				return
			}
			await redis.zAdd(PR_TOKEN_DEADLINES, { score: Date.now() + TOKEN_HEARTBEAT_MS, value: jobId })

			let step: Step
			try {
				step = await look(redis, new GitHubClient(token), watch)
			} catch (error) {
				// GitHub having a bad minute shouldn't end the watch; the next visit tries again.
				if (error instanceof GitHubError && (error.status >= 500 || error.status === 429)) step = { done: false, delay: POLL_MS * 2, watch }
				else if (error instanceof GitHubError && error.status === 401) step = { done: true, message: "Stopped watching checks: GitHub access for it was revoked", level: "warn" }
				else step = { done: true, message: `Stopped watching checks: ${(error as Error).message}`, level: "warn" }
			}
			if (step.done) {
				await finish(redis, watch, token, step.message, step.level)
			} else {
				await redis.multi()
					.set(prWatchKey(jobId), JSON.stringify(step.watch), { EX: WATCH_KEEP_SECONDS })
					.zAdd(PR_WATCHING, { score: Date.now() + step.delay, value: jobId })
					.exec()
			}
		} finally {
			await flushLogs()
		}
	})
}

/** Ends a watch: says why, forgets it, and revokes its token. */
async function finish(redis: RedisLike, watch: Watch, token: string | null, message: string, level: LogLevel) {
	jobLog(message, level)
	await redis.multi()
		.del(prWatchKey(watch.jobId))
		.zRem(PR_WATCHING, watch.jobId)
		.del(prTokenKey(watch.jobId))
		.zRem(PR_TOKEN_DEADLINES, watch.jobId)
		.exec()
	if (token) await revokeToken(token).catch((error) => console.warn(`[ci] Token revoke for ${watch.jobId} failed:`, (error as Error).message))
}

// ── Reading the checks ──────────────────────────────────────────────────────

interface Check {
	name: string
	state: "running" | "passed" | "failed" | "approval"
	/** An Actions job's id, whose log can be downloaded. */
	actionsJob?: number
	summary?: string
	url?: string
}

interface CheckRun {
	id: number
	name: string
	status: string
	conclusion: string | null
	details_url?: string | null
	app?: { slug?: string } | null
	output?: { title?: string | null; summary?: string | null; text?: string | null }
}

async function readChecks(github: GitHubClient, pr: PullRequestRef, sha: string): Promise<Check[]> {
	const [runs, combined] = await Promise.all([
		github.get<{ check_runs: CheckRun[] }>(`/repos/${pr.repo}/commits/${sha}/check-runs?per_page=100&filter=latest`),
		github.get<{ statuses: Array<{ context: string; state: string; description?: string | null; target_url?: string | null }> }>(`/repos/${pr.repo}/commits/${sha}/status`)
	])
	const checks: Check[] = []
	for (const run of runs.check_runs) {
		const conclusion = run.conclusion ?? ""
		// A cancelled or stale run was superseded, usually by a newer push; it says nothing about this commit.
		if (run.status === "completed" && ["cancelled", "stale"].includes(conclusion)) continue
		const state: Check["state"] = run.status !== "completed" ? "running"
			: ["success", "neutral", "skipped"].includes(conclusion) ? "passed"
			: conclusion === "action_required" ? "approval"
			: "failed"
		const summary = [run.output?.title, run.output?.summary, run.output?.text].filter(Boolean).join("\n").trim()
		checks.push({
			name: run.name,
			state,
			...(run.app?.slug === "github-actions" ? { actionsJob: run.id } : {}),
			...(summary ? { summary } : {}),
			...(run.details_url ? { url: run.details_url } : {})
		})
	}
	for (const status of combined.statuses) {
		checks.push({
			name: status.context,
			state: status.state === "pending" ? "running" : status.state === "success" ? "passed" : "failed",
			...(status.description ? { summary: status.description } : {}),
			...(status.target_url ? { url: status.target_url } : {})
		})
	}
	return checks
}

/** Whether checks on a fork's pull request are held for a maintainer's approval. */
async function awaitingApproval(github: GitHubClient, pr: PullRequestRef, sha: string): Promise<boolean> {
	try {
		const runs = await github.get<{ workflow_runs: Array<{ status: string; conclusion: string | null }> }>(`/repos/${pr.repo}/actions/runs?head_sha=${sha}&per_page=20`)
		return runs.workflow_runs.some((run) => run.conclusion === "action_required" || run.status === "waiting" || run.status === "action_required")
	} catch {
		return false
	}
}

/** One look at the checks: wait, finish, or fix. */
async function look(redis: RedisLike, github: GitHubClient, watch: Watch): Promise<Step> {
	const { pr } = watch
	if (!watch.announced) {
		jobLog(`Watching the checks on pull request #${pr.number}…`)
		watch = { ...watch, announced: true }
	}

	// Only ever fix our own commit: a branch that moved or vanished isn't ours to touch anymore.
	let head: { object: { sha: string } }
	try {
		head = await github.get(`/repos/${pr.head}/git/ref/heads/${pr.branch}`)
	} catch (error) {
		if (error instanceof GitHubError && error.status === 404) return { done: true, message: "Stopped watching checks: the pull request's branch is gone (merged or deleted?)", level: "info" }
		throw error
	}
	if (head.object.sha !== watch.sha) return { done: true, message: "Stopped watching checks: someone else pushed to the branch", level: "info" }

	const checks = await readChecks(github, pr, watch.sha)
	const elapsed = Date.now() - watch.since
	const count = (state: Check["state"]) => checks.filter((check) => check.state === state).length

	if (checks.length === 0) {
		if (elapsed < NO_CHECKS_MS) return { done: false, delay: POLL_MS, watch }
		return await awaitingApproval(github, pr, watch.sha)
			? { done: true, message: "Stopped watching checks: they're waiting for a maintainer to approve them", level: "info" }
			: { done: true, message: "No checks ran on this pull request", level: "info" }
	}
	if (count("approval") > 0) return { done: true, message: "Stopped watching checks: they're waiting for a maintainer to approve them", level: "info" }

	const running = count("running")
	const failed = checks.filter((check) => check.state === "failed")
	if (running > 0) {
		const summary = `Checks: ${running} running, ${count("passed")} passed${failed.length > 0 ? `, ${failed.length} failed` : ""}`
		if (summary !== watch.summary) {
			jobLog(summary)
			watch = { ...watch, summary }
		}
		if (elapsed > WATCH_WINDOW_MS) return { done: true, message: `Stopped watching checks: they didn't finish within ${Math.round(WATCH_WINDOW_MS / 60_000)} minutes`, level: "warn" }
		return { done: false, delay: POLL_MS, watch }
	}

	if (failed.length === 0) return { done: true, message: `All ${checks.length} check${checks.length === 1 ? "" : "s"} passed`, level: "success" }
	const names = failed.map((check) => check.name)
	if (watch.fixes >= MAX_FIXES) {
		return { done: true, message: `Checks still fail after ${MAX_FIXES} fix${MAX_FIXES === 1 ? "" : "es"}: ${names.join(", ")}. Over to you`, level: "warn" }
	}
	return fix(redis, github, watch, failed)
}

// ── Fixing ──────────────────────────────────────────────────────────────────

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g
const TIMESTAMP = /^\d{4}-\d\d-\d\dT[\d:.]+Z ?/
const SIGNAL = /error|fail|exception|panic|traceback|assert|expected|✕|✖|×|cannot find|not found|undefined/i

/** The part of a CI log worth a model's attention: lines that look like errors, then the end. */
export function logExcerpt(log: string, budget = LOG_CHARS_PER_CHECK): string {
	const lines = log.replace(ANSI, "").split(/\r?\n/).map((line) => line.replace(TIMESTAMP, "")).filter((line) => line.trim())
	const tail: string[] = []
	let used = 0
	for (let index = lines.length - 1; index >= 0 && used < budget * 0.6; index--) {
		tail.unshift(lines[index]!.slice(0, 400))
		used += tail[0]!.length + 1
	}
	const tailStart = lines.length - tail.length
	const signals = lines.slice(0, tailStart).filter((line) => SIGNAL.test(line)).slice(-40).map((line) => line.slice(0, 300))
	return [...(signals.length > 0 ? ["(error-looking lines from earlier in the log)", ...signals, "(the end of the log)"] : []), ...tail].join("\n")
}

async function failureReport(github: GitHubClient, pr: PullRequestRef, failed: Check[]): Promise<string> {
	const sections: string[] = []
	for (const check of failed.slice(0, MAX_CHECKS_REPORTED)) {
		let detail = check.summary ? check.summary.slice(0, 4_000) : ""
		if (check.actionsJob) {
			try {
				const log = await github.download(`/repos/${pr.repo}/actions/jobs/${check.actionsJob}/logs`)
				detail = `${detail ? `${detail}\n\n` : ""}Log:\n${logExcerpt(log)}`
			} catch (error) {
				detail = `${detail ? `${detail}\n\n` : ""}(Its log couldn't be downloaded: ${(error as Error).message})`
			}
		}
		sections.push(`### ${check.name}${check.url ? ` (${check.url})` : ""}\n${detail || "(GitHub gave no details for this check.)"}`)
	}
	if (failed.length > MAX_CHECKS_REPORTED) sections.push(`Also failing: ${failed.slice(MAX_CHECKS_REPORTED).map((check) => check.name).join(", ")}`)
	return [
		"The checks on this pull request failed after its last commit. Find the cause in the failing checks below and fix the code so they pass.",
		"Change only what the failure needs. If the failure isn't caused by this repository's code (an outage, a missing secret, a flaky runner, a check that needs a maintainer), reply <cannot reason=\"...\" /> while exploring instead of changing anything.",
		"",
		"FAILING CHECKS:",
		...sections
	].join("\n")
}

const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
	let timer: ReturnType<typeof setTimeout>
	return Promise.race([
		promise,
		new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms) })
	]).finally(() => clearTimeout(timer!))
}

async function fix(redis: RedisLike, github: GitHubClient, watch: Watch, failed: Check[]): Promise<Step> {
	const names = failed.map((check) => check.name)
	jobLog(`Check failed: ${names.join(", ")}. Asking the AI to fix it (${watch.fixes + 1}/${MAX_FIXES})…`, "warn")
	const report = await failureReport(github, watch.pr, failed)
	// A fix runs for minutes; keep the token's deadline well ahead of it.
	await redis.zAdd(PR_TOKEN_DEADLINES, { score: Date.now() + TOKEN_HEARTBEAT_MS, value: watch.jobId })
	try {
		const result = await withBuildSlot(() => withTimeout(
			updatePullRequest(github, watch.pr, { jobId: watch.jobId, request: report, kind: "fix", checks: names }),
			FIX_TIMEOUT_MS,
			"The fix"
		))
		jobLog(`Pushed a fix to ${watch.pr.branch}: ${result.files.join(", ")}`, "success")
		return { done: false, delay: FIRST_LOOK_MS, watch: { ...watch, sha: result.sha, since: Date.now(), fixes: watch.fixes + 1, summary: undefined } }
	} catch (error) {
		return { done: true, message: `Stopped watching checks: couldn't fix ${names.join(", ")} (${(error as Error).message})`, level: "warn" }
	}
}
