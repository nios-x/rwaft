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

export const corsmiddlewares = (req: Request, res: Response, next: NextFunction) => {
	const origin = req.headers.origin

	if (origin && isOriginAllowed(origin)) {
		res.setHeader("Access-Control-Allow-Origin", origin)
		res.setHeader("Vary", "Origin")
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

	if (origin && !isOriginAllowed(origin)) {
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
