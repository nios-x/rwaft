/**
 * The weekly free top-up.
 *
 * Once a week an account whose balance has fallen below WEEKLY_CREDITS is
 * topped back up to it. It is a floor, not a grant: free credits never pile up
 * week after week, and a balance above the floor (bought credits, say) is
 * never touched. "A week" runs from the account's own last top-up, stored as
 * `refilled_at` (epoch ms); the sign-up grant counts as the first.
 *
 * There is no scheduled job. The top-up is applied lazily, in the same
 * statement or transaction that reads or spends the balance, and the UPDATE's
 * row lock means two requests arriving together cannot top up twice.
 */

/** The floor an account is topped up to each week. 0 turns the top-up off. */
export const WEEKLY_CREDITS = Math.max(0, Math.floor(Number(process.env.WEEKLY_CREDITS ?? 5)) || 0)
export const REFILL_PERIOD_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Tops up account $1 if it is due. Parameters: $1 id, $2 now (epoch ms),
 * $3 floor, $4 period (ms). Accounts never topped up (refilled_at null, from
 * before the top-up existed) are due at once. Returns the updated row.
 */
export const refillSql = (accounts: string) => `update ${accounts}
	set tokens = $3::int, refilled_at = $2::bigint
	where id = $1 and $3::int > 0 and tokens < $3::int
		and (refilled_at is null or refilled_at <= $2::bigint - $4::bigint)
	returning *`

/** The parameters refillSql takes after the id. */
export const refillParams = (now: number, floor = WEEKLY_CREDITS, period = REFILL_PERIOD_MS) => [now, floor, period]

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
