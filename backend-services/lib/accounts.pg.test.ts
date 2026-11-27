import { afterAll, beforeAll, describe, expect, test } from "bun:test"

/**
 * Accounts, credits, sessions, key-value records, deployments and logs, run
 * against a real Postgres.
 *
 * Opt in with TEST_DATABASE_URL. Each run creates its own schema
 * (rwaft_test_<random>), points this process at it, and drops it afterwards,
 * so it never reads or writes the app's own `rwaft` schema. Bun loads .env
 * into the test process, so DATABASE_URL there may be production: these tests
 * replace it with TEST_DATABASE_URL before anything connects.
 */

const testUrl = process.env.TEST_DATABASE_URL || ""
const SCHEMA = `rwaft_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`
const DAY = 24 * 60 * 60 * 1000
const WEEK = 7 * DAY

type Db = typeof import("./db.ts")
type Accounts = typeof import("./accounts.ts")
type Deployments = typeof import("./deployments.ts")
type Logs = typeof import("./logstream.ts")

describe.skipIf(!testUrl)("Postgres storage", () => {
	let db: Db
	let accounts: Accounts
	let deployments: Deployments
	let logs: Logs

	beforeAll(async () => {
		process.env.DATABASE_URL = testUrl
		process.env.DB_SCHEMA = SCHEMA
		db = await import("./db.ts")
		await db.closeDb()
		accounts = await import("./accounts.ts")
		deployments = await import("./deployments.ts")
		logs = await import("./logstream.ts")
		// Belt and braces: never touch anything but this run's schema.
		expect(db.T.accounts).toBe(`${SCHEMA}.accounts`)
		await db.getDb()
	})

	afterAll(async () => {
		if (db) {
			await db.q(`drop schema if exists ${SCHEMA} cascade`).catch(() => { })
			await db.closeDb()
		}
	})

	const profile = (sub: string) => ({ sub, email: `${sub}@example.com`, name: `User ${sub}`, picture: "" })
	const setAccount = (id: string, tokens: number, refilledAt: number | null) =>
		db.q(`update ${db.T.accounts} set tokens = $2::int, refilled_at = $3::bigint where id = $1`, [id, tokens, refilledAt])

	describe("accounts and the weekly top-up", () => {
		test("sign-up grants once and starts the refill clock, so the first top-up waits a week", async () => {
			const first = await accounts.upsertGoogleAccount(profile("signup"))
			expect(first.created).toBe(true)
			expect(first.account.tokens).toBe(accounts.SIGNUP_TOKENS)
			expect(first.account.refilledAt).not.toBeNull()
			const again = await accounts.upsertGoogleAccount({ ...profile("signup"), name: "Renamed" })
			expect(again.created).toBe(false)
			expect(again.account.name).toBe("Renamed")
			expect(again.account.tokens).toBe(accounts.SIGNUP_TOKENS)
		})

		test("an account never topped up (from before the top-up) is topped up on its next read", async () => {
			const { account } = await accounts.upsertGoogleAccount(profile("legacy"))
			await setAccount(account.id, 0, null)
			const read = await accounts.getAccount(account.id)
			expect(read?.tokens).toBe(accounts.WEEKLY_CREDITS)
			expect(read?.refilledAt).not.toBeNull()
		})

		test("tops up at most once a week", async () => {
			const { account } = await accounts.upsertGoogleAccount(profile("weekly"))
			await setAccount(account.id, 0, Date.now() - WEEK - 1000)
			expect((await accounts.getAccount(account.id))?.tokens).toBe(accounts.WEEKLY_CREDITS)
			const spent = await accounts.spendTokens(account.id, accounts.WEEKLY_CREDITS)
			expect(spent).toEqual({ ok: true, balance: 0 })
			// Just topped up: reading again does not top up again.
			expect((await accounts.getAccount(account.id))?.tokens).toBe(0)
			expect((await accounts.getAccount(account.id))?.nextRefillAt).toBeGreaterThan(Date.now() + WEEK - 60_000)
		})

		test("is a floor, not a grant: a balance at or above it is untouched, and the clock stays", async () => {
			const { account } = await accounts.upsertGoogleAccount(profile("paid"))
			const longAgo = Date.now() - 3 * WEEK
			await setAccount(account.id, 40, longAgo)
			const read = await accounts.getAccount(account.id)
			expect(read?.tokens).toBe(40)
			expect(read?.refilledAt).toBe(longAgo)
		})

		test("raises a balance below the floor to exactly the floor", async () => {
			const { account } = await accounts.upsertGoogleAccount(profile("partial"))
			await setAccount(account.id, 1, Date.now() - WEEK - 1000)
			expect((await accounts.getAccount(account.id))?.tokens).toBe(accounts.WEEKLY_CREDITS)
		})

		test("a due top-up applies before a charge, so a build can start on an empty balance", async () => {
			const { account } = await accounts.upsertGoogleAccount(profile("spend"))
			await setAccount(account.id, 0, Date.now() - 2 * WEEK)
			expect(await accounts.spendTokens(account.id, 1)).toEqual({ ok: true, balance: accounts.WEEKLY_CREDITS - 1 })
		})

		test("refuses a charge it cannot cover and leaves the balance alone", async () => {
			const { account } = await accounts.upsertGoogleAccount(profile("short"))
			await setAccount(account.id, 1, Date.now() - DAY)
			expect(await accounts.spendTokens(account.id, 3)).toEqual({ ok: false, balance: 1 })
			expect((await accounts.getAccount(account.id))?.tokens).toBe(1)
		})

		test("many reads at once top up only once", async () => {
			const { account } = await accounts.upsertGoogleAccount(profile("race"))
			await setAccount(account.id, 0, null)
			await Promise.all(Array.from({ length: 6 }, () => accounts.getAccount(account.id)))
			expect((await accounts.getAccount(account.id))?.tokens).toBe(accounts.WEEKLY_CREDITS)
			expect((await accounts.spendTokens(account.id, accounts.WEEKLY_CREDITS)).ok).toBe(true)
			expect((await accounts.getAccount(account.id))?.tokens).toBe(0)
		})

		test("an unknown account reads as null and cannot be charged", async () => {
			expect(await accounts.getAccount("g-nobody")).toBeNull()
			expect(await accounts.spendTokens("g-nobody", 1)).toEqual({ ok: false, balance: 0 })
		})
	})

	describe("credits that must land once", () => {
		test("a refund is credited once however often it is retried", async () => {
			const { account } = await accounts.upsertGoogleAccount(profile("refund"))
			await setAccount(account.id, 0, Date.now())
			const charge = { userId: account.id, tokens: 2 }
			await accounts.refundCharge("job-1", charge)
			await accounts.refundCharge("job-1", charge)
			await Promise.all([accounts.refundCharge("job-1", charge), accounts.refundCharge("job-1", charge)])
			expect((await accounts.getAccount(account.id))?.tokens).toBe(2)
		})

		test("creditOnce reports whether this call credited", async () => {
			const { account } = await accounts.upsertGoogleAccount(profile("payment"))
			expect(await accounts.creditOnce("payment:p-1", account.id, 50, { pack: "starter" })).toBe(true)
			expect(await accounts.creditOnce("payment:p-1", account.id, 50, { pack: "starter" })).toBe(false)
		})

		test("addTokens adds to an account and reports null for a missing one", async () => {
			const { account } = await accounts.upsertGoogleAccount(profile("topup"))
			const before = (await accounts.getAccount(account.id))!.tokens
			expect(await accounts.addTokens(account.id, 5)).toBe(before + 5)
			expect(await accounts.addTokens("g-nobody", 5)).toBeNull()
		})
	})

	describe("sessions", () => {
		test("a session resolves to its account until it is destroyed", async () => {
			const { account } = await accounts.upsertGoogleAccount(profile("session"))
			const token = await accounts.createSession(account.id)
			expect(await accounts.accountForSession(token)).toBe(account.id)
			expect(await accounts.accountForSession(`${token}x`)).toBeNull()
			await accounts.destroySession(token)
			expect(await accounts.accountForSession(token)).toBeNull()
		})

		test("an expired session does not resolve", async () => {
			const { account } = await accounts.upsertGoogleAccount(profile("expired"))
			const token = await accounts.createSession(account.id)
			await db.q(`update ${db.T.sessions} set expires_at = now() - interval '1 second' where account_id = $1`, [account.id])
			expect(await accounts.accountForSession(token)).toBeNull()
		})
	})

	describe("key-value records", () => {
		test("set, get, overwrite and delete", async () => {
			await db.kv.set("t:a", "1", 60)
			await db.kv.set("t:a", "2", 60)
			expect(await db.kv.get("t:a")).toBe("2")
			expect(await db.kv.getMany(["t:a", "t:missing"])).toEqual(["2", null])
			await db.kv.del("t:a")
			expect(await db.kv.get("t:a")).toBeNull()
		})

		test("a claim succeeds once, and again only after it expires", async () => {
			expect(await db.kv.setIfAbsent("t:claim", "1", 60)).toBe(true)
			expect(await db.kv.setIfAbsent("t:claim", "1", 60)).toBe(false)
			await db.q(`update ${db.T.kv} set expires_at = now() - interval '1 second' where key = 't:claim'`)
			expect(await db.kv.get("t:claim")).toBeNull()
			expect(await db.kv.setIfAbsent("t:claim", "1", 60)).toBe(true)
		})

		test("concurrent claims: exactly one wins", async () => {
			const results = await Promise.all(Array.from({ length: 5 }, () => db.kv.setIfAbsent("t:race", "1", 60)))
			expect(results.filter(Boolean)).toHaveLength(1)
		})
	})

	describe("deployments", () => {
		test("record, update, list newest first, and remove a whole project", async () => {
			const owner = (await accounts.upsertGoogleAccount(profile("dash"))).account.id
			await deployments.recordDeployment(owner, { id: "d1", kind: "prompt", url: "https://d1", source: "a site", charged: 1 })
			await Bun.sleep(5)
			await deployments.recordDeployment(owner, { id: "d2", kind: "prompt", url: "https://d2", source: "change it", charged: 1, parent: "d1" })
			await deployments.updateDeployment("d1", { status: "ready", finishedAt: String(Date.now()) })
			await deployments.updateDeployment("gone", { status: "ready" })

			const list = await deployments.listDeployments(owner)
			expect(list.map((d) => d.id)).toEqual(["d2", "d1"])
			expect(list[1]).toMatchObject({ status: "ready", root: "d1", kind: "prompt", charged: 1 })
			expect(list[0]).toMatchObject({ parent: "d1", root: "d1" })

			expect(await deployments.removeDeployments("g-someone-else", "d1", true)).toBe(0)
			expect(await deployments.removeDeployments(owner, "d2", true)).toBe(2)
			expect(await deployments.listDeployments(owner)).toEqual([])
		})

		test("anonymous builds aren't recorded", async () => {
			await deployments.recordDeployment("u-anon", { id: "anon1", kind: "prompt", url: "", source: "", charged: 0 })
			expect(await db.q(`select id from ${db.T.deployments} where id = 'anon1'`)).toHaveLength(0)
		})
	})

	describe("build logs", () => {
		const append = (userId: string, payloads: string[]) =>
			db.q(`insert into ${db.T.logEvents} (user_id, payload) select $1, value from jsonb_array_elements_text($2::jsonb)`, [userId, payloads])

		test("history returns the newest events in order, and clearing empties it", async () => {
			await append("u-logs", ["a", "b", "c", "d"])
			expect(await logs.readLogHistory("u-logs", 3)).toEqual(["b", "c", "d"])
			await logs.clearLogHistory("u-logs")
			expect(await logs.readLogHistory("u-logs", 10)).toEqual([])
		})

		test("a follower gets only events written after it subscribed", async () => {
			await append("u-live", ["old"])
			const seen: string[] = []
			const unsubscribe = await logs.subscribeToUserLogs("u-live", (payload) => seen.push(payload))
			await append("u-live", ["new 1", "new 2"])
			await Bun.sleep(2_500)
			await unsubscribe()
			await unsubscribe()
			expect(seen).toEqual(["new 1", "new 2"])
		})
	})
})
