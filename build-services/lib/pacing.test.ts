import { describe, expect, test } from "bun:test"
import { BUSY_LOOP_MS, nextBackoff, watchLoopDelay } from "./pacing.ts"

const NOW = 1_000_000
const IDLE = 5 * 60_000

describe("watchLoopDelay", () => {
	test("waits the idle maximum when no watch is pending", () => {
		expect(watchLoopDelay(null, NOW, false, IDLE)).toBe(IDLE)
	})

	test("waits until the next watch falls due", () => {
		expect(watchLoopDelay(NOW + 42_000, NOW, false, IDLE)).toBe(42_000)
	})

	test("never waits past the idle maximum, even for a distant watch", () => {
		expect(watchLoopDelay(NOW + 60 * 60_000, NOW, false, IDLE)).toBe(IDLE)
	})

	test("looks again soon for a watch due in a moment, but not in a tight loop", () => {
		expect(watchLoopDelay(NOW + 1, NOW, false, IDLE)).toBe(BUSY_LOOP_MS)
		expect(watchLoopDelay(NOW - 10, NOW, false, IDLE)).toBe(BUSY_LOOP_MS)
	})

	test("comes back quickly while due watches wait for a free slot", () => {
		expect(watchLoopDelay(null, NOW, true, IDLE)).toBe(BUSY_LOOP_MS)
		expect(watchLoopDelay(NOW + 60_000, NOW, true, IDLE)).toBe(BUSY_LOOP_MS)
	})
})

describe("nextBackoff", () => {
	test("starts at the minimum", () => {
		expect(nextBackoff(0, 2_000, 60_000)).toBe(2_000)
	})

	test("doubles each time", () => {
		expect(nextBackoff(2_000, 2_000, 60_000)).toBe(4_000)
		expect(nextBackoff(16_000, 2_000, 60_000)).toBe(32_000)
	})

	test("stops at the maximum", () => {
		expect(nextBackoff(32_000, 2_000, 60_000)).toBe(60_000)
		expect(nextBackoff(60_000, 2_000, 60_000)).toBe(60_000)
	})
})
