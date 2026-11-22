/**
 * The UI/UX check every generated page goes through after it is written
 * (skills/ui-ux-rules.md says what a page should be; this checks the parts
 * that can be checked without a model).
 *
 * Two kinds of result:
 * - fixes it can make itself, without changing what the page means: image
 *   sizes and lazy loading, `transition-all`, `100vh` sections, sample email
 *   domains. These cost nothing, so they always run.
 * - findings a model has to fix, because the right fix depends on the page:
 *   an image's alt text, an icon button's name, a clickable <div>, a missing
 *   label, a dead link, invented social proof, decorative emoji, empty AI
 *   vocabulary. lib/pages.ts sends a file with findings back once.
 *
 * Everything here is a heuristic over TSX source, tuned to miss rather than
 * to cry wolf: a false finding costs a model call and can make a page worse.
 */

export interface UxFinding {
	rule: string
	message: string
}

export interface UxContext {
	/** The user's request, so content the user gave (testimonials, a phone number) isn't flagged. */
	prompt: string
}

interface Tag {
	start: number
	/** Index just past the closing ">". */
	end: number
	name: string
	attrs: string
	selfClosing: boolean
}

/** JSX tags by name, skipping over `{…}` expressions so an arrow function's ">" doesn't end the tag. */
export function findTags(source: string, names: string[]): Tag[] {
	const tags: Tag[] = []
	const pattern = new RegExp(`<(${names.join("|")})(?=[\\s/>])`, "g")
	for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
		let depth = 0
		let quote: string | null = null
		let index = match.index + match[0].length
		for (; index < source.length; index++) {
			const char = source[index]!
			if (quote) {
				if (char === quote && source[index - 1] !== "\\") quote = null
				continue
			}
			if (char === '"' || char === "'" || char === "`") quote = char
			else if (char === "{") depth++
			else if (char === "}") depth--
			else if (char === ">" && depth === 0) break
		}
		if (index >= source.length) break
		const selfClosing = source[index - 1] === "/"
		tags.push({
			start: match.index,
			end: index + 1,
			name: match[1]!,
			attrs: source.slice(match.index + match[0].length, selfClosing ? index - 1 : index),
			selfClosing,
		})
		pattern.lastIndex = index + 1
	}
	return tags
}

const hasAttr = (attrs: string, name: string) => new RegExp(`(^|\\s)${name}\\s*=`).test(attrs)

// ── Fixes made without a model ──────────────────────────────────────────────

const PICSUM_SIZE = /picsum\.photos\/(?:seed\/[^/"'`\s]+\/)?(\d{2,4})\/(\d{2,4})/
/** Domains that are already samples, or that the request may have given on purpose. */
const SAMPLE_DOMAINS = /^(example\.(com|org|net)|.*\.example)$/i
const EMAIL = /\b([A-Za-z0-9._%+-]+)@((?:[A-Za-z0-9-]+\.)+)(com|net|org|io|co|dev|app|ai|in|uk|de|biz|info|shop|store|cafe|studio|me|us)\b/g

export function autofixUx(file: string, source: string, context: UxContext): { content: string; fixes: string[] } {
	const fixes: string[] = []
	let content = source

	// Images: intrinsic size from the picsum URL (no layout jump while loading),
	// eager for the first image of a page, lazy for the rest.
	const isPage = /^src\/pages\//.test(file)
	const images = findTags(content, ["img"])
	let sized = 0
	let lazied = 0
	for (let index = images.length - 1; index >= 0; index--) {
		const tag = images[index]!
		const original = tag.attrs.replace(/\s+$/, "")
		let attrs = original
		const size = PICSUM_SIZE.exec(attrs)
		if (size && !hasAttr(attrs, "width") && !hasAttr(attrs, "height")) {
			attrs += ` width={${size[1]}} height={${size[2]}}`
			sized++
		}
		const firstOnPage = isPage && index === 0
		if (!firstOnPage && !hasAttr(attrs, "loading") && !/hero/i.test(file)) {
			attrs += ` loading="lazy" decoding="async"`
			lazied++
		}
		if (attrs !== original) {
			const rebuilt = `<${tag.name}${attrs}${tag.selfClosing ? " />" : ">"}`
			content = content.slice(0, tag.start) + rebuilt + content.slice(tag.end)
		}
	}
	if (sized) fixes.push(`sized ${sized} image${sized === 1 ? "" : "s"}`)
	if (lazied) fixes.push(`lazy-loaded ${lazied} image${lazied === 1 ? "" : "s"} below the first`)

	// `transition-all` animates layout properties; Tailwind's `transition` is the compositor-friendly set.
	const allTransitions = content.match(/(?<![\w-])transition-all(?![\w-])/g)?.length ?? 0
	if (allTransitions) {
		content = content.replace(/(?<![\w-])transition-all(?![\w-])/g, "transition")
		fixes.push("replaced transition-all")
	}

	// 100vh overflows behind a phone's browser bars; the dynamic unit fits the visible screen.
	const screens = content.match(/(?<=[\s"'`:])(min-h|max-h|h)-screen(?![\w-])/g)?.length ?? 0
	if (screens) {
		content = content.replace(/(?<=[\s"'`:])(min-h|max-h|h)-screen(?![\w-])/g, "$1-dvh")
		fixes.push("100vh → dvh")
	}

	// Sample emails on a domain someone may own: move them to the reserved .example domain.
	const given = new Set([...context.prompt.matchAll(EMAIL)].map((match) => match[0].toLowerCase()))
	let emails = 0
	content = content.replace(EMAIL, (whole, local: string, host: string, tld: string) => {
		const domain = `${host}${tld}`
		if (SAMPLE_DOMAINS.test(domain) || given.has(whole.toLowerCase())) return whole
		emails++
		return `${local}@${host}example`
	})
	if (emails) fixes.push(`moved ${emails} sample email${emails === 1 ? "" : "s"} to .example`)

	return { content, fixes }
}

// ── Findings for a model ────────────────────────────────────────────────────

const ICON_ONLY = /^\s*(\{[^{}]*\}\s*)?<([A-Z][\w.]*)\b[^<>]*\/>\s*(\{[^{}]*\}\s*)?$/
const BUZZWORDS = /\b(elevate[sd]?|empower(s|ing)?|seamless(ly)?|cutting-edge|revolutioni[sz]e[sd]?|revolutionary|game-?changer|game-?changing|next-level|delve|testament to|in today's (fast-paced|digital|ever)|look no further|whether you're a)\b/gi
/** Emoji, without the symbols a footer legitimately uses (©, ®, ™). */
const EMOJI = /(?![©®™])\p{Extended_Pictographic}/u
const SOCIAL_PROOF = /\btestimonials?\b|trusted by\b|\b(happy|satisfied) (customers|clients|guests)\b|\brating:\s*[345](\.\d)?\b|[★⭐]{3,}/i
const REAL_PHONE = /(\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b|tel:\+?\d{8,}/

/** Code comments say nothing to a visitor; strip them before reading copy. */
const withoutComments = (source: string) =>
	source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1")

export function findUxProblems(file: string, source: string, context: UxContext): UxFinding[] {
	if (!/\.tsx$/.test(file)) return []
	const findings: UxFinding[] = []
	const code = withoutComments(source)

	const images = findTags(code, ["img"])
	const noAlt = images.filter((tag) => !hasAttr(tag.attrs, "alt")).length
	if (noAlt) findings.push({ rule: "img-alt", message: `${noAlt} <img> without alt text. Add alt describing what the image shows, or alt="" if it is purely decorative.` })

	const clickable = findTags(code, ["div", "span", "li", "section", "article"]).filter((tag) => hasAttr(tag.attrs, "onClick"))
	if (clickable.length) findings.push({ rule: "clickable-div", message: `${clickable.length} <${clickable[0]!.name}> with onClick. Use <button type="button"> for actions or <Link to> for navigation, so it works with the keyboard.` })

	let unnamed = 0
	for (const tag of findTags(code, ["button", "Button"])) {
		if (tag.selfClosing || hasAttr(tag.attrs, "aria-label") || hasAttr(tag.attrs, "aria-labelledby") || hasAttr(tag.attrs, "title")) continue
		const close = code.indexOf(`</${tag.name}>`, tag.end)
		if (close !== -1 && ICON_ONLY.test(code.slice(tag.end, close))) unnamed++
	}
	if (unnamed) findings.push({ rule: "icon-button-name", message: `${unnamed} icon-only button${unnamed === 1 ? "" : "s"} without a name. Add aria-label saying what it does ("Close menu", "Next photo").` })

	const fields = findTags(code, ["input", "Input", "textarea", "Textarea", "select"]).filter((tag) => !/type\s*=\s*["'](hidden|submit|button|reset)["']/.test(tag.attrs))
	const named = fields.filter((tag) => hasAttr(tag.attrs, "aria-label") || hasAttr(tag.attrs, "aria-labelledby")).length
	const labels = findTags(code, ["label", "Label"]).length
	if (fields.length > named + labels) {
		findings.push({ rule: "field-label", message: `${fields.length} form fields but only ${named + labels} labels. Give every field a visible <Label htmlFor> (or wrap it in one); a placeholder is not a label.` })
	}

	const outlines = [...code.matchAll(/["'`]([^"'`]*?(?<![\w:-])outline-none[^"'`]*)["'`]/g)].filter((match) => !/focus(-visible)?:(ring|outline|border|shadow)/.test(match[1]!))
	if (outlines.length) findings.push({ rule: "focus-visible", message: `outline-none without a visible focus replacement. Add focus-visible:ring-2 focus-visible:ring-ring (or keep the default outline).` })

	const dead = code.match(/\b(href|to)\s*=\s*["'](#|javascript:[^"']*)?["']/g)?.length ?? 0
	if (dead) findings.push({ rule: "dead-link", message: `${dead} link${dead === 1 ? "" : "s"} going nowhere (href="#" or empty). Point each at a real page, a section id that exists, or remove it.` })

	if (EMOJI.test(code)) findings.push({ rule: "emoji", message: "Emoji in the interface. Remove them from headings, buttons, badges and lists; use a fitting lucide icon or nothing." })

	const buzz = [...new Set([...code.matchAll(BUZZWORDS)].map((match) => match[0].toLowerCase()))]
	if (buzz.length) findings.push({ rule: "ai-vocabulary", message: `Empty marketing words in the copy (${buzz.slice(0, 5).map((word) => `"${word}"`).join(", ")}). Rewrite those sentences in plain words that say what the product does.` })

	if (!/testimonial|review|rating|quote|said|says/i.test(context.prompt) && SOCIAL_PROOF.test(code)) {
		findings.push({ rule: "invented-proof", message: "Invented social proof (testimonials, ratings, \"trusted by\", happy-customer counts) that the request never gave. Remove that section or content entirely; do not replace it with other invented proof." })
	}

	if (!/\d{3}[\s.-]?\d{3}[\s.-]?\d{3,4}/.test(context.prompt) && REAL_PHONE.test(code)) {
		findings.push({ rule: "real-phone", message: "A phone number in a real, dialable format. Remove it (and its tel: link) or replace the contact option with the email or form." })
	}

	const eyebrows = code.match(EYEBROW)?.length ?? 0
	if (eyebrows) findings.push({ rule: "eyebrow", message: `${eyebrows} small uppercase label${eyebrows === 1 ? "" : "s"} sitting right above a heading. Delete ${eyebrows === 1 ? "it" : "them"} and let the heading speak; move any real information into the heading or the sentence below it.` })

	const arrows = code.match(ARROW_ICON)?.length ?? 0
	if (arrows > 2) findings.push({ rule: "arrows", message: `${arrows} arrow icons on buttons and links. Keep one, on the main action that leads somewhere; remove the rest.` })

	if (!STREET_NUMBER.test(context.prompt) && STREET_NUMBER.test(code)) {
		findings.push({ rule: "house-number", message: "A street address with a house number or postcode. Use the street and district only (\"Rua da Graça, Graça\"), so the sample can't point at a real building." })
	}

	return findings
}

/** A tracked uppercase label whose closing tag is followed (maybe through one wrapper) by an <h1>–<h3>. */
const EYEBROW = /className=(["'`])[^"'`]*\buppercase\b[^"'`]*\btracking-[^"'`]*\1[^>]*>[^<]{1,60}<\/(p|span|div|small)>\s*(<(div|span)\b[^>]*>\s*)?<h[1-3]\b/g
/** lucide's arrows, and typed ones, as a direction cue. */
const ARROW_ICON = /<(ArrowRight|ArrowUpRight|MoveRight|ArrowRightCircle)\b|[→↗]/g
/** "Rua da Senhora do Monte 14", "142 Main Street", "1100-443 Lisboa". */
const STREET_NUMBER = /\b(Rua|Rue|Avenida|Avenue|Ave\.?|Calle|Carrer|Via|Viale|Straße|Strasse|Street|St\.|Road|Rd\.?|Lane|Boulevard|Blvd\.?)\s+[A-Za-zÀ-ÿ'’. -]{2,40}?\s\d{1,4}[a-zA-Z]?\b|\b\d{1,5}\s+[A-Z][A-Za-z]+(\s[A-Z][A-Za-z]+)?\s(Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Boulevard|Blvd|Drive|Dr|Way)\b|\b\d{4}-\d{3}\s+[A-Z]/

export const describeFindings = (findings: UxFinding[]) =>
	findings.map((finding) => `- ${finding.message}`).join("\n")
