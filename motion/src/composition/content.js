import { B, T } from "./beatmap.js"

/**
 * Everything the film says. Messages are the ones build-services emits
 * (jobLog) plus the npm and Vite output it streams verbatim; the repository,
 * deployment id and numbers are illustrative.
 */

export const REPO = { host: "github.com/", owner: "nios-x/", name: "tiny-habits" }
export const DEPLOY_ID = "k7m2x9qa"
export const LIVE_HOST = `${DEPLOY_ID}.rwaft.live`

/** 14:32:07, the wall-clock time the job starts. */
export const CLOCK_BASE = 14 * 3600 + 32 * 60 + 7

/** `tick: true` lines start with Vite's ✓, drawn as rwaft's check icon. */
export const LOG = [
	{ at: B(10), s: 0, msg: `Starting deploy job ${DEPLOY_ID}` },
	{ at: B(10, 0.5), s: 0, msg: "Fetching repository files..." },
	{ at: B(11), s: 1, msg: "Fetched 48 source files", level: "success" },
	{ at: B(11, 0.5), s: 1, msg: "Installing dependencies…" },
	{ at: B(13), s: 18, msg: "added 214 packages in 17s" },
	{ at: B(14), s: 18, msg: "Dependencies installed", level: "success" },
	{ at: B(15), s: 18, msg: "Building project..." },
	{ at: B(15, 0.5), s: 19, msg: "vite v6.3.5 building for production..." },
	{ at: B(17), s: 22, msg: "1284 modules transformed.", tick: true },
	{ at: B(17, 0.5), s: 22, msg: "dist/assets/index-Cq3vT9.js  148.21 kB │ gzip: 47.63 kB", level: "debug" },
	{ at: B(18), s: 22, msg: "built in 3.42s", tick: true },
	{ at: B(19), s: 22, msg: "Build succeeded", level: "success" },
	{ at: B(19, 0.5), s: 23, msg: "Uploading 9 build artifacts..." },
	{ at: B(20), s: 24, msg: "Uploaded 9 artifacts", level: "success" },
	{ at: B(20, 0.5), s: 24, msg: `Deployment ${DEPLOY_ID} is live`, level: "success" },
]

/** The deploy route from lib/stages.ts, minus the instant "Received" and the skipped "In line". */
export const STAGES = [
	{ label: "Setting up", live: B(10, 0.1), done: T.fetched },
	{ label: "Installing", live: T.fetched, done: T.installed },
	{ label: "Building", live: T.installed, done: T.built },
	{ label: "Publishing", live: T.built, done: T.live },
]

/**
 * Timeline fill, in stages (0..4), against film time. It moves in bursts the
 * way a real install does rather than at a constant rate.
 */
export const FILL = [
	[B(10), 0], [B(10, 0.3), 0.15], [T.fetched, 1],
	[B(11, 0.6), 1.22], [B(12, 0.3), 1.4], [B(13), 1.62], [B(13, 0.5), 1.86], [T.installed, 2],
	[B(15), 2.22], [B(16), 2.46], [B(17), 2.7], [B(18), 2.9], [T.built, 3],
	[B(19, 0.5), 3.5], [T.live, 4],
]

/** Build seconds against film time, for the elapsed timer; matches the log's timestamps. */
export const ELAPSED = [
	[B(10), 0], [T.fetched, 1], [B(11, 0.5), 1.4], [T.added, 18], [B(15, 0.5), 19],
	[T.modules, 22], [T.built, 22.6], [B(19, 0.5), 23], [T.live, 24],
]

export const TOOLTIP = { title: "Installing", value: "17.2s", detail: "214 packages added" }

/** "Your builds", newest first, as Home.tsx renders them. */
export const BUILDS = [
	{ title: "nios-x/tiny-habits", kind: "Repo", when: "just now", icon: "github" },
	{ title: "A menu page for a small café", kind: "Prompt", when: "2h ago", icon: "spark" },
	{ title: "nios-x/portfolio", kind: "Repo", when: "Oct 20", icon: "github" },
]
