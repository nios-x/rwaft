/**
 * The "Made with rwaft" link in the corner of every hosted page.
 *
 * The proxy adds it as it serves HTML rather than the worker baking it in, so
 * it reaches repo deploys and sites built before it existed, and switching it
 * off needs no rebuild. It links to the product's own site, the first entry of
 * FRONTEND_ORIGIN, tagged `?ref=badge`: hosted pages are served with
 * `Referrer-Policy: no-referrer`, so the tag is the only trace a visit leaves.
 * SITE_BADGE=false removes it.
 */
const homeOrigin = (process.env.FRONTEND_ORIGIN || "")
	.split(",")
	.map((origin) => origin.trim().replace(/\/+$/, ""))
	.find((origin) => /^https?:\/\//.test(origin))

const BADGE_URL = process.env.SITE_BADGE !== "false" && homeOrigin ? `${homeOrigin}/?ref=badge` : ""

const escapeAttribute = (value: string) =>
	value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

/**
 * The site's own CSS is unknown and often resets links, SVGs and fixed
 * elements, so every rule starts from `all: initial` and is `!important`
 * behind an id. No web font: the badge must not cost the page a request.
 */
const BADGE_STYLE = [
	"#rwaft-badge{all:initial!important;position:fixed!important;right:calc(12px + env(safe-area-inset-right))!important;bottom:calc(12px + env(safe-area-inset-bottom))!important;z-index:2147483647!important;display:flex!important;align-items:center!important;gap:7px!important;box-sizing:border-box!important;padding:5px 11px 5px 5px!important;border:1px solid rgba(255,255,255,.14)!important;border-radius:999px!important;background:rgba(3,3,5,.86)!important;box-shadow:0 4px 16px rgba(0,0,0,.22)!important;color:#d4d4dc!important;font:500 12px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif!important;letter-spacing:0!important;text-decoration:none!important;white-space:nowrap!important;cursor:pointer!important;transition:background-color .15s!important}",
	"#rwaft-badge:hover{background:#030305!important;color:#fafafa!important}",
	"#rwaft-badge:focus-visible{outline:2px solid #8b72ff!important;outline-offset:2px!important}",
	"#rwaft-badge svg{all:initial!important;display:block!important;flex:none!important;width:18px!important;height:18px!important}",
	"#rwaft-badge span{all:initial!important;font:inherit!important;color:inherit!important;white-space:inherit!important}",
	"#rwaft-badge strong{all:initial!important;font:inherit!important;font-weight:650!important;color:#fafafa!important}",
	"@media print{#rwaft-badge{display:none!important}}",
].join("")

/** The logo mark from the share card: three log lines resolving into one live dot. */
const BADGE_MARK = `<svg viewBox="0 0 28 28" aria-hidden="true" focusable="false"><rect x="0.5" y="0.5" width="27" height="27" rx="8" fill="#fafafa"/><g stroke="#030305" stroke-width="2.4" stroke-linecap="round"><path d="M6.6 9.6h6.4"/><path d="M6.6 14h8.9"/><path d="M6.6 18.4h5.4"/></g><circle cx="19.7" cy="14" r="2.8" fill="#8b72ff"/></svg>`

const BADGE_HTML = BADGE_URL
	? `<style>${BADGE_STYLE}</style><a id="rwaft-badge" href="${escapeAttribute(BADGE_URL)}" target="_blank" rel="noopener">${BADGE_MARK}<span>Made with <strong>rwaft</strong></span></a>`
	: ""

/**
 * Adds the badge to a full HTML document, just before `</body>`. Anything that
 * is not a whole page (a fragment some script fetches and inserts) is returned
 * untouched, as is a page that already carries one.
 */
export function withBadge(html: string): string {
	if (!BADGE_HTML || html.includes('id="rwaft-badge"')) return html
	const lower = html.toLowerCase()
	const bodyEnd = lower.lastIndexOf("</body>")
	if (bodyEnd !== -1) return html.slice(0, bodyEnd) + BADGE_HTML + html.slice(bodyEnd)
	// `</body>` is optional in HTML; trailing content still lands in the body.
	return /^\s*(?:<!doctype html|<html)/.test(lower) ? html + BADGE_HTML : html
}
