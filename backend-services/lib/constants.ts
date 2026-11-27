/**
 * Names shared with build-services. Keep in sync with build-services/lib/config.ts.
 *
 * Redis holds only the job queues and their schedules. Everything else is in
 * Postgres (lib/db.ts): the key helpers below name rows of its expiring
 * key-value table, not Redis keys.
 */

// ── Redis: the job queues ──────────────────────────────────────────────────
export const DEPLOY_QUEUE = "rwaft:deploy"
export const PROMPT_QUEUE = "rwaft:prompt"
/** "Open a pull request": an AI change to a GitHub repository, made through the API without cloning it. */
export const PR_QUEUE = "rwaft:pr"
export const DEPLOY_PROCESSING = "rwaft:deploy:processing"
export const PROMPT_PROCESSING = "rwaft:prompt:processing"
export const PR_PROCESSING = "rwaft:pr:processing"

/**
 * Build line, shared with the worker. Both are sorted sets: WAITING is scored
 * by enqueue time, so a job's rank is its place in line; ACTIVE is scored by
 * start time, so entries a crashed worker never removed can be pruned by age.
 */
export const BUILD_WAITING = "rwaft:builds:waiting"
export const BUILD_ACTIVE = "rwaft:builds:active"

/**
 * Every sealed PR token's job id, scored by the time its token must be
 * revoked: a schedule, so it stays in Redis beside the queues. The job (or
 * its CI watch) revokes its own token and moves the deadline while it works;
 * the API's sweep revokes any token still listed past its deadline, so a job
 * that never ran or a worker that died can't leave a live token behind.
 */
export const PR_TOKEN_DEADLINES = "rwaft:github:pr-token-deadlines"

export type DeploymentStatus = "queued" | "building" | "ready" | "failed"

// ── Postgres key-value rows (lib/db.ts kv) ─────────────────────────────────
/** A job's status for a day: queued, building, ready or failed. */
export const statusKey = (jobId: string) => `status:${jobId}`
/** One "Push to GitHub" request, from the button press to the OAuth callback. */
export const githubPushKey = (pushId: string) => `github-push:${pushId}`
/** One "Open a pull request" request, from the button press until its job is queued. */
export const githubPrKey = (requestId: string) => `github-pr:${requestId}`
/** The user's GitHub token for one PR job, encrypted; the worker deletes and revokes it when the job ends. */
export const prTokenKey = (jobId: string) => `pr-token:${jobId}`
/** What a PR job opened, written by the worker (JSON). */
export const prResultKey = (jobId: string) => `pr-result:${jobId}`

/** The newest deployments kept per account. */
export const MAX_DEPLOYMENTS_PER_ACCOUNT = 500

/** The tokens a job paid for, carried on the job so the worker can refund a failed build. */
export interface JobCharge {
	userId: string
	tokens: number
}
