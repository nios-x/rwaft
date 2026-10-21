import { createHmac, timingSafeEqual } from "node:crypto"
import { getRedisClient } from "./redis.ts"
import { fulfilledKey, userKey } from "./constants.ts"
import type { Account } from "./accounts.ts"

/**
 * Token purchases through Stripe Checkout.
 *
 * Stripe hosts the payment page, so card details never touch this service. The
 * flow is: the browser asks for a Checkout Session, is redirected to Stripe,
 * and Stripe later calls the webhook. Tokens are credited from that signed
 * webhook only, never from the browser coming back to the success URL, which
 * anyone can visit.
 *
 * Talking to the REST API directly keeps the Stripe SDK out of the API image;
 * these are the only two calls made.
 */

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY?.trim() || ""
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET?.trim() || ""
const STRIPE_CURRENCY = (process.env.STRIPE_CURRENCY || "usd").toLowerCase()
/** Stripe's own default replay window for webhook signatures. */
const SIGNATURE_TOLERANCE_SECONDS = 300

export const isCheckoutConfigured = Boolean(STRIPE_SECRET_KEY && STRIPE_WEBHOOK_SECRET)

export interface TokenPack {
	id: string
	tokens: number
	/** Price in the currency's minor unit (cents for USD). */
	amount: number
}

const DEFAULT_PACKS: TokenPack[] = [
	{ id: "starter", tokens: 50, amount: 500 },
	{ id: "builder", tokens: 150, amount: 1_200 },
	{ id: "studio", tokens: 400, amount: 2_800 }
]

/** TOKEN_PACKS overrides the defaults, e.g. `starter:50:500,builder:150:1200`. */
const parsePacks = (raw: string | undefined): TokenPack[] => {
	if (!raw?.trim()) return DEFAULT_PACKS
	const packs = raw.split(",").map((entry) => {
		const [id, tokens, amount] = entry.trim().split(":")
		return { id: id || "", tokens: Number(tokens), amount: Number(amount) }
	})
	const valid = packs.filter((pack) => /^[a-z0-9-]+$/.test(pack.id) && pack.tokens > 0 && pack.amount > 0)
	if (valid.length !== packs.length) console.warn("[billing] Ignoring malformed TOKEN_PACKS entries")
	return valid.length > 0 ? valid : DEFAULT_PACKS
}

export const TOKEN_PACKS = parsePacks(process.env.TOKEN_PACKS)
export const CURRENCY = STRIPE_CURRENCY

type StripeResponse = { ok: boolean; status: number; json(): Promise<unknown> }

/** Creates a Checkout Session for `pack` and returns the Stripe-hosted URL to send the browser to. */
export async function createCheckoutSession(
	account: Account,
	pack: TokenPack,
	returnOrigin: string
): Promise<string> {
	const form = new URLSearchParams({
		mode: "payment",
		success_url: `${returnOrigin}/?checkout=success`,
		cancel_url: `${returnOrigin}/?checkout=cancelled`,
		client_reference_id: account.id,
		"line_items[0][quantity]": "1",
		"line_items[0][price_data][currency]": STRIPE_CURRENCY,
		"line_items[0][price_data][unit_amount]": String(pack.amount),
		"line_items[0][price_data][product_data][name]": `rwaft · ${pack.tokens} credits`,
		// The webhook reads these back. They are set here, server-side, and the
		// webhook is signed, so they can be trusted when it fires.
		"metadata[userId]": account.id,
		"metadata[packId]": pack.id,
		"metadata[tokens]": String(pack.tokens)
	})
	if (account.email) form.set("customer_email", account.email)

	const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
			"Content-Type": "application/x-www-form-urlencoded"
		},
		body: form.toString()
	}) as unknown as StripeResponse
	const body = await response.json() as { url?: string; error?: { message?: string } }
	if (!response.ok || !body.url) {
		throw new Error(`Stripe returned ${response.status}: ${body.error?.message ?? "no checkout URL"}`)
	}
	return body.url
}

/**
 * Checks the `Stripe-Signature` header against the raw request body.
 * https://docs.stripe.com/webhooks#verify-manually
 */
export function verifyStripeSignature(rawBody: Buffer, header: string | undefined): boolean {
	if (!header || !STRIPE_WEBHOOK_SECRET) return false
	const fields = header.split(",").map((part) => part.split("=") as [string, string])
	const timestamp = Number(fields.find(([key]) => key === "t")?.[1])
	const signatures = fields.filter(([key]) => key === "v1").map(([, value]) => value)
	if (!timestamp || signatures.length === 0) return false
	if (Math.abs(Date.now() / 1_000 - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false

	const expected = createHmac("sha256", STRIPE_WEBHOOK_SECRET)
		.update(`${timestamp}.`)
		.update(rawBody)
		.digest()
	return signatures.some((signature) => {
		const candidate = Buffer.from(signature, "hex")
		return candidate.length === expected.length && timingSafeEqual(candidate, expected)
	})
}

/** Credits a session's tokens exactly once, however many times Stripe delivers the event. */
const FULFIL_SCRIPT = `
if redis.call('SET', KEYS[1], ARGV[2], 'NX') then
	return redis.call('HINCRBY', KEYS[2], 'tokens', ARGV[1])
end
return -1
`

export interface CheckoutSession {
	id: string
	payment_status?: string
	metadata?: { userId?: string; tokens?: string; packId?: string }
}

export type FulfilResult = "credited" | "duplicate" | "unpaid" | "invalid"

export async function fulfilCheckout(session: CheckoutSession): Promise<FulfilResult> {
	// `checkout.session.completed` also fires for delayed payment methods that
	// have not settled yet; those arrive again as `async_payment_succeeded`.
	if (session.payment_status !== "paid") return "unpaid"
	const userId = session.metadata?.userId
	const tokens = Number(session.metadata?.tokens)
	if (!userId || !Number.isInteger(tokens) || tokens <= 0) return "invalid"

	const redis = await getRedisClient()
	const reply = Number(await redis.sendCommand([
		"EVAL", FULFIL_SCRIPT, "2", fulfilledKey(session.id), userKey(userId),
		String(tokens), JSON.stringify({ userId, tokens, packId: session.metadata?.packId, at: new Date().toISOString() })
	]))
	return reply < 0 ? "duplicate" : "credited"
}
