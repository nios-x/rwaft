/**
 * Backend origin.
 *
 * NEXT_PUBLIC_* values are inlined at build time, so this must be set in the
 * Vercel project settings before the production build runs. There is
 * deliberately no hardcoded production fallback: the previous code shipped
 * `https://rwaft.onrender.com` as a default, so a misconfigured deployment
 * silently pointed at somebody else's backend instead of failing visibly.
 */
const configured = process.env.NEXT_PUBLIC_BACKEND_URL?.trim()

export const BACKEND_URL = (configured || (process.env.NODE_ENV === "development" ? "http://localhost:3000" : ""))
	.replace(/\/+$/, "")

export const isBackendConfigured = BACKEND_URL.length > 0

export const MISSING_BACKEND_MESSAGE =
	"NEXT_PUBLIC_BACKEND_URL is not set. Add it to your environment and redeploy the frontend."
