import { describe, expect, test } from "bun:test"
import { REFILL_PERIOD_MS, WEEKLY_CREDITS, nextRefillAt, refillParams } from "./refill.ts"
import { accountFromRow } from "./accounts.ts"

/**
 * Pure parts of the weekly top-up: no database. The SQL itself runs against a
 * real Postgres in accounts.pg.test.ts.
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

describe("refillParams", () => {
	test("passes now, floor and period, in the order refillSql numbers them", () => {
		expect(refillParams(NOW, 5, REFILL_PERIOD_MS)).toEqual([NOW, 5, REFILL_PERIOD_MS])
	})

	test("defaults to the configured weekly floor and a 7-day period", () => {
		expect(refillParams(NOW)).toEqual([NOW, WEEKLY_CREDITS, 7 * DAY])
	})
})

describe("accountFromRow", () => {
	test("reads the balance and the refill time, including a bigint that arrives as a string", () => {
		const account = accountFromRow({ id: "g-1", email: "a@b.c", name: "A", picture: "", tokens: 3, refilled_at: String(NOW - DAY) }, NOW)
		expect(account.tokens).toBe(3)
		expect(account.refilledAt).toBe(NOW - DAY)
		expect(account.email).toBe("a@b.c")
		expect(account.nextRefillAt).toBe(WEEKLY_CREDITS > 3 ? NOW + 6 * DAY : null)
	})

	test("treats a missing refill time as never refilled", () => {
		expect(accountFromRow({ id: "g-1", email: null, name: null, picture: null, tokens: 0, refilled_at: null }, NOW).refilledAt).toBeNull()
	})

	test("survives nulls in the text columns", () => {
		const account = accountFromRow({ id: "g-2", email: null, name: null, picture: null, tokens: null, refilled_at: null }, NOW)
		expect(account).toMatchObject({ email: "", name: "", picture: "", tokens: 0 })
	})
})
