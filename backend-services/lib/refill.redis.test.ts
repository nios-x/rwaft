import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { createClient } from "redis"
import { READ_ACCOUNT_SCRIPT, REFILL_PERIOD_MS, SIGNUP_SCRIPT, SPEND_SCRIPT } from "./refill.ts"
import { hashFromReply } from "./accounts.ts"

/**
 * The weekly top-up scripts, run as-is against a real Redis.
 *
 * Opt in with a local Redis, e.g. the one in docker-compose.yml:
 *   docker compose up -d redis
 *   TEST_REDIS_URL=redis://127.0.0.1:6379 bun test
 *
 * Bun loads .env into the test process, and REDIS_URL there is production, so
 * these tests never read REDIS_URL and refuse any TEST_REDIS_URL that is not on
 * this machine. Every key they write is under a random rwaft:test:… prefix and
 * deleted afterwards.
 */

const url = process.env.TEST_REDIS_URL || ""
const isLocal = (() => {
	try {
		return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(new URL(url).hostname)
	} catch {
		return false
	}
})()
if (url && !isLocal) console.warn("[test] TEST_REDIS_URL is not local; skipping the Redis tests rather than touching a shared database.")

const FLOOR = 5
const WEEK = REFILL_PERIOD_MS
const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 10, 25, 12, 0, 0)

describe.skipIf(!isLocal)("weekly top-up scripts on Redis", () => {
	const client = createClient({ url })
	const prefix = `rwaft:test:${randomUUID()}`
	const keys = new Set<string>()
	const userKey = (name: string) => {
		const key = `${prefix}:user:${name}`
		keys.add(key)
		return key
	}

	const read = async (key: string, now: number, floor = FLOOR) =>
		hashFromReply(await client.sendCommand(["EVAL", READ_ACCOUNT_SCRIPT, "1", key, String(now), String(floor), String(WEEK)]))
	const spend = async (key: string, cost: number, now: number, floor = FLOOR) =>
		Number(await client.sendCommand(["EVAL", SPEND_SCRIPT, "1", key, String(cost), String(now), String(floor), String(WEEK)]))
	const signup = async (key: string, grant: number, now: number) =>
		Number(await client.sendCommand(["EVAL", SIGNUP_SCRIPT, "1", key, String(grant), String(now)]))

	beforeAll(async () => {
		client.on("error", () => { })
		await client.connect()
	})

	afterAll(async () => {
		if (keys.size) await client.del([...keys])
		await client.quit()
	})

	test("tops up an account that has never been refilled, and starts its clock", async () => {
		const key = userKey("legacy")
		await client.hSet(key, { tokens: "0", email: "a@b.c" })
		const fields = await read(key, NOW)
		expect(fields.tokens).toBe("5")
		expect(fields.refilledAt).toBe(String(NOW))
		expect(fields.email).toBe("a@b.c")
	})

	test("tops up at most once a week", async () => {
		const key = userKey("weekly")
		await client.hSet(key, { tokens: "0", refilledAt: String(NOW - WEEK) })
		expect((await read(key, NOW)).tokens).toBe("5")
		expect(await spend(key, 5, NOW + DAY)).toBe(0)
		// Six days and 23 hours after the top-up: still waiting.
		expect((await read(key, NOW + WEEK - 60 * 60 * 1000)).tokens).toBe("0")
		// A full week after it: topped up again, and the clock restarts there.
		const fields = await read(key, NOW + WEEK)
		expect(fields.tokens).toBe("5")
		expect(fields.refilledAt).toBe(String(NOW + WEEK))
	})

	test("is a floor, not a grant: it never adds to a balance at or above it", async () => {
		const key = userKey("paid")
		await client.hSet(key, { tokens: "40", refilledAt: String(NOW - 3 * WEEK) })
		const fields = await read(key, NOW)
		expect(fields.tokens).toBe("40")
		// Nothing was topped up, so the clock does not move.
		expect(fields.refilledAt).toBe(String(NOW - 3 * WEEK))
	})

	test("raises a balance below the floor to exactly the floor", async () => {
		const key = userKey("partial")
		await client.hSet(key, { tokens: "3", refilledAt: String(NOW - WEEK) })
		expect((await read(key, NOW)).tokens).toBe("5")
	})

	test("applies a due top-up before charging, so a build can start on an empty balance", async () => {
		const key = userKey("spend")
		await client.hSet(key, { tokens: "0", refilledAt: String(NOW - 2 * WEEK) })
		expect(await spend(key, 1, NOW)).toBe(4)
		expect(await client.hGet(key, "refilledAt")).toBe(String(NOW))
	})

	test("refuses a charge it cannot cover and leaves the balance alone", async () => {
		const key = userKey("short")
		await client.hSet(key, { tokens: "1", refilledAt: String(NOW - DAY) })
		expect(await spend(key, 2, NOW)).toBe(-1)
		expect(await client.hGet(key, "tokens")).toBe("1")
	})

	test("repeated reads in the same week top up only once", async () => {
		const key = userKey("race")
		await client.hSet(key, { tokens: "0" })
		await Promise.all([read(key, NOW), read(key, NOW), read(key, NOW)])
		expect(await spend(key, 5, NOW)).toBe(0)
		expect((await read(key, NOW + DAY)).tokens).toBe("0")
	})

	test("does nothing when the top-up is off (floor 0)", async () => {
		const key = userKey("off")
		await client.hSet(key, { tokens: "0" })
		const fields = await read(key, NOW, 0)
		expect(fields.tokens).toBe("0")
		expect(fields.refilledAt).toBeUndefined()
	})

	test("never creates an account that does not exist", async () => {
		const key = userKey("ghost")
		expect(await read(key, NOW)).toEqual({})
		expect(await spend(key, 1, NOW)).toBe(-1)
		expect(await client.exists(key)).toBe(0)
	})

	test("sign-up grants once and starts the clock, so the first top-up comes a week later", async () => {
		const key = userKey("new")
		expect(await signup(key, 2, NOW)).toBe(1)
		expect(await signup(key, 2, NOW + 1000)).toBe(0)
		expect(await client.hGet(key, "refilledAt")).toBe(String(NOW))
		expect((await read(key, NOW + DAY)).tokens).toBe("2")
		expect((await read(key, NOW + WEEK)).tokens).toBe("5")
	})

	test("sign-up never resets an existing balance", async () => {
		const key = userKey("returning")
		await client.hSet(key, { tokens: "17", refilledAt: String(NOW - DAY) })
		expect(await signup(key, 2, NOW)).toBe(0)
		expect(await client.hGet(key, "tokens")).toBe("17")
	})
})
