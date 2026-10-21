/**
 * Google Sign-In: verifies the ID token the browser receives from Google
 * Identity Services.
 *
 * The token is an RS256 JWT signed with one of Google's rotating keys. It is
 * checked here against the published JWKS with WebCrypto rather than through
 * google-auth-library, which would pull a large dependency tree into the API
 * image for one signature check. Every claim Google documents as required is
 * enforced: signature, issuer, audience, expiry and a verified email.
 */

const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"])
/** Tolerated clock drift between this host and Google, in seconds. */
const CLOCK_SKEW_SECONDS = 60

const configuredClientId = process.env.GOOGLE_CLIENT_ID?.trim().replace(/^["']|["']$/g, "") || ""

/**
 * A Web client ID always looks like `1234-abc.apps.googleusercontent.com`, and
 * it is public: /auth/config hands it to every browser. Anything else is
 * refused, never served. The usual mistake is pasting the client SECRET
 * (GOCSPX-…) from the same Google Cloud page, which Google rejects with
 * "invalid_client" and which /auth/config would otherwise publish.
 */
export const GOOGLE_CLIENT_ID = /^[\w-]+\.apps\.googleusercontent\.com$/.test(configuredClientId) ? configuredClientId : ""

if (configuredClientId && !GOOGLE_CLIENT_ID) {
	console.error(configuredClientId.startsWith("GOCSPX-")
		? "[auth] GOOGLE_CLIENT_ID holds a client SECRET (GOCSPX-…), not a client ID. Google sign-in is disabled until it is set to the Client ID, which ends in .apps.googleusercontent.com. This API never needs the secret; remove it from .env and rotate it in Google Cloud."
		: "[auth] GOOGLE_CLIENT_ID does not look like a Google Web client ID (expected …apps.googleusercontent.com). Google sign-in is disabled until it is corrected.")
}

export interface GoogleProfile {
	sub: string
	email: string
	name: string
	picture: string
}

type Jwk = { kid: string; kty: string; n: string; e: string; alg?: string }
type FetchJsonResponse = {
	ok: boolean
	status: number
	headers: { get(name: string): string | null }
	json(): Promise<unknown>
}

let keyCache: { keys: Map<string, CryptoKey>; expiresAt: number } | null = null

const base64UrlDecode = (value: string): Uint8Array<ArrayBuffer> => new Uint8Array(Buffer.from(value, "base64url"))

const decodeJson = (segment: string): Record<string, unknown> =>
	JSON.parse(Buffer.from(segment, "base64url").toString("utf-8")) as Record<string, unknown>

/** Fetches Google's signing keys, honouring the Cache-Control lifetime Google sends. */
async function loadKeys(force = false): Promise<Map<string, CryptoKey>> {
	if (!force && keyCache && keyCache.expiresAt > Date.now()) return keyCache.keys

	const response = await fetch(GOOGLE_CERTS_URL) as unknown as FetchJsonResponse
	if (!response.ok) throw new Error(`Google certs returned ${response.status}`)
	const body = await response.json() as { keys?: Jwk[] }

	const keys = new Map<string, CryptoKey>()
	for (const jwk of body.keys ?? []) {
		if (jwk.kty !== "RSA") continue
		keys.set(jwk.kid, await crypto.subtle.importKey(
			"jwk",
			{ kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
			{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
			false,
			["verify"]
		))
	}

	const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get("cache-control") || "")?.[1] || 3_600)
	keyCache = { keys, expiresAt: Date.now() + maxAge * 1_000 }
	return keys
}

/** Throws unless `idToken` is a currently valid Google ID token issued for this app. */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
	if (!GOOGLE_CLIENT_ID) throw new Error("GOOGLE_CLIENT_ID is not configured")

	const parts = idToken.split(".")
	if (parts.length !== 3) throw new Error("Malformed ID token")
	const [headerSegment, payloadSegment, signatureSegment] = parts as [string, string, string]

	const header = decodeJson(headerSegment)
	if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("Unsupported ID token header")

	let key = (await loadKeys()).get(header.kid)
	// Google rotates keys; a kid we have not seen yet means our cache is stale.
	if (!key) key = (await loadKeys(true)).get(header.kid)
	if (!key) throw new Error("ID token signed with an unknown key")

	const valid = await crypto.subtle.verify(
		"RSASSA-PKCS1-v1_5",
		key,
		base64UrlDecode(signatureSegment),
		new TextEncoder().encode(`${headerSegment}.${payloadSegment}`)
	)
	if (!valid) throw new Error("ID token signature is invalid")

	const claims = decodeJson(payloadSegment)
	const now = Math.floor(Date.now() / 1_000)
	if (!GOOGLE_ISSUERS.has(String(claims.iss))) throw new Error("ID token issuer is not Google")
	if (claims.aud !== GOOGLE_CLIENT_ID) throw new Error("ID token was issued for another app")
	if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SECONDS < now) throw new Error("ID token has expired")
	if (typeof claims.sub !== "string" || !claims.sub) throw new Error("ID token has no subject")
	// An unverified address could belong to anyone; it must not name an account.
	if (claims.email_verified !== true && claims.email_verified !== "true") throw new Error("Google email is not verified")

	return {
		sub: claims.sub,
		email: String(claims.email || ""),
		name: String(claims.name || claims.email || ""),
		picture: String(claims.picture || "")
	}
}
