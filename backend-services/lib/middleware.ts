import type { NextFunction, Request, Response } from "express"

/**
 * CORS.
 *
 * The previous default allowed "*" — in production too — so any site on the
 * internet could drive the deploy and prompt endpoints and burn the AI budget.
 * The allowlist now comes from FRONTEND_ORIGIN, and a wildcard is only honoured
 * outside production.
 */
const isProduction = process.env.NODE_ENV === "production"

const configuredOrigins = (process.env.FRONTEND_ORIGIN || "")
	.split(",")
	.map((origin) => origin.trim().replace(/\/+$/, ""))
	.filter(Boolean)

const developmentDefaults = [
	"http://localhost:3000",
	"http://localhost:3001",
	"http://127.0.0.1:3000",
	"http://127.0.0.1:3001"
]

const allowedOrigins = configuredOrigins.length > 0
	? configuredOrigins
	: (isProduction ? [] : developmentDefaults)
const allowAny = allowedOrigins.includes("*")

if (isProduction && allowedOrigins.length === 0) {
	console.warn("[cors] FRONTEND_ORIGIN is not set - browser requests from your frontend will be blocked.")
}
if (isProduction && allowAny) {
	console.warn('[cors] FRONTEND_ORIGIN contains "*" in production - every origin can call this API.')
}

export function isOriginAllowed(origin: string | undefined): boolean {
	if (!origin) return true // same-origin / server-to-server requests carry no Origin
	if (allowAny) return true
	return allowedOrigins.includes(origin.replace(/\/+$/, ""))
}

/**
 * The origin this request was addressed to.
 *
 * `trust proxy` is enabled on the app, so `protocol` and `host` describe the
 * original client request rather than the platform's internal hop. Both include
 * the port when it is non-default, exactly as an Origin header does.
 */
const requestOrigin = (req: Request): string => `${req.protocol}://${req.get("host")}`

export const corsmiddlewares = (req: Request, res: Response, next: NextFunction) => {
	const origin = req.headers.origin
	// A same-origin request is not what the allowlist defends against: only a
	// page this server itself served can send it, and it could have fetched the
	// same URL with no Origin header at all.
	//
	// This is load-bearing for deployed sites. Vite marks its bundles
	// `crossorigin` and module scripts are always fetched in CORS mode, so a
	// deployed site's own CSS and JS arrive carrying an Origin header of its own
	// hostname. Gating those on FRONTEND_ORIGIN 403'd every asset of every
	// deployed site: the HTML loaded (navigations send no Origin) and then
	// rendered blank, while curl and server-to-server checks saw only 200s.
	const sameOrigin = Boolean(origin) && origin === requestOrigin(req)
	const allowed = sameOrigin || isOriginAllowed(origin)

	if (origin && !allowed) {
		// Without this the rejection is invisible: the browser only reports a
		// missing Access-Control-Allow-Origin header, never which origin the
		// server refused or what it would have accepted. Logged for preflight
		// too, which is where the failure usually shows up first.
		console.warn(
			`[cors] rejected origin ${origin}; FRONTEND_ORIGIN allows ${allowedOrigins.join(", ") || "(nothing)"}`
		)
	}

	// Vary belongs on every response, not just allowed ones: a cache holding
	// the 403 must not replay it for an origin that is allowed.
	res.setHeader("Vary", "Origin")

	if (origin && allowed) {
		res.setHeader("Access-Control-Allow-Origin", origin)
	}

	res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
	res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-User-Id,Last-Event-ID")
	res.setHeader("Access-Control-Max-Age", "600")

	if (req.method === "OPTIONS") {
		// A disallowed origin never received the allow-origin header above, so
		// the browser rejects it anyway. Answering 204 keeps preflight cheap.
		res.sendStatus(204)
		return
	}

	if (origin && !allowed) {
		res.status(403).json({ status: "failed", message: "Origin not allowed" })
		return
	}

	next()
}

/** Baseline security headers for an API that also proxies static sites. */
export const securityHeaders = (_req: Request, res: Response, next: NextFunction) => {
	res.setHeader("X-Content-Type-Options", "nosniff")
	res.setHeader("Referrer-Policy", "no-referrer")
	next()
}
