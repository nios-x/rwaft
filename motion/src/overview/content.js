import { B, T } from "./beatmap.js"

/**
 * Everything the overview's UI says. Chat replies are the plain-words notes
 * rwaft writes for each log line (frontend/lib/stages.ts, annotate()), log
 * lines are what build-services emits (jobLog) plus streamed npm, Vite and
 * tsc output, and the pricing is the API's defaults (frontend/lib/pricing.ts).
 * The site in the preview is a real rwaft deployment (sojjxnmx.rwaft.live); the prompt, change, second id, timings and counts are illustrative.
 */

export const PROMPT = "A portfolio for my design studio, KAIZEN"
export const CHANGE = "Add a section for our selected works."
export const REPO_URL = "https://github.com/nios-x/portfolio"
/** The real deployment shown in the preview: https://sojjxnmx.rwaft.live/ */
export const FIRST_ID = "sojjxnmx"
export const SECOND_ID = "p3w8dn2r"

export const EXAMPLES = [
	"A menu page for a small café",
	"A habit tracker with streaks",
	"An RSVP page for a party",
	"A portfolio for a photographer",
]

/** The first build's replies, one per plain-words step. `lines` is the "› N log lines" count. */
export const REPLIES = [
	{ at: B(12, 0.2), text: "Your build has started.", lines: 1 },
	{ at: B(13), text: "Setting up a blank React project for your app.", lines: 2 },
	{ at: B(14), text: "Planning the pages and picking a design: colours, fonts and layout.", lines: 1 },
	{ at: B(15), text: "The plan is ready: 4 pages (Home, Works, About, Contact), all sharing one design.", lines: 1 },
	{ at: B(16), text: "The AI is writing your app's code. This is usually the longest step.", lines: 6 },
	{ at: B(18, 0.5), text: "Turning the code into a website a browser can load.", lines: 5 },
	{ at: T.repair, text: "The build hit an error. The AI is reading it and fixing the code (try 1 of 6).", lines: 4, tone: "warn" },
	{ at: B(24), text: "Uploading the finished site.", lines: 2 },
]

/** The change: a follow-up message, its replies, and the new version going live. */
export const CHANGE_REPLIES = [
	{ at: T.changeSend + 0.25, text: "The AI is reading your app and making the change.", lines: 2 },
	{ at: T.changeSend + 0.5, text: "Changed 2 files. Now rebuilding the site with them.", lines: 1 },
]

/** The Log tab: HH:MM:SS plus the message, coloured by level. */
const at = (beat, frac = 0) => B(beat, frac)
export const LOG = [
	{ at: at(12, 0.2), ts: "14:32:07", msg: `Starting prompt job ${FIRST_ID}` },
	{ at: at(13), ts: "14:32:07", msg: "Scaffolding a fresh Vite + React + TypeScript project..." },
	{ at: at(13, 0.4), ts: "14:32:09", msg: "Dependencies installed", level: "success" },
	{ at: at(14), ts: "14:32:09", msg: "Planning your app: pages, colours and fonts…" },
	{ at: at(15), ts: "14:32:21", msg: "Planned 4 pages (Home, Works, About, Contact) · bold · Bricolage Grotesque + DM Sans" },
	{ at: at(16), ts: "14:32:21", msg: "Asking the AI to write your application..." },
	{ at: at(16, 0.4), ts: "14:32:22", msg: "  [ai] Iteration 1 — sending 4 messages" },
	{ at: at(17, 0.2), ts: "14:33:40", msg: "  [ai] tool_calls: 14" },
	{ at: at(17, 0.6), ts: "14:33:41", msg: "AI wrote 14 files across 4 pages" },
	{ at: at(18, 0.5), ts: "14:33:41", msg: "Building project..." },
	{ at: at(18, 0.9), ts: "14:33:42", msg: "vite v6.3.5 building for production...", level: "debug" },
	{ at: at(19, 0.4), ts: "14:33:44", msg: "src/pages/Works.tsx(42,7): error TS2304: Cannot find name 'caseStudies'.", level: "error" },
	{ at: at(20, 0.2), ts: "14:33:44", msg: "Build step failed - asking the AI to repair (1/6)", level: "warn" },
	{ at: at(21, 0.6), ts: "14:33:58", msg: "Applied 2 repair operations" },
	{ at: at(22, 0.2), ts: "14:33:58", msg: "Building project..." },
	{ at: at(22, 0.9), ts: "14:34:01", msg: "✓ built in 2.91s", level: "debug" },
	{ at: T.built, ts: "14:34:01", msg: "Build succeeded", level: "success" },
	{ at: at(24), ts: "14:34:01", msg: "Uploading 7 build artifacts..." },
	{ at: at(24, 0.4), ts: "14:34:02", msg: "Uploaded 7 artifacts", level: "success" },
	{ at: T.live, ts: "14:34:02", msg: `Deployment ${FIRST_ID} is live`, level: "success" },
]

/** The prompt route from lib/stages.ts, with when each stop goes live. */
export const STAGES = [
	{ label: "Received", live: 0 },
	{ label: "In line", live: B(11, 0.5) },
	{ label: "Setting up", live: B(12, 0.2) },
	{ label: "Designing", live: B(14) },
	{ label: "Writing pages", live: B(16) },
	{ label: "Building", live: B(18, 0.5) },
	{ label: "Publishing", live: B(24) },
	{ label: "Live", live: T.live },
]

/** Build seconds against film time, for the elapsed timer. */
export const ELAPSED = [[T.build, 0], [B(14), 2], [B(16), 14], [B(18, 0.5), 94], [T.repair, 97], [T.built, 114], [T.live, 115]]

/** The pricing page as the API's defaults configure it. */
export const PLANS = [
	{ name: "Free", price: "$0", detail: "<strong>2 credits</strong> when you sign up with Google: 2 chats" },
	{ name: "Starter", price: "$5", detail: "<strong>50 credits</strong>: about 50 chats, $0.10 each" },
	{ name: "Builder", price: "$12", detail: "<strong>150 credits</strong>: about 150 chats, $0.08 each" },
	{ name: "Studio", price: "$28", detail: "<strong>400 credits</strong>: about 400 chats, $0.07 each" },
]

export const STEPS = [
	{ title: "Describe it", body: "Say what you want in plain words: what it is, who it's for and what it should do. Or paste a public GitHub repository." },
	{ title: "Watch it build", body: "rwaft's AI plans the pages, writes a React app, installs it and builds it. You see every step as it happens, including the fixes it makes when a build breaks." },
	{ title: "Share the link", body: "Your site goes live at its own URL. Try it in the preview, then send the link to anyone." },
]
