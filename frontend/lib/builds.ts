import type { RecentBuild } from "./recentBuilds"
import type { DeploymentStatus } from "./useBuildLogs"
import type { LineEntry } from "./useLine"

/** The four columns a build can sit in, in pipeline order. */
export type BuildState = "line" | "building" | "live" | "failed"

export const STATE_ORDER: BuildState[] = ["line", "building", "live", "failed"]

export const STATE_LABEL: Record<BuildState, string> = {
	line: "In line",
	building: "Building",
	live: "Live",
	failed: "Failed",
}

export interface BuildView extends RecentBuild {
	state: BuildState
	position: number | null
}

/**
 * One answer to "where is this build", from the best evidence available: a
 * recorded outcome, then the live stream, then the queue poll. A build with no
 * evidence yet has only just been sent, so it is in line.
 */
export function viewOf(build: RecentBuild, streamStatus: DeploymentStatus | null, line: LineEntry | undefined): BuildView {
	const status = build.outcome ?? streamStatus ?? (line && line.status !== "unknown" ? line.status : null)
	const state: BuildState =
		status === "ready" ? "live"
		: status === "failed" ? "failed"
		: status === "building" ? "building"
		: "line"
	return { ...build, state, position: state === "line" ? line?.position ?? null : null }
}

export const relativeTime = (ts: number) => {
	const minutes = Math.round((Date.now() - ts) / 60_000)
	if (minutes < 1) return "just now"
	if (minutes < 60) return `${minutes}m ago`
	const hours = Math.round(minutes / 60)
	if (hours < 24) return `${hours}h ago`
	return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export const clockTime = (ts: number) =>
	new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })

export const formatElapsed = (ms: number) => {
	const seconds = Math.max(0, Math.floor(ms / 1_000))
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}
