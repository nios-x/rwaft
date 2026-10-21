import type { DeploymentStatus, LogLine } from "./useBuildLogs"

/**
 * Turns the raw build log into checkpoints a non-technical maker can follow.
 *
 * The worker logs in build-tool vocabulary ("Installing dependencies…",
 * "Build step failed - asking the AI to repair (2/6)"). Every pattern here
 * matches a message build-services actually emits, so the route on screen is
 * read off the real pipeline rather than a timer pretending to know.
 */

export type BuildKind = "prompt" | "deploy"
export type StageKey = "received" | "line" | "setup" | "planning" | "writing" | "installing" | "building" | "publishing" | "live"
export type StageState = "done" | "live" | "pending" | "failed"

export interface Stage {
	key: StageKey
	label: string
	state: StageState
	detail?: string
}

const STAGE_LABELS: Record<StageKey, string> = {
	received: "Received",
	line: "In line",
	setup: "Setting up",
	planning: "Designing",
	writing: "Writing pages",
	installing: "Installing",
	building: "Building",
	publishing: "Publishing",
	live: "Live"
}

/** First matching message moves the build to that stage. Order is the route's order. */
const STAGE_PATTERNS: Array<[StageKey, RegExp]> = [
	["setup", /^Starting (deploy|prompt) job|^Scaffolding a fresh|^Fetching repository files/],
	["planning", /^Planning your app|^Planned \d+ page/],
	["writing", /^Asking the AI to write|^Writing the .+ page|\[ai\] Iteration/],
	["installing", /^Installing dependencies|^Reinstalling dependencies|^Dependencies already match/],
	["building", /^Building project/],
	["publishing", /^Uploading \d+ build artifacts/]
]

const REPAIR_PATTERN = /^Build step failed - asking the AI to repair \((\d+)\/(\d+)\)/

export const routeFor = (kind: BuildKind): StageKey[] =>
	kind === "prompt"
		? ["received", "line", "setup", "planning", "writing", "building", "publishing", "live"]
		: ["received", "line", "setup", "installing", "building", "publishing", "live"]

/** Plain-words note for a log line, shown in the margin beside it. Only stage changes get one. */
export function annotate(message: string, kind: BuildKind, seen: Set<string>): string | undefined {
	const once = (key: string, note: string) => {
		if (seen.has(key)) return undefined
		seen.add(key)
		return note
	}
	const repair = REPAIR_PATTERN.exec(message)
	if (repair) return `The build hit an error. The AI is reading it and fixing the code (try ${repair[1]} of ${repair[2]}).`
	if (/^Another build is in progress/.test(message)) return once("wait", "Someone else's build is running. Yours starts the moment it finishes.")
	if (/^Starting (deploy|prompt) job/.test(message)) return once("start", "Your build has started.")
	if (/^Scaffolding a fresh/.test(message)) return once("setup", "Setting up a blank React project for your app.")
	if (/^Fetching repository files/.test(message)) return once("setup", "Downloading your repository's files.")
	if (/^Planning your app/.test(message)) return once("planning", "Planning the pages and picking a design: colours, fonts and layout.")
	const planned = /^Planned (\d+) pages? \(([^)]*)\)/.exec(message)
	if (planned) return once("planned", `The plan is ready: ${planned[1]} page${planned[1] === "1" ? "" : "s"} (${planned[2]}), all sharing one design.`)
	if (/^Asking the AI to write/.test(message)) return once("writing", "The AI is writing your app's code. This is usually the longest step.")
	const page = /^Writing the (.+) page/.exec(message)
	if (page) return once(`page:${page[1]}`, `Writing the ${page[1]} page.`)
	if (/^Build error in src\//.test(message) || /Asking the AI to fix this one file/.test(message)) {
		return "One file has a mistake. The AI is fixing just that file."
	}
	if (/^Installing dependencies|^Reinstalling dependencies/.test(message)) return once("installing", "Installing the open-source pieces your app is built from.")
	if (/^Building project/.test(message)) return once("building", "Turning the code into a website a browser can load.")
	if (/^Uploading \d+ build artifacts/.test(message)) return once("publishing", "Uploading the finished site.")
	if (/^Refunded \d+ (?:token|credit)/.test(message)) return "Your credits were refunded."
	if (/is live$/.test(message)) return "Your site is live."
	if (/^Deployment \w+ failed/.test(message)) return kind === "prompt"
		? "The build stopped before it finished. Nothing was published."
		: "This repository could not be built. Nothing was published."
	return undefined
}

export interface Progress {
	stages: Stage[]
	repairs: number
}

/** The route before anything has been sent: every stop still ahead. */
export const emptyProgress = (kind: BuildKind): Progress => ({
	stages: routeFor(kind).map((key) => ({ key, label: STAGE_LABELS[key], state: "pending" })),
	repairs: 0
})

export function deriveProgress(
	kind: BuildKind,
	lines: LogLine[],
	status: DeploymentStatus | null,
	position: number | null
): Progress {
	const route = routeFor(kind)
	let reached = route.indexOf("received")
	let repairs = 0

	for (const line of lines) {
		for (const [key, pattern] of STAGE_PATTERNS) {
			const index = route.indexOf(key)
			// Repairs loop back through install and build; the route never moves backwards.
			if (index > reached && pattern.test(line.message)) reached = index
		}
		if (REPAIR_PATTERN.test(line.message)) repairs++
	}

	// Any sign of work means the job left the line, even if the status event was missed.
	if (status === "building" || status === "ready" || status === "failed") reached = Math.max(reached, route.indexOf("line") + 1)
	if (status === "ready") reached = route.length - 1

	const stages = route.map((key, index): Stage => {
		const stage: Stage = { key, label: STAGE_LABELS[key], state: "pending" }
		if (status === "ready" || index < reached) stage.state = "done"
		else if (index === reached) stage.state = status === "failed" ? "failed" : "live"
		return stage
	})

	// "Received" is instant; the live marker belongs to the first stage still in progress.
	const received = stages[0]
	const line = stages[1]
	if (received && line && reached === 0 && status !== "failed") {
		received.state = "done"
		line.state = "live"
	}
	if (line && position) line.detail = `#${position}`
	const building = stages.find((stage) => stage.key === "building")
	if (building && repairs > 0) building.detail = `${repairs} fix${repairs === 1 ? "" : "es"}`

	return { stages, repairs }
}
