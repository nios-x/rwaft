import { complete } from "./ai.ts"
import { jobLog } from "./joblog.ts"
import { loadSkill } from "./skills.ts"

/**
 * Step 1 of generation: the plan.
 *
 * One call turns the user's request into a small JSON document: what the app
 * is called, which pages it has, and its design schema (palette roles, a font
 * pair, a radius). Everything after this reads from it. The foundation step
 * turns the schema into tokens and a component kit without the model, and
 * every page is written against the same schema, so pages written in parallel
 * still look like one product.
 *
 * The model's JSON is never trusted as-is: every field is validated and
 * coerced, colours are checked for contrast, and a broken or empty answer
 * falls back to a sensible plan rather than failing the build.
 */

export type AppKind = "website" | "app" | "game" | "tool"
/** site = header navigation + footer; bare = the page owns the whole screen (games, single tools). */
export type AppLayout = "site" | "bare"
export type Radius = "none" | "sm" | "md" | "lg" | "xl"

export interface Palette {
	background: string
	foreground: string
	card: string
	cardForeground: string
	primary: string
	primaryForeground: string
	secondary: string
	secondaryForeground: string
	muted: string
	mutedForeground: string
	accent: string
	accentForeground: string
	border: string
	ring: string
}

export interface DesignSchema {
	mood: string
	mode: "light" | "dark"
	palette: Palette
	fonts: { heading: string; body: string }
	radius: Radius
}

export interface PagePlan {
	name: string
	/** PascalCase component name; the file is src/pages/<component>.tsx. */
	component: string
	path: string
	purpose: string
	sections: string[]
}

export interface AppPlan {
	name: string
	tagline: string
	kind: AppKind
	layout: AppLayout
	pages: PagePlan[]
	design: DesignSchema
	/** Data, state and interactions the pages share. */
	notes: string
}

const MAX_PAGES = Math.max(1, Number(process.env.PLAN_MAX_PAGES || 5))

/**
 * Google Fonts the planner may pick, with the weights each family really has.
 * Requesting a weight a family lacks makes the whole css2 request fail, so this
 * list is the source of truth for the font import, not the model.
 */
export const FONTS: Record<string, string> = {
	"Plus Jakarta Sans": "400;500;600;700;800",
	"DM Sans": "400;500;700",
	"Manrope": "400;500;600;700;800",
	"Space Grotesk": "400;500;600;700",
	"Outfit": "400;500;600;700",
	"Sora": "400;600;700",
	"Poppins": "400;500;600;700",
	"Montserrat": "400;500;600;700;800",
	"Work Sans": "400;500;600;700",
	"Lexend": "400;500;600;700",
	"Nunito": "400;600;700;800",
	"Rubik": "400;500;600;700",
	"IBM Plex Sans": "400;500;600;700",
	"Bricolage Grotesque": "400;600;700;800",
	"Syne": "400;600;700;800",
	"Archivo": "400;500;600;700;800",
	"Unbounded": "400;600;700",
	"Inter": "400;500;600;700",
	"Playfair Display": "400;600;700;800",
	"Fraunces": "400;600;700",
	"DM Serif Display": "400",
	"Instrument Serif": "400",
	"Cormorant Garamond": "400;500;600;700",
	"Lora": "400;500;600;700",
	"Libre Baskerville": "400;700",
	"Merriweather": "400;700",
	"Bebas Neue": "400",
	"Oswald": "400;500;600;700",
	"Anton": "400",
	"Orbitron": "400;500;700;900",
	"Press Start 2P": "400",
	"Space Mono": "400;700",
	"JetBrains Mono": "400;500;700",
	"Caveat": "400;600;700",
}

const FALLBACK_FONTS = { heading: "Bricolage Grotesque", body: "DM Sans" }

const LIGHT_PALETTE: Palette = {
	background: "#fafaf9", foreground: "#1c1917",
	card: "#ffffff", cardForeground: "#1c1917",
	primary: "#c2410c", primaryForeground: "#ffffff",
	secondary: "#f5f5f4", secondaryForeground: "#292524",
	muted: "#f5f5f4", mutedForeground: "#57534e",
	accent: "#fde68a", accentForeground: "#422006",
	border: "#e7e5e4", ring: "#c2410c",
}

const DARK_PALETTE: Palette = {
	background: "#0c0a09", foreground: "#fafaf9",
	card: "#1c1917", cardForeground: "#fafaf9",
	primary: "#f97316", primaryForeground: "#0c0a09",
	secondary: "#292524", secondaryForeground: "#fafaf9",
	muted: "#292524", mutedForeground: "#a8a29e",
	accent: "#facc15", accentForeground: "#0c0a09",
	border: "#292524", ring: "#f97316",
}

// ── Colour maths ────────────────────────────────────────────────────────────

const normalizeHex = (value: unknown): string | null => {
	if (typeof value !== "string") return null
	const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
	if (!match) return null
	const hex = match[1]!.toLowerCase()
	return `#${hex.length === 3 ? hex.split("").map((char) => char + char).join("") : hex}`
}

const luminance = (hex: string) => {
	const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
	const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number]
	return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export const contrast = (a: string, b: string) => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
	return (hi + 0.05) / (lo + 0.05)
}

/** The more legible of near-black and white on `surface`. */
const readableOn = (surface: string) => (contrast(surface, "#ffffff") >= contrast(surface, "#0a0a0a") ? "#ffffff" : "#0a0a0a")

/** Keeps the model's colour where it is legible, and replaces it where it is not. */
function coercePalette(raw: unknown, mode: "light" | "dark"): Palette {
	const fallback = mode === "dark" ? DARK_PALETTE : LIGHT_PALETTE
	const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
	const palette = Object.fromEntries(
		(Object.keys(fallback) as Array<keyof Palette>).map((key) => [key, normalizeHex(source[key]) ?? fallback[key]])
	) as unknown as Palette

	const ensure = (text: keyof Palette, surface: keyof Palette, minimum: number) => {
		if (contrast(palette[text], palette[surface]) < minimum) palette[text] = readableOn(palette[surface])
	}
	ensure("foreground", "background", 7)
	ensure("cardForeground", "card", 7)
	ensure("primaryForeground", "primary", 4.5)
	ensure("secondaryForeground", "secondary", 4.5)
	ensure("accentForeground", "accent", 4.5)
	// Muted text sits on the page background as often as on muted surfaces.
	if (contrast(palette.mutedForeground, palette.background) < 4.5 || contrast(palette.mutedForeground, palette.muted) < 4.5) {
		palette.mutedForeground = mode === "dark" ? "#a8a29e" : "#57534e"
		ensure("mutedForeground", "background", 4.5)
	}
	return palette
}

// ── Coercion ────────────────────────────────────────────────────────────────

const text = (value: unknown, fallback: string, max = 160) =>
	typeof value === "string" && value.trim() ? value.trim().replace(/\s+/g, " ").slice(0, max) : fallback

const pascal = (value: string) =>
	value.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(" ").filter(Boolean).map((word) => word[0]!.toUpperCase() + word.slice(1)).join("")

const kebab = (value: string) =>
	value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")

/** Names the scaffold already uses; a page called "App" would shadow the root. */
const RESERVED_COMPONENTS = new Set(["App", "Layout", "Main", "Index", "Button", "Card", "Badge", "Input", "Section", "Container"])

function coercePages(raw: unknown, layout: AppLayout): PagePlan[] {
	const list = Array.isArray(raw) ? raw : []
	const pages: PagePlan[] = []
	const components = new Set<string>()
	const paths = new Set<string>()

	for (const entry of list.slice(0, layout === "bare" ? 1 : MAX_PAGES)) {
		const item = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>
		const name = text(item.name, pages.length === 0 ? "Home" : `Page ${pages.length + 1}`, 40)

		let component = pascal(name)
		if (!/^[A-Z]/.test(component)) component = `Page${component}`
		if (RESERVED_COMPONENTS.has(component)) component = `${component}Page`
		while (components.has(component)) component = `${component}2`
		components.add(component)

		let route = pages.length === 0 ? "/" : `/${kebab(typeof item.path === "string" ? item.path : name) || kebab(name)}`
		while (paths.has(route)) route = `${route}-2`
		paths.add(route)

		const sections = (Array.isArray(item.sections) ? item.sections : [])
			.map((section) => text(section, "", 160))
			.filter(Boolean)
			.slice(0, 8)

		pages.push({ name, component, path: route, purpose: text(item.purpose, `The ${name} page`, 240), sections })
	}

	if (pages.length === 0) {
		pages.push({ name: "Home", component: "Home", path: "/", purpose: "The main page of the app", sections: [] })
	}
	return pages
}

function coercePlan(raw: unknown, prompt: string): AppPlan {
	const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
	const kinds: AppKind[] = ["website", "app", "game", "tool"]
	const kind = kinds.includes(source.kind as AppKind) ? (source.kind as AppKind) : "website"

	const rawPages = Array.isArray(source.pages) ? source.pages : []
	let layout: AppLayout = source.layout === "bare" ? "bare" : source.layout === "site" ? "site" : (kind === "game" || kind === "tool") ? "bare" : "site"
	// A bare layout has no navigation, so it can only ever show one page.
	if (layout === "bare" && rawPages.length > 1 && kind !== "game") layout = "site"

	const design = (source.design && typeof source.design === "object" ? source.design : {}) as Record<string, unknown>
	const mode = design.mode === "dark" ? "dark" : "light"
	const fonts = (design.fonts && typeof design.fonts === "object" ? design.fonts : {}) as Record<string, unknown>
	const pickFont = (value: unknown, fallback: string) => {
		if (typeof value !== "string") return fallback
		const match = Object.keys(FONTS).find((name) => name.toLowerCase() === value.trim().toLowerCase())
		return match ?? fallback
	}
	const radii: Radius[] = ["none", "sm", "md", "lg", "xl"]

	return {
		name: text(source.name, prompt.split(/\s+/).slice(0, 3).join(" ") || "My app", 40),
		tagline: text(source.tagline, "", 140),
		kind,
		layout,
		pages: coercePages(rawPages, layout),
		design: {
			mood: text(design.mood, "clean and confident", 80),
			mode,
			palette: coercePalette(design.palette, mode),
			fonts: { heading: pickFont(fonts.heading, FALLBACK_FONTS.heading), body: pickFont(fonts.body, FALLBACK_FONTS.body) },
			radius: radii.includes(design.radius as Radius) ? (design.radius as Radius) : "lg",
		},
		notes: text(source.notes, "", 1_200),
	}
}

/** Pulls the first JSON object out of an answer, tolerating fences and chatter around it. */
export function extractJson(answer: string): unknown {
	const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(answer)?.[1]
	const candidate = fenced ?? answer
	const start = candidate.indexOf("{")
	const end = candidate.lastIndexOf("}")
	if (start === -1 || end <= start) throw new Error("no JSON object in the answer")
	return JSON.parse(candidate.slice(start, end + 1))
}

// ── The call ────────────────────────────────────────────────────────────────

const PLANNER_PROMPT = `You are the product designer and architect behind an app builder. Turn the user's request into a build plan. You write no code.

Return ONLY one JSON object, no prose, in exactly this shape:
{
  "name": "short product name",
  "tagline": "one specific line about what it is",
  "kind": "website" | "app" | "game" | "tool",
  "layout": "site" | "bare",
  "pages": [
    { "name": "Home", "path": "/", "purpose": "what this page is for", "sections": ["...", "..."] }
  ],
  "design": {
    "mood": "3-6 words naming the visual direction",
    "mode": "light" | "dark",
    "palette": {
      "background": "#hex", "foreground": "#hex",
      "card": "#hex", "cardForeground": "#hex",
      "primary": "#hex", "primaryForeground": "#hex",
      "secondary": "#hex", "secondaryForeground": "#hex",
      "muted": "#hex", "mutedForeground": "#hex",
      "accent": "#hex", "accentForeground": "#hex",
      "border": "#hex", "ring": "#hex"
    },
    "fonts": { "heading": "font name", "body": "font name" },
    "radius": "none" | "sm" | "md" | "lg" | "xl"
  },
  "notes": "the data, state and interactions the pages share, in one paragraph"
}

Rules:
- layout "site" gives every page a header with navigation and a footer (websites, multi-page apps). "bare" gives the single page the whole screen with no chrome (games, single-screen tools).
- Use as few pages as the request needs, at most ${MAX_PAGES}. A game or a single tool is ONE page. A business or portfolio site is usually 3 to 5: Home plus what a visitor would look for. Never pad.
- sections: 3 to 7 per page, in order, naming the real content for THIS product ("Menu grid: espresso drinks with prices", not "Features section"). For a game or tool, list its screens and states instead ("Start screen with best score", "Playing: lanes, car, falling obstacles, score", "Game over with restart").
- notes: spell out the shared data model, game rules or tool logic precisely enough that someone could build each page without asking.
- design: commit to a direction that fits this subject and audience. The palette uses solid hex colours: foreground on background must reach 7:1 contrast, text on primary 4.5:1. border is a quiet line colour close to background.
- fonts: choose only from this list, exactly as written: ${Object.keys(FONTS).join(", ")}.`

/** Turns a request into a plan. Never throws: a failed or unreadable answer still yields a usable plan. */
export async function planApp(prompt: string): Promise<AppPlan> {
	const skill = await loadSkill("frontend-design")
	// Only the aesthetic half: the pipeline half is about files the planner never touches.
	const aesthetics = skill?.split("## Working inside this pipeline")[0]?.trim()
	const system = aesthetics ? `${PLANNER_PROMPT}\n\n--- DESIGN DIRECTION GUIDANCE ---\n\n${aesthetics}` : PLANNER_PROMPT

	for (let attempt = 1; attempt <= 2; attempt++) {
		try {
			const answer = await complete({ system, user: prompt, label: "plan", timeoutMs: 150_000 })
			return coercePlan(extractJson(answer), prompt)
		} catch (error) {
			jobLog(`  [ai] Plan attempt ${attempt} unusable: ${(error as Error).message.slice(0, 160)}`, "warn")
		}
	}
	jobLog("Planning failed twice; continuing with a single-page default plan", "warn")
	return coercePlan({}, prompt)
}
