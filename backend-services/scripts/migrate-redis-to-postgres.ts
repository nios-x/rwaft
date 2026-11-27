/**
 * One-time copy of what rwaft used to keep in Redis into Postgres: accounts
 * (balance, weekly refill clock, sign-up date) and each account's dashboard
 * deployments. Everything else in Redis was short-lived and is left to expire.
 *
 *   bun scripts/migrate-redis-to-postgres.ts            dry run: counts only
 *   bun scripts/migrate-redis-to-postgres.ts --write    copy
 *
 * Reads REDIS_URL and DATABASE_URL (and DB_SCHEMA) from the environment or
 * backend-services/.env. Safe to run twice: an account that already exists in
 * Postgres (because its owner signed in again) keeps the larger of the two
 * balances, and deployments already copied are left as they are.
 */
import { createClient } from "redis"
import { T, closeDb, q } from "../lib/db.ts"

const write = process.argv.includes("--write")
const redis = createClient({ url: process.env.REDIS_URL })
redis.on("error", () => { })
await redis.connect()

const userIds: string[] = []
for await (const batch of redis.scanIterator({ MATCH: "rwaft:user:g-*", COUNT: 500 })) {
	for (const key of [].concat(batch as never)) {
		const id = String(key).slice("rwaft:user:".length)
		if (!id.includes(":")) userIds.push(id)
	}
}

let accounts = 0
let deployments = 0
for (const id of userIds) {
	const user = await redis.hGetAll(`rwaft:user:${id}`)
	if (!user.tokens && user.tokens !== "0") continue
	accounts++
	const refilledAt = Number(user.refilledAt) || null
	const createdAt = user.createdAt && !Number.isNaN(Date.parse(user.createdAt)) ? user.createdAt : new Date().toISOString()
	if (write) {
		await q(`insert into ${T.accounts} (id, email, name, picture, tokens, refilled_at, created_at)
			values ($1, $2, $3, $4, $5::int, $6::bigint, $7::timestamptz)
			on conflict (id) do update set tokens = greatest(${T.accounts}.tokens, excluded.tokens),
				refilled_at = coalesce(${T.accounts}.refilled_at, excluded.refilled_at),
				created_at = least(${T.accounts}.created_at, excluded.created_at)`,
		[id, user.email || "", user.name || "", user.picture || "", Number(user.tokens) || 0, refilledAt, createdAt])
	}

	const jobIds = await redis.zRange(`rwaft:account:${id}:deployments`, 0, -1)
	for (const jobId of jobIds) {
		const fields = await redis.hGetAll(`rwaft:deployment:${jobId}`)
		if (fields.owner !== id || !fields.kind) continue
		deployments++
		if (!write) continue
		const { owner, root, createdAt: created, ...data } = fields
		await q(`insert into ${T.deployments} (id, owner, root, created_at, data) values ($1, $2, $3, $4::bigint, $5::jsonb)
			on conflict (id) do nothing`, [jobId, owner, root || jobId, Number(created) || Date.now(), data])
	}
}

console.log(`${write ? "Copied" : "Would copy"} ${accounts} accounts and ${deployments} deployments${write ? "" : " (dry run; add --write to copy)"}`)
await redis.quit()
await closeDb()
