/**
 * Public identity of the console, shared by the metadata, the sitemap, robots,
 * the manifest and the share image.
 *
 * SITE_URL is the canonical origin. Every other host serving the same build
 * (rwaft.vercel.app, preview deployments, www) points search engines back here
 * through the canonical link, so ranking signals collect on one URL instead of
 * being split across duplicates. Self-hosters override it with
 * NEXT_PUBLIC_SITE_URL; it is inlined at build time.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://rwaft.live").replace(/\/+$/, "")

export const SITE_NAME = "rwaft"

/** Under 60 characters so Google shows it whole; the brand stays lowercase. */
export const SITE_TITLE = "rwaft · AI website builder: describe an app, get a live link"

/** Under 160 characters, the length Google shows before cutting a snippet. */
export const SITE_DESCRIPTION =
	"Describe an app in plain words. rwaft's AI writes it, builds it and hosts it at its own URL while you watch the real build. Or deploy a public React repo."

/** Where the footer and the legal pages send privacy and support requests. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "soumyajaiswal7708@gmail.com"
export const CONTACT_URL = `mailto:${CONTACT_EMAIL}`
export const CONTACT_LABEL = CONTACT_EMAIL

/** When the privacy policy and terms last changed. Update it with them. */
export const LEGAL_UPDATED = "2026-10-21"
