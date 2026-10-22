import { BACKEND_URL } from "./config"
import type { AuthConfig, TokenPack } from "./useAccount"

/**
 * Pricing as the API is actually configured, for the server-rendered home
 * sections and their structured data, plus whether pushing to GitHub is set
 * up, so the home page only offers it once it works. Server only: the
 * console itself reads the same values live through useAccount.
 */
export type Pricing = Pick<AuthConfig, "billing" | "signupTokens" | "costs" | "currency" | "packs" | "payments" | "github">

/**
 * The API's own defaults (backend-services/lib/accounts.ts and billing.ts).
 * Used when the API can't be reached, e.g. in CI, where the build points at a
 * placeholder origin, so a build never fails or ships an empty pricing table.
 * `payments` stays off: packs are only advertised once the API says they can
 * really be bought.
 */
const DEFAULT_PRICING: Pricing = {
	billing: true,
	signupTokens: 5,
	costs: { prompt: 1, deploy: 1 },
	currency: "usd",
	payments: null,
	packs: [
		{ id: "starter", tokens: 50, amount: 500 },
		{ id: "builder", tokens: 150, amount: 1_200 },
		{ id: "studio", tokens: 400, amount: 2_800 },
	],
}

/** How often the home page re-reads it, in seconds. */
export const PRICING_REVALIDATE_SECONDS = 3_600

const isPack = (value: unknown): value is TokenPack => {
	const pack = value as TokenPack
	return typeof pack?.id === "string" && Number.isFinite(pack.tokens) && Number.isFinite(pack.amount)
}

export async function getPricing(): Promise<Pricing> {
	if (!BACKEND_URL) return DEFAULT_PRICING
	try {
		const response = await fetch(`${BACKEND_URL}/auth/config`, {
			next: { revalidate: PRICING_REVALIDATE_SECONDS },
			signal: AbortSignal.timeout(4_000),
		})
		if (!response.ok) return DEFAULT_PRICING
		const data = await response.json() as Partial<AuthConfig>
		if (typeof data.billing !== "boolean" || typeof data.signupTokens !== "number" || !data.costs) return DEFAULT_PRICING
		return {
			billing: data.billing,
			signupTokens: data.signupTokens,
			costs: { prompt: Number(data.costs.prompt) || 0, deploy: Number(data.costs.deploy) || 0 },
			currency: typeof data.currency === "string" ? data.currency : DEFAULT_PRICING.currency,
			packs: Array.isArray(data.packs) ? data.packs.filter(isPack) : [],
			payments: data.payments === "dodo" ? "dodo" : null,
			github: data.github === true,
		}
	} catch {
		return DEFAULT_PRICING
	}
}

/**
 * Fixed locale: this renders on the server, where the visitor's locale is
 * unknown. Whole amounts drop their cents ("$5", not "$5.00").
 */
export const formatPrice = (amount: number, currency: string) => {
	const value = amount / 100
	const whole = Number.isInteger(value) ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}
	return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), ...whole }).format(value)
}

/** How many chats a number of credits buys at the configured price. */
export const chatsFor = (credits: number, pricing: Pricing) =>
	pricing.costs.prompt > 0 ? Math.floor(credits / pricing.costs.prompt) : null
