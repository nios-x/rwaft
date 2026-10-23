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

/**
 * Under 60 characters so Google shows it whole; the brand stays lowercase.
 * Names both searches people make for this, "AI app builder" and "AI website
 * builder".
 */
export const SITE_TITLE = "rwaft · AI app & website builder, prompt to live link"

/** Under 160 characters, the length Google shows before cutting a snippet. */
export const SITE_DESCRIPTION =
	"AI app and website builder. Describe an app in plain words and rwaft writes, builds and hosts it at its own link while you watch. No code, no subscription."

/**
 * When the explanatory pages (how it works, FAQ, /make, /compare) last
 * changed, for the sitemap. A lastmod that moves on every request teaches
 * search engines to ignore it; update this with the copy.
 */
export const CONTENT_UPDATED = "2026-10-23"

/**
 * The X account the footer and the legal pages send privacy and support
 * requests to. Self-hosters set their own handle, with or without the @.
 */
export const CONTACT_HANDLE = (process.env.NEXT_PUBLIC_CONTACT_X?.trim() || "soumya_7708").replace(/^@/, "")
export const CONTACT_URL = `https://x.com/${CONTACT_HANDLE}`
export const CONTACT_LABEL = `@${CONTACT_HANDLE}`

/** When the privacy policy and terms last changed. Update it with them. */
export const LEGAL_UPDATED = "2026-10-22"
