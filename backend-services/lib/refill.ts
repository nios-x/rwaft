/**
 * The weekly free top-up.
 *
 * Once a week an account whose balance has fallen below WEEKLY_CREDITS is
 * topped back up to it. It is a floor, not a grant: free credits never pile up
 * week after week, and a balance above the floor (bought credits, say) is
 * never touched. "A week" runs from the account's own last top-up, stored as
 * `refilledAt` (epoch ms) on its hash; the sign-up grant counts as the first.
 *
 * There is no scheduled job. The top-up is applied lazily, inside the same
 * Redis script that reads or spends the balance, so it costs no extra Redis
 * requests and two requests arriving together cannot top up twice. These
 * scripts are plain strings with no imports so the tests can run them as-is
 * (lib/refill.test.ts runs them in a Lua VM against an in-memory hash).
 */

/** The floor an account is topped up to each week. 0 turns the top-up off. */
export const WEEKLY_CREDITS = Math.max(0, Math.floor(Number(process.env.WEEKLY_CREDITS ?? 5)) || 0)
export const REFILL_PERIOD_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Applies the top-up to the account hash at `key` if it is due. Shared by the
 * scripts below. Accounts without `refilledAt` (created before the top-up
 * existed) are due at once.
 */
const REFILL_LUA = `
local function refill(key, now, floor, period)
	if floor <= 0 then return end
	if redis.call('HEXISTS', key, 'tokens') == 0 then return end
	local last = tonumber(redis.call('HGET', key, 'refilledAt') or '')
	if last and now - last < period then return end
	local tokens = tonumber(redis.call('HGET', key, 'tokens') or '0') or 0
	if tokens >= floor then return end
	redis.call('HSET', key, 'tokens', tostring(floor), 'refilledAt', tostring(now))
end
`

/** KEYS[1] user hash. ARGV now, floor, period. Tops up if due, then returns the hash (HGETALL). */
export const READ_ACCOUNT_SCRIPT = `${REFILL_LUA}
refill(KEYS[1], tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3]))
return redis.call('HGETALL', KEYS[1])
`

/**
 * KEYS[1] user hash. ARGV cost, now, floor, period. Tops up if due, then deducts
 * only if the whole amount is there. Returns the new balance, or -1.
 */
export const SPEND_SCRIPT = `${REFILL_LUA}
refill(KEYS[1], tonumber(ARGV[2]), tonumber(ARGV[3]), tonumber(ARGV[4]))
local balance = tonumber(redis.call('HGET', KEYS[1], 'tokens') or '0') or 0
local cost = tonumber(ARGV[1])
if balance < cost then return -1 end
return redis.call('HINCRBY', KEYS[1], 'tokens', -cost)
`

/**
 * KEYS[1] user hash. ARGV sign-up grant, now. Grants the sign-up credits once,
 * and starts the account's refill clock in the same step, so the first weekly
 * top-up comes a week after sign-up. Returns 1 if this call created the
 * account, else 0.
 */
export const SIGNUP_SCRIPT = `
if redis.call('HSETNX', KEYS[1], 'tokens', ARGV[1]) == 1 then
	redis.call('HSET', KEYS[1], 'refilledAt', ARGV[2])
	return 1
end
return 0
`

/** The script arguments that follow the per-call ones: now, floor, period. */
export const refillArgs = (now: number, floor = WEEKLY_CREDITS, period = REFILL_PERIOD_MS) =>
	[String(now), String(floor), String(period)]

/**
 * When the next top-up can happen, for the account screen: null when there is
 * nothing to wait for (the top-up is off, or the balance is at or above the
 * floor, so it will top up as soon as it is next needed and due).
 */
export function nextRefillAt(tokens: number, refilledAt: number | null, now: number, floor = WEEKLY_CREDITS, period = REFILL_PERIOD_MS): number | null {
	if (floor <= 0 || tokens >= floor) return null
	if (refilledAt === null) return now
	return Math.max(now, refilledAt + period)
}
