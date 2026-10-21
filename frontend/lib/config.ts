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

/**
 * The development default is 127.0.0.1, not localhost. Browsers resolve
 * localhost to ::1 first, and a `next dev` left on :3000 listens there while
 * the API listens on IPv4 :3000 — so "localhost:3000" quietly reached the
 * console itself and every API call came back as a Next 404 page.
 */
export const BACKEND_URL = (configured || (process.env.NODE_ENV === "development" ? "http://127.0.0.1:3000" : ""))
	.replace(/\/+$/, "")

export const isBackendConfigured = BACKEND_URL.length > 0

export const MISSING_BACKEND_MESSAGE =
	"NEXT_PUBLIC_BACKEND_URL is not set. Add it to your environment and redeploy the frontend."

/**
 * Reads an API response as JSON, or explains in plain words why it isn't.
 * An HTML body means the request reached a web page (a 404, a proxy error
 * page, this console itself) rather than the rwaft API.
 */
export async function readApiJson<T>(response: Response): Promise<T> {
	const type = response.headers.get("content-type") || ""
	if (!type.includes("application/json")) {
		throw new Error(`Couldn't reach the rwaft API at ${BACKEND_URL} (got HTTP ${response.status}). Check that the backend is running.`)
	}
	return await response.json() as T
}
