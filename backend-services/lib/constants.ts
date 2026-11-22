/**
 * Redis key and queue names shared with build-services.
 * Keep in sync with build-services/lib/config.ts.
 */
export const DEPLOY_QUEUE = "rwaft:deploy"
export const PROMPT_QUEUE = "rwaft:prompt"
/** "Open a pull request": an AI change to a GitHub repository, made through the API without cloning it. */
export const PR_QUEUE = "rwaft:pr"
export const DEPLOY_PROCESSING = "rwaft:deploy:processing"
export const PROMPT_PROCESSING = "rwaft:prompt:processing"
export const PR_PROCESSING = "rwaft:pr:processing"
export const DEPLOYMENT_STATUS_PREFIX = "rwaft:deployment-status:"

export const logChannel = (userId: string) => `rwaft:logs:${userId}`
export const logHistoryKey = (userId: string) => `rwaft:logs:${userId}:history`

export type DeploymentStatus = "queued" | "building" | "ready" | "failed"

/**
 * Build line, shared with the worker. Both are sorted sets: WAITING is scored
 * by enqueue time, so a job's rank is its place in line; ACTIVE is scored by
 * start time, so entries a crashed worker never removed can be pruned by age.
 */
export const BUILD_WAITING = "rwaft:builds:waiting"
export const BUILD_ACTIVE = "rwaft:builds:active"

// ── Accounts and billing ────────────────────────────────────────────────────
export const userKey = (userId: string) => `rwaft:user:${userId}`
export const sessionKey = (tokenHash: string) => `rwaft:session:${tokenHash}`
/** Set once per job when its tokens are refunded, so a retry cannot refund twice. */
export const refundKey = (jobId: string) => `rwaft:billing:refunded:${jobId}`
/** Set once per Dodo payment, so a redelivered webhook cannot credit twice. */
export const fulfilledKey = (paymentId: string) => `rwaft:billing:fulfilled:${paymentId}`

// ── GitHub export ───────────────────────────────────────────────────────────
/** A generated app's source, written by the worker when the build goes live. Expires on its own. */
export const sourceKey = (jobId: string) => `rwaft:source:${jobId}`
/** One "Push to GitHub" request, from the button press to the OAuth callback. */
export const githubPushKey = (pushId: string) => `rwaft:github:push:${pushId}`

// ── Pull requests ───────────────────────────────────────────────────────────
/** One "Open a pull request" request, from the button press until its job is queued. */
export const githubPrKey = (requestId: string) => `rwaft:github:pr:${requestId}`
/** The user's GitHub token for one PR job, encrypted; the worker deletes and revokes it when the job ends. */
export const prTokenKey = (jobId: string) => `rwaft:github:pr-token:${jobId}`
/** What a PR job opened, written by the worker. */
export const prResultKey = (jobId: string) => `rwaft:pr:result:${jobId}`
/**
 * Every sealed PR token, scored by the time it must be revoked. The job (or
 * its CI watch) revokes its own token and moves the deadline while it works;
 * the API's sweep revokes any token still here past its deadline, so a job
 * that never ran or a worker that died can't leave a live token behind.
 * Keep in sync with build-services/lib/config.ts.
 */
export const PR_TOKEN_DEADLINES = "rwaft:github:pr-token-deadlines"

// ── Dashboard ───────────────────────────────────────────────────────────────
/**
 * An account's deployments: a sorted set of job ids scored by when each was
 * accepted. Unlike the status, source and PR keys above it never expires; it
 * is capped at MAX_DEPLOYMENTS_PER_ACCOUNT instead.
 */
export const accountDeploymentsKey = (accountId: string) => `rwaft:account:${accountId}:deployments`
/**
 * One deployment's record. The API writes it when the job is accepted and the
 * worker fills in how it ended. Keep in sync with build-services/lib/config.ts.
 */
export const deploymentKey = (jobId: string) => `rwaft:deployment:${jobId}`
export const MAX_DEPLOYMENTS_PER_ACCOUNT = 500

/** The tokens a job paid for, carried on the job so the worker can refund a failed build. */
export interface JobCharge {
	userId: string
	tokens: number
}
