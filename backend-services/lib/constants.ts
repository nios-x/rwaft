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
