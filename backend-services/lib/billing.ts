import { createHmac, timingSafeEqual } from "node:crypto"
import { getRedisClient } from "./redis.ts"
import { fulfilledKey, userKey } from "./constants.ts"
import type { Account } from "./accounts.ts"

/**
 * Token purchases through Dodo Payments Checkout.
 *
 * Dodo hosts the payment page and is the merchant of record, so card details
 * and sales tax never touch this service. The flow is: the browser asks for a
 * Checkout Session, is redirected to Dodo, and Dodo later calls the webhook.
 * Tokens are credited from that signed webhook only, never from the browser
 * coming back to the return URL, which anyone can visit.
 *
 * Dodo prices live on its products, so every pack maps to a one-time product
 * created in the Dodo dashboard (DODO_PRODUCTS). Talking to the REST API
 * directly keeps the Dodo SDK out of the API image; one call is made.
 */

const DODO_API_KEY = process.env.DODO_PAYMENTS_API_KEY?.trim() || ""
const DODO_WEBHOOK_KEY = process.env.DODO_PAYMENTS_WEBHOOK_KEY?.trim() || ""
/** Test mode unless explicitly live, so a missing variable can never charge real cards. */
const DODO_BASE_URL = process.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode"
	? "https://live.dodopayments.com"
	: "https://test.dodopayments.com"
/** Display only: the charged price is the Dodo product's own. */
const BILLING_CURRENCY = (process.env.BILLING_CURRENCY || "usd").toLowerCase()
/** The Standard Webhooks replay window Dodo's own libraries use. */
const SIGNATURE_TOLERANCE_SECONDS = 300

export interface TokenPack {
	id: string
	tokens: number
	/** Price in the currency's minor unit (cents for USD). Keep it equal to the Dodo product's price. */
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

/** DODO_PRODUCTS maps pack ids to Dodo product ids, e.g. `starter:pdt_abc,builder:pdt_def`. */
const parseProducts = (raw: string | undefined): Map<string, string> => {
	const products = new Map<string, string>()
	for (const entry of (raw || "").split(",")) {
		const [packId, productId] = entry.trim().split(":").map((part) => part?.trim() || "")
		if (packId && productId) products.set(packId, productId)
	}
	return products
}

const ALL_PACKS = parsePacks(process.env.TOKEN_PACKS)
const PRODUCT_IDS = parseProducts(process.env.DODO_PRODUCTS)

export const isCheckoutConfigured = Boolean(
	DODO_API_KEY && DODO_WEBHOOK_KEY && ALL_PACKS.some((pack) => PRODUCT_IDS.has(pack.id))
)

if (DODO_API_KEY && !isCheckoutConfigured) {
	console.warn("[billing] DODO_PAYMENTS_API_KEY is set but DODO_PAYMENTS_WEBHOOK_KEY or DODO_PRODUCTS is missing; credit purchases stay off")
}
const unsold = ALL_PACKS.filter((pack) => !PRODUCT_IDS.has(pack.id))
if (isCheckoutConfigured && unsold.length > 0) {
	console.warn(`[billing] No Dodo product for pack(s) ${unsold.map((pack) => pack.id).join(", ")}; they are hidden`)
}

/**
 * Once checkout works, only packs that can really be bought are offered.
 * Before that every pack is listed (as not yet on sale) so recharging is visible.
 */
export const TOKEN_PACKS = isCheckoutConfigured ? ALL_PACKS.filter((pack) => PRODUCT_IDS.has(pack.id)) : ALL_PACKS
export const CURRENCY = BILLING_CURRENCY

type DodoResponse = { ok: boolean; status: number; json(): Promise<unknown> }

/** Creates a Checkout Session for `pack` and returns the Dodo-hosted URL to send the browser to. */
export async function createCheckoutSession(
	account: Account,
	pack: TokenPack,
	returnOrigin: string
): Promise<string> {
	const productId = PRODUCT_IDS.get(pack.id)
	if (!productId) throw new Error(`No Dodo product configured for pack ${pack.id}`)

	const response = await fetch(`${DODO_BASE_URL}/checkouts`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${DODO_API_KEY}`,
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			product_cart: [{ product_id: productId, quantity: 1 }],
			customer: account.email ? { email: account.email, name: account.name || account.email } : undefined,
			// Dodo appends payment_id and status to this.
			return_url: `${returnOrigin}/?checkout=success`,
			cancel_url: `${returnOrigin}/?checkout=cancelled`,
			// Copied onto the payment, so the webhook knows whose balance to
			// credit. The credits themselves come from the product, not from here.
			metadata: { userId: account.id, packId: pack.id }
		})
	}) as unknown as DodoResponse
	const body = await response.json().catch(() => ({})) as { checkout_url?: string | null; message?: string }
	if (!response.ok || !body.checkout_url) {
		throw new Error(`Dodo returned ${response.status}: ${body.message ?? "no checkout URL"}`)
	}
	return body.checkout_url
}

/**
 * Checks a Standard Webhooks signature against the raw request body: an
 * HMAC-SHA256 of `id.timestamp.body`, keyed with the base64 part of the
 * `whsec_` secret. https://docs.dodopayments.com/developer-resources/webhooks
 */
export function verifyDodoSignature(
	rawBody: Buffer,
	headers: { id?: string; timestamp?: string; signature?: string }
): boolean {
	const { id, timestamp, signature } = headers
	if (!id || !timestamp || !signature || !DODO_WEBHOOK_KEY) return false
	const seconds = Number(timestamp)
	if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1_000 - seconds) > SIGNATURE_TOLERANCE_SECONDS) return false

	const key = Buffer.from(DODO_WEBHOOK_KEY.replace(/^whsec_/, ""), "base64")
	const expected = createHmac("sha256", key)
		.update(`${id}.${timestamp}.`)
		.update(rawBody)
		.digest()
	// Space separated, each `v1,<base64>`; any one matching is enough.
	return signature.split(" ").some((entry) => {
		const [version, value] = entry.split(",", 2)
		if (version !== "v1" || !value) return false
		const candidate = Buffer.from(value, "base64")
		return candidate.length === expected.length && timingSafeEqual(candidate, expected)
	})
}

/** Credits a payment's tokens exactly once, however many times Dodo delivers the event. */
const FULFIL_SCRIPT = `
if redis.call('SET', KEYS[1], ARGV[2], 'NX') then
	return redis.call('HINCRBY', KEYS[2], 'tokens', ARGV[1])
end
return -1
`

/** The fields of a Dodo Payment this service reads. */
export interface DodoPayment {
	payment_id: string
	status?: string | null
	product_cart?: { product_id: string; quantity: number }[] | null
	metadata?: Record<string, unknown> | null
}

export type FulfilResult = "credited" | "duplicate" | "unpaid" | "invalid"

/** Tokens bought, from this service's own product map rather than anything the payment claims. */
const tokensFor = (cart: DodoPayment["product_cart"]): number => {
	let tokens = 0
	for (const item of cart ?? []) {
		const packId = [...PRODUCT_IDS].find(([, productId]) => productId === item.product_id)?.[0]
		const pack = ALL_PACKS.find((candidate) => candidate.id === packId)
		if (pack && Number.isInteger(item.quantity) && item.quantity > 0) tokens += pack.tokens * item.quantity
	}
	return tokens
}

export async function fulfilPayment(payment: DodoPayment): Promise<FulfilResult> {
	if (payment.status !== "succeeded") return "unpaid"
	const userId = typeof payment.metadata?.userId === "string" ? payment.metadata.userId : ""
	const tokens = tokensFor(payment.product_cart)
	if (!userId || tokens <= 0) return "invalid"

	const redis = await getRedisClient()
	const reply = Number(await redis.sendCommand([
		"EVAL", FULFIL_SCRIPT, "2", fulfilledKey(payment.payment_id), userKey(userId),
		String(tokens), JSON.stringify({ userId, tokens, packId: payment.metadata?.packId, at: new Date().toISOString() })
	]))
	return reply < 0 ? "duplicate" : "credited"
}
