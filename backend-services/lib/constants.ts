/**
 * Redis key and queue names shared with build-services.
 * Keep in sync with build-services/lib/config.ts.
 */
export const DEPLOY_QUEUE = "rwaft:deploy"
export const PROMPT_QUEUE = "rwaft:prompt"
export const DEPLOY_PROCESSING = "rwaft:deploy:processing"
export const PROMPT_PROCESSING = "rwaft:prompt:processing"
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
/** Set once per Stripe Checkout Session, so a redelivered webhook cannot credit twice. */
export const fulfilledKey = (checkoutId: string) => `rwaft:billing:fulfilled:${checkoutId}`

/** The tokens a job paid for, carried on the job so the worker can refund a failed build. */
export interface JobCharge {
	userId: string
	tokens: number
}
