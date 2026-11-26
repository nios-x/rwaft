import { describe, expect, test } from "bun:test"
import { REFILL_PERIOD_MS, WEEKLY_CREDITS, nextRefillAt, refillArgs } from "./refill.ts"
import { accountFromFields, hashFromReply } from "./accounts.ts"

/**
 * Pure parts of the weekly top-up: no Redis. The scripts themselves are run
 * against a real Redis in refill.redis.test.ts.
 */

const NOW = Date.UTC(2026, 10, 25, 12, 0, 0)
const DAY = 24 * 60 * 60 * 1000

describe("nextRefillAt", () => {
	test("waits a full week from the last top-up while below the floor", () => {
		expect(nextRefillAt(1, NOW - 2 * DAY, NOW, 5, REFILL_PERIOD_MS)).toBe(NOW + 5 * DAY)
	})

	test("is due now when the week has passed", () => {
		expect(nextRefillAt(0, NOW - 8 * DAY, NOW, 5, REFILL_PERIOD_MS)).toBe(NOW)
	})

	test("is due now for an account that has never been topped up", () => {
		expect(nextRefillAt(0, null, NOW, 5, REFILL_PERIOD_MS)).toBe(NOW)
	})

	test("has nothing to wait for at or above the floor", () => {
		expect(nextRefillAt(5, NOW - DAY, NOW, 5, REFILL_PERIOD_MS)).toBeNull()
		expect(nextRefillAt(40, null, NOW, 5, REFILL_PERIOD_MS)).toBeNull()
	})

	test("is off when the floor is 0", () => {
		expect(nextRefillAt(0, null, NOW, 0, REFILL_PERIOD_MS)).toBeNull()
	})
})

describe("refillArgs", () => {
	test("passes now, floor and period as strings, in script order", () => {
		expect(refillArgs(NOW, 5, REFILL_PERIOD_MS)).toEqual([String(NOW), "5", String(REFILL_PERIOD_MS)])
	})

	test("defaults to the configured weekly floor and a 7-day period", () => {
		expect(refillArgs(NOW)).toEqual([String(NOW), String(WEEKLY_CREDITS), String(7 * DAY)])
	})
})

describe("hashFromReply", () => {
	test("turns HGETALL's flat reply into an object", () => {
		expect(hashFromReply(["tokens", "5", "email", "a@b.c"])).toEqual({ tokens: "5", email: "a@b.c" })
	})

	test("is empty for a missing hash or an unexpected reply", () => {
		expect(hashFromReply([])).toEqual({})
		expect(hashFromReply(null)).toEqual({})
		expect(hashFromReply("OK")).toEqual({})
	})
})

describe("accountFromFields", () => {
	test("reads the balance and the refill time", () => {
		const account = accountFromFields("g-1", { tokens: "3", refilledAt: String(NOW - DAY), email: "a@b.c" }, NOW)
		expect(account.tokens).toBe(3)
		expect(account.refilledAt).toBe(NOW - DAY)
		expect(account.email).toBe("a@b.c")
		expect(account.nextRefillAt).toBe(WEEKLY_CREDITS > 3 ? NOW + 6 * DAY : null)
	})

	test("treats a missing or malformed refill time as never refilled", () => {
		expect(accountFromFields("g-1", { tokens: "0" }, NOW).refilledAt).toBeNull()
		expect(accountFromFields("g-1", { tokens: "0", refilledAt: "soon" }, NOW).refilledAt).toBeNull()
	})
})
