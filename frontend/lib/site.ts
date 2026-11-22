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
 * Brand, then the category both searches name ("AI app builder", "AI website
 * builder"), then the promise: the pattern Google already reads as this
 * category's on lovable.dev.
 */
export const SITE_TITLE = "rwaft: AI App & Website Builder | Live Link in Minutes"

/** Under 160 characters, the length Google shows before cutting a snippet. */
export const SITE_DESCRIPTION =
	"Build apps and websites by chatting with AI. Describe an idea, watch rwaft write and deploy it, and get a live link in minutes. Free to start, no subscription."

/**
 * When the explanatory pages (how it works, FAQ, /make, /compare) last
 * changed, for the sitemap. A lastmod that moves on every request teaches
 * search engines to ignore it; update this with the copy.
 */
export const CONTENT_UPDATED = "2026-10-24"

/**
 * The X account the footer and the legal pages send privacy and support
 * requests to. Self-hosters set their own handle, with or without the @.
 */
export const CONTACT_HANDLE = (process.env.NEXT_PUBLIC_CONTACT_X?.trim() || "soumya_7708").replace(/^@/, "")
export const CONTACT_URL = `https://x.com/${CONTACT_HANDLE}`
export const CONTACT_LABEL = `@${CONTACT_HANDLE}`

/**
 * The public source repository. Its GitHub homepage field points back here,
 * and naming it in the Organization's `sameAs` closes that loop: the two
 * together tell search engines "rwaft" is a product, not a misspelt "raft".
 * Self-hosters set their own, or an empty value to leave it out.
 */
const sourceRepo = process.env.NEXT_PUBLIC_SOURCE_REPO_URL
export const SOURCE_REPO_URL = (sourceRepo === undefined ? "https://github.com/nios-x/rwaft" : sourceRepo.trim()).replace(/\/+$/, "")

/** When the privacy policy and terms last changed. Update it with them. */
export const LEGAL_UPDATED = "2026-10-22"
