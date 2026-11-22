import type { DeploymentStatus, LogLine } from "./useBuildLogs"

/**
 * Turns the raw build log into checkpoints a non-technical maker can follow.
 *
 * The worker logs in build-tool vocabulary ("Installing dependencies…",
 * "Build step failed - asking the AI to repair (2/6)"). Every pattern here
 * matches a message build-services actually emits, so the route on screen is
 * read off the real pipeline rather than a timer pretending to know.
 */

/** "pr": an AI change to a GitHub repository, opened as a pull request. */
export type BuildKind = "prompt" | "deploy" | "pr"
export type StageKey =
	| "received" | "line" | "setup" | "planning" | "writing" | "installing" | "building" | "publishing" | "live"
	| "reading" | "choosing" | "opening"
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
	live: "Live",
	reading: "Reading repo",
	choosing: "Choosing files",
	opening: "Opening PR"
}

/** Where a pull request's stop means something else than a site build's. */
const PR_LABELS: Partial<Record<StageKey, string>> = {
	writing: "Writing change",
	live: "Opened"
}

const labelOf = (kind: BuildKind, key: StageKey) => (kind === "pr" ? PR_LABELS[key] : undefined) ?? STAGE_LABELS[key]

/** First matching message moves the build to that stage. Order is the route's order. */
const STAGE_PATTERNS: Array<[StageKey, RegExp]> = [
	["setup", /^Starting (deploy|prompt) job|^Scaffolding a fresh|^Fetching repository files|^Restoring your app/],
	["planning", /^Planning your app|^Planned \d+ page/],
	["writing", /^Asking the AI to write|^Asking the AI to make your change|^Writing the .+ page|\[ai\] Iteration/],
	["installing", /^Installing dependencies|^Reinstalling dependencies|^Dependencies already match/],
	["building", /^Building project/],
	["publishing", /^Uploading \d+ build artifacts/],
	// Pull requests: build-services/lib/pr.ts.
	["reading", /^Reading the repository /],
	["choosing", /^Asking the AI which files/],
	["opening", /^Forking |^Committing \d+ files? to a new branch|^Opening the pull request/]
]

const REPAIR_PATTERN = /^Build step failed - asking the AI to repair \((\d+)\/(\d+)\)/

export const routeFor = (kind: BuildKind): StageKey[] =>
	kind === "prompt"
		? ["received", "line", "setup", "planning", "writing", "building", "publishing", "live"]
		: kind === "pr"
			? ["received", "line", "reading", "choosing", "writing", "opening", "live"]
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
	if (/^Starting (deploy|prompt|pr) job/.test(message)) return once("start", kind === "pr" ? "Started on your pull request." : "Your build has started.")
	if (kind === "pr") {
		const note = annotatePullRequest(message, once)
		if (note) return note
	}
	if (/^Scaffolding a fresh/.test(message)) return once("setup", "Setting up a blank React project for your app.")
	if (/^Fetching repository files/.test(message)) return once("setup", "Downloading your repository's files.")
	if (/^Planning your app/.test(message)) return once("planning", "Planning the pages and picking a design: colours, fonts and layout.")
	const planned = /^Planned (\d+) pages? \(([^)]*)\)/.exec(message)
	if (planned) return once("planned", `The plan is ready: ${planned[1]} page${planned[1] === "1" ? "" : "s"} (${planned[2]}), all sharing one design.`)
	if (/^Restoring your app/.test(message)) return once("setup", "Loading your app's current code.")
	if (/^Asking the AI to make your change/.test(message)) return once("writing", "The AI is reading your app and making the change.")
	const changed = /^Changed (\d+) files?: (.*)/.exec(message)
	if (changed) return once("changed", `Changed ${changed[1]} file${changed[1] === "1" ? "" : "s"}. Now rebuilding the site with them.`)
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
		: kind === "pr"
			? "This stopped before a pull request was opened."
			: "This repository could not be built. Nothing was published."
	return undefined
}

/** Notes for the messages only a pull request job logs (build-services/lib/pr.ts). */
function annotatePullRequest(message: string, once: (key: string, note: string) => string | undefined): string | undefined {
	if (/^Reading the repository /.test(message)) return once("reading", "Reading the repository on GitHub. Nothing is cloned: only the files the AI asks for are downloaded.")
	if (/^Asking the AI which files/.test(message)) return once("choosing", "The AI is looking through the file list and picking the files it needs to read.")
	const read = /^Read (\d+) files?:/.exec(message)
	if (read) return `Read ${read[1]} file${read[1] === "1" ? "" : "s"}.`
	if (/^Asking the AI to write the change/.test(message)) return once("writing", "The AI is writing the change. This is usually the longest step.")
	const prepared = /^Prepared (\d+) file changes?/.exec(message)
	if (prepared) return once("prepared", `The change is ready: ${prepared[1]} file${prepared[1] === "1" ? "" : "s"}.`)
	if (/^Forking /.test(message)) return once("fork", "You can't push to this repository, so rwaft is forking it to your GitHub account.")
	if (/^Committing \d+ files? to a new branch/.test(message)) return once("commit", "Committing the change to a new branch.")
	if (/^Opening the pull request/.test(message)) return once("opening", "Opening the pull request.")
	if (/^Opened pull request /.test(message)) return "Your pull request is open."
	return undefined
}

export interface Progress {
	stages: Stage[]
	repairs: number
}

/** The route before anything has been sent: every stop still ahead. */
export const emptyProgress = (kind: BuildKind): Progress => ({
	stages: routeFor(kind).map((key) => ({ key, label: labelOf(kind, key), state: "pending" })),
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
		const stage: Stage = { key, label: labelOf(kind, key), state: "pending" }
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
