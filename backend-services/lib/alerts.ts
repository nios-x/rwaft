import type { Account } from "./accounts.ts"

/**
 * Tells the owner about each new account. The email itself is sent by the
 * website (frontend/app/api/signup-alert on Vercel), which holds the Gmail
 * credentials: this API only posts the new account there over HTTPS, so it
 * never needs outbound SMTP, which Render's free instances do not allow.
 *
 * SIGNUP_ALERT_SECRET must equal the website's variable of the same name. The
 * route defaults to <first FRONTEND_ORIGIN>/api/signup-alert and
 * SIGNUP_ALERT_URL overrides it. With no secret, nothing is sent and sign-up
 * works exactly as before.
 */
const SIGNUP_ALERT_SECRET = process.env.SIGNUP_ALERT_SECRET?.trim() || ""
const SIGNUP_ALERT_URL = (() => {
	const configured = process.env.SIGNUP_ALERT_URL?.trim()
	if (configured) return configured
	const origin = (process.env.FRONTEND_ORIGIN || "").split(",")[0]?.trim().replace(/\/+$/, "")
	return origin && origin !== "*" ? `${origin}/api/signup-alert` : ""
})()
const ALERT_TIMEOUT_MS = 20_000

export const isSignupAlertConfigured = Boolean(SIGNUP_ALERT_SECRET && SIGNUP_ALERT_URL)

/** See the note on FetchResponse in index.ts: Bun's types lack the DOM Response. */
type FetchResponse = {
	ok: boolean
	status: number
	text(): Promise<string>
}

async function callAlertRoute(method: "GET" | "POST", body?: unknown): Promise<{ ok: boolean; message: string }> {
	const response = await fetch(SIGNUP_ALERT_URL, {
		method,
		headers: {
			Authorization: `Bearer ${SIGNUP_ALERT_SECRET}`,
			...(body === undefined ? {} : { "Content-Type": "application/json" })
		},
		body: body === undefined ? undefined : JSON.stringify(body),
		signal: AbortSignal.timeout(ALERT_TIMEOUT_MS)
	}) as unknown as FetchResponse
	let message = ""
	try {
		message = String((JSON.parse(await response.text()) as { message?: unknown }).message ?? "")
	} catch { /* not the alert route answering; described by status below */ }
	if (!message && response.status === 404) message = "HTTP 404: the website has no /api/signup-alert yet; redeploy it"
	return { ok: response.ok, message: message || `HTTP ${response.status}` }
}

/**
 * Asks the website to log in to Gmail once at startup, so a missing secret or
 * a wrong App Password shows up in the boot log rather than at the first
 * sign-up.
 */
export async function verifySignupAlert(): Promise<void> {
	if (!isSignupAlertConfigured) {
		console.log(SIGNUP_ALERT_SECRET
			? "[alerts] Sign-up alerts are off: set SIGNUP_ALERT_URL or FRONTEND_ORIGIN."
			: "[alerts] Sign-up alerts are off (SIGNUP_ALERT_SECRET is not set).")
		return
	}
	try {
		const result = await callAlertRoute("GET")
		if (result.ok) console.log(`[alerts] Sign-up alerts on via ${SIGNUP_ALERT_URL}: ${result.message}`)
		else console.error(`[alerts] Sign-up alerts will fail: ${SIGNUP_ALERT_URL} answered ${result.message}`)
	} catch (error) {
		console.error(`[alerts] Sign-up alerts will fail: could not reach ${SIGNUP_ALERT_URL}: ${(error as Error).message}`)
	}
}

/**
 * Never throws and never delays the sign-in: the caller fires it and moves on,
 * and a failure only costs the alert.
 */
export async function notifySignup(account: Account): Promise<void> {
	if (!isSignupAlertConfigured) return
	try {
		const result = await callAlertRoute("POST", {
			id: account.id,
			email: account.email,
			name: account.name,
			picture: account.picture,
			credits: account.tokens,
			signedUpAt: new Date().toISOString()
		})
		if (result.ok) console.log(`[alerts] Sign-up alert for ${account.id} sent: ${result.message}`)
		else console.error(`[alerts] Sign-up alert for ${account.id} failed: ${result.message}`)
	} catch (error) {
		console.error(`[alerts] Sign-up alert for ${account.id} failed: ${(error as Error).message}`)
	}
}
