"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { PR_DONE, annotate, checksFrom, type BuildKind, type Stage } from "../../lib/stages"
import type { LogLine } from "../../lib/useBuildLogs"
import { clockTime, formatElapsed, type BuildView } from "../../lib/builds"
import { BACKEND_URL, readApiJson } from "../../lib/config"
import { setRecentBuildPr, type PullRequestInfo } from "../../lib/recentBuilds"
import { CheckIcon, ChevronRight, CopyIcon, CrossIcon, ExternalIcon, PullRequestIcon, RefreshIcon } from "./Icons"
import { PromptBox, type PromptBoxProps } from "./PromptBox"
import { GitHubExport } from "./GitHubExport"

interface Step {
	key: string
	note: string
	ts: number
	tone: "info" | "warn" | "bad" | "good"
	raw: LogLine[]
}

/** One reply per plain-words step, carrying the raw lines that belong to it. */
function stepsFrom(lines: LogLine[], kind: BuildKind): Step[] {
	const seen = new Set<string>()
	const steps: Step[] = []
	for (const line of lines) {
		const note = annotate(line.message, kind, seen)
		const current = steps.at(-1)
		if (note || !current) {
			steps.push({
				key: line.key,
				note: note ?? "Getting started.",
				ts: line.ts,
				// A refund is good news even though the worker logs it as a warning.
				tone: line.level === "error" ? "bad"
					: /is live$|^Refunded \d+ token|^Opened pull request |^Added your change to pull request |^All \d+ checks? passed/.test(line.message) ? "good"
					: line.level === "warn" ? "warn" : "info",
				raw: [line],
			})
		} else {
			current.raw.push(line)
		}
	}
	return steps
}

/**
 * What stands between this build and its turn. `position` is 1-based among
 * waiting builds, so everything running plus everyone waiting in front counts.
 */
function aheadOf(position: number | null, running: number): string {
	const waiting = Math.max(0, (position ?? 1) - 1)
	const ahead = running + waiting
	if (ahead === 0) return "Starting in a moment."
	const parts = [running > 0 && `${running} building`, waiting > 0 && `${waiting} waiting`].filter(Boolean).join(", ")
	return `${ahead} build${ahead === 1 ? " is" : "s are"} ahead of you (${parts}). Yours starts automatically.`
}

/**
 * The green tick beside "Your site is live" (an IconScout Lottie, converted to
 * an animated WebP so no Lottie player ships). It draws itself once, then the
 * still takes over: an animated WebP loops forever, and a tick that keeps
 * redrawing reads as something still happening.
 */
const LIVE_CHECK_MS = 1_100

function LiveCheck() {
	const [settled, setSettled] = useState(false)
	useEffect(() => {
		const timer = setTimeout(() => setSettled(true), LIVE_CHECK_MS)
		return () => clearTimeout(timer)
	}, [])
	const still = "/animations/live-check-still.png"
	return (
		<picture className="live-check">
			<source media="(prefers-reduced-motion: reduce)" srcSet={still} />
			{/* A plain img: next/image would re-encode the animation, and this one is decorative. */}
			<img src={settled ? still : "/animations/live-check.webp"} alt="" width={28} height={28} />
		</picture>
	)
}

/**
 * What a finished pull request job opened. Asked for once and kept with the
 * build, because the API forgets it after a day.
 */
function usePullRequestResult(build: BuildView, headers: () => Record<string, string>) {
	const headersRef = useRef(headers)
	useEffect(() => { headersRef.current = headers })
	const wanted = build.kind === "pr" && build.state === "live" && !build.pr
	useEffect(() => {
		if (!wanted) return
		let cancelled = false
		void (async () => {
			// The job's status can land a moment before the worker's result write.
			for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
				try {
					const response = await fetch(`${BACKEND_URL}/github/pr-result/${build.id}`, { headers: headersRef.current() })
					const data = await readApiJson<{ available?: boolean; url?: string; title?: string; number?: number | null; files?: string[]; fork?: boolean }>(response)
					if (data.available && data.url) {
						setRecentBuildPr(build.id, { url: data.url, title: data.title ?? "", number: data.number ?? null, files: data.files ?? [], fork: Boolean(data.fork) })
						return
					}
				} catch { /* tried again below */ }
				await new Promise((resolve) => setTimeout(resolve, 1_500))
			}
		})()
		return () => { cancelled = true }
	}, [wanted, build.id])
}

const prLabel = (build: BuildView, pr: PullRequestInfo) => `${build.repo ?? "pull request"}${pr.number ? ` #${pr.number}` : ""}`

/** Where the pull request's CI watch stands, read off its log. */
function ChecksLine({ lines }: { lines: LogLine[] }) {
	const checks = useMemo(() => checksFrom(lines), [lines])
	if (!checks) return null
	const busy = checks.state === "watching" || checks.state === "fixing"
	return (
		<p className="pr-checks" data-state={checks.state}>
			{busy ? <span className="gh-spinner" aria-hidden="true" /> : <span className="pr-checks-dot" aria-hidden="true" />}
			{checks.text}
		</p>
	)
}

/** The files a pull request changed, the first few by name. */
function ChangedFiles({ files }: { files: string[] }) {
	if (files.length === 0) return null
	const shown = files.slice(0, 8)
	return (
		<ul className="pr-files" aria-label="Files changed">
			{shown.map((file) => <li key={file}><code>{file}</code></li>)}
			{files.length > shown.length && <li className="pr-files-more">and {files.length - shown.length} more</li>}
		</ul>
	)
}

/** Worker errors arrive without a full stop; prose around them needs one. */
const sentence = (text: string | null) => (text && !/[.!?]$/.test(text.trim()) ? `${text.trim()}.` : text)

/** Elapsed time that keeps counting while the build is in flight. */
function useNow(running: boolean): number {
	const [now, setNow] = useState(() => Date.now())
	useEffect(() => {
		if (!running) return
		const timer = setInterval(() => setNow(Date.now()), 1_000)
		return () => clearInterval(timer)
	}, [running])
	return now
}

interface WorkspaceProps {
	build: BuildView
	lines: LogLine[]
	stages: Stage[]
	connected: boolean
	running: number
	failure: string | null
	billing: boolean
	prompt: PromptBoxProps
	/** The chat box sends a change to this app rather than starting a new one. */
	editing: boolean
	/** Opens another build's workspace, e.g. the version a change was made to. */
	onOpen: (id: string) => void
	/** Puts this build's prompt (or repo) back in the box, ready to send again. */
	onRetry: () => void
	/** Offer "Push to GitHub" on finished prompt builds; the API has a GitHub app. */
	githubExport: boolean
	requestHeaders: () => Record<string, string>
}

function Chat({ build, lines, connected, failure, billing, prompt, editing, onOpen, onRetry, githubExport, requestHeaders }: Omit<WorkspaceProps, "stages" | "running">) {
	const thread = useRef<HTMLDivElement>(null)
	const [pinned, setPinned] = useState(true)
	const steps = useMemo(() => stepsFrom(lines, build.kind), [lines, build.kind])
	const inFlight = build.state === "line" || build.state === "building"
	// A pull request's result goes where the job ended; the CI watch's replies follow it.
	const doneAt = build.kind === "pr" && build.state === "live" ? steps.findIndex((step) => step.raw.some((line) => PR_DONE.test(line.message))) : -1
	const before = doneAt >= 0 ? steps.slice(0, doneAt + 1) : steps
	const after = doneAt >= 0 ? steps.slice(doneAt + 1) : []
	const renderStep = (step: Step, index: number, list: Step[]) => (
		<div key={step.key} className="msg" data-tone={step.tone}>
			<p>{step.note}</p>
			<details className="msg-raw" open={inFlight && index === list.length - 1}>
				<summary><ChevronRight className="msg-raw-chev" />{step.raw.length} log line{step.raw.length === 1 ? "" : "s"}</summary>
				{step.raw.map((line) => (
					<code key={line.key} className="raw" data-level={line.level}>{line.message}</code>
				))}
			</details>
		</div>
	)
	const refunded = lines.some((line) => /^Refunded \d+ (?:token|credit)/.test(line.message))

	// Follow new replies while the reader is at the bottom.
	useEffect(() => {
		if (pinned && thread.current) thread.current.scrollTop = thread.current.scrollHeight
	}, [steps, pinned, build.id])

	return (
		<section className="chat" aria-label="Build conversation">
			<div
				className="thread"
				ref={thread}
				onScroll={() => {
					const node = thread.current
					if (node) setPinned(node.scrollHeight - node.scrollTop - node.clientHeight < 40)
				}}
				role="log"
				aria-live="polite"
			>
				<div className="msg msg--you">
					{build.parentId && <span className="msg-kicker">Change</span>}
					{build.kind === "pr" && <span className="msg-kicker">Pull request on {build.repo ?? build.url}</span>}
					<p>{build.source || (build.kind === "prompt" ? "Build me an app." : build.url)}</p>
					<span className="msg-time">{clockTime(build.at)}</span>
				</div>

				{build.state === "line" && steps.length === 0 && (
					<div className="msg">
						<p>
							{build.position
								? `You're #${build.position} in line. Your build starts as soon as the ones ahead of it finish.`
								: "Got it. Waiting for a free builder…"}
						</p>
					</div>
				)}

				{before.map((step, index) => renderStep(step, index, before))}

				{build.state === "live" && build.kind === "pr" && (
					<div className="msg" data-tone="good">
						<p className="msg-live">
							<LiveCheck key={build.id} />
							{build.parentId ? (
								<span><strong>Your change is on the pull request.</strong> rwaft added a commit to its branch and commented on what changed.</span>
							) : (
								<span><strong>Your pull request is open.</strong> {build.pr?.fork ? "It comes from your fork, since you can't push to this repository." : "It's on a new branch, ready for review."}</span>
							)}
						</p>
						{build.pr ? (
							<>
								<a className="msg-link" href={build.pr.url} target="_blank" rel="noreferrer">{build.pr.title || prLabel(build, build.pr)} <ExternalIcon /></a>
								<ChangedFiles files={build.pr.files} />
							</>
						) : (
							<a className="msg-link" href={`${build.url.replace(/\/+$/, "")}/pulls`} target="_blank" rel="noreferrer">Open the repository&apos;s pull requests <ExternalIcon /></a>
						)}
						<ChecksLine lines={lines} />
						<p className="gh-note">rwaft changed these files through GitHub without cloning the repository, so nothing was built here. Review it, and let CI run before merging.</p>
						{editing && <p>Want more? Describe another change below and rwaft adds it to this pull request.</p>}
					</div>
				)}
				{after.map((step, index) => renderStep(step, index, after))}
				{build.state === "live" && build.kind !== "pr" && (
					<div className="msg" data-tone="good">
						<p className="msg-live"><LiveCheck key={build.id} /><span><strong>Your site is live.</strong> Share the link with anyone.</span></p>
						<a className="msg-link" href={build.url} target="_blank" rel="noreferrer">{build.url} <ExternalIcon /></a>
						{editing && <p>Want something different? Describe a change below and rwaft updates this app. This version stays live at its own link.</p>}
						{build.parentId && (
							<button type="button" className="text-btn msg-action" onClick={() => onOpen(build.parentId!)}>Open the version before this change</button>
						)}
						{githubExport && build.kind === "prompt" && (
							<GitHubExport key={build.id} build={build} headers={requestHeaders} />
						)}
					</div>
				)}
				{build.state === "failed" && (
					<div className="msg" data-tone="bad">
						<p><strong>{build.kind === "pr" ? "No pull request was opened." : "This build didn't finish."}</strong> {sentence(failure) || (build.kind === "pr" ? "It stopped before anything reached GitHub." : "It stopped before anything was published.")}</p>
						{billing && build.charged > 0 && !refunded && <p>Your credits will be refunded.</p>}
						<button type="button" className="text-btn msg-action" onClick={onRetry}>Try again</button>
					</div>
				)}

				{inFlight && (
					<p className="thread-status" data-live={connected}>
						<span className="typing" aria-hidden="true"><i /><i /><i /></span>
						{connected ? "rwaft is working" : "Reconnecting to the build…"}
					</p>
				)}
			</div>

			<PromptBox
				{...prompt}
				size="compact"
				placeholder={editing
					? build.kind === "pr" ? "Describe another change to this pull request…" : "Describe a change to this app…"
					: prompt.mode === "prompt" ? "Describe another app…" : prompt.mode === "pr" ? "Describe a change to make in this repository…" : "Paste a GitHub repo URL…"}
			/>
		</section>
	)
}

function Panel({ build, lines, stages, running, failure, onRetry }: Pick<WorkspaceProps, "build" | "lines" | "stages" | "running" | "failure" | "onRetry">) {
	const [tab, setTab] = useState<"preview" | "log">("preview")
	const [reloads, setReloads] = useState(0)
	const [copied, setCopied] = useState(false)
	const inFlight = build.state === "line" || build.state === "building"
	const now = useNow(inFlight)
	const elapsed = (inFlight ? now : lines.at(-1)?.ts ?? build.at) - build.at
	const current = stages.find((stage) => stage.state === "live" || stage.state === "failed")
	const log = useRef<HTMLDivElement>(null)
	// A pull request has no site to preview: the panel points at GitHub instead.
	const isPr = build.kind === "pr"
	const link = isPr ? build.pr?.url ?? build.url : build.url

	useEffect(() => {
		if (tab === "log" && log.current) log.current.scrollTop = log.current.scrollHeight
	}, [tab, lines])

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(link)
			setCopied(true)
			setTimeout(() => setCopied(false), 1_600)
		} catch { /* clipboard blocked; the address is selectable */ }
	}

	return (
		<section className="panel" aria-label="Preview">
			<div className="panel-bar">
				<div className="tabs" role="tablist" aria-label="View">
					<button type="button" role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")}>Preview</button>
					<button type="button" role="tab" aria-selected={tab === "log"} onClick={() => setTab("log")}>
						Log{lines.length > 0 && <span className="tab-count">{lines.length}</span>}
					</button>
				</div>
				<div className="address" title={link}>
					<span className="address-dot" data-state={build.state} aria-hidden="true" />
					<span className="address-text">{link.replace(/^https?:\/\//, "")}</span>
				</div>
				<button type="button" className="icon-btn" aria-label={copied ? "Link copied" : "Copy link"} onClick={copy}>
					{copied ? <CheckIcon /> : <CopyIcon />}
				</button>
				{!isPr && (
					<button type="button" className="icon-btn" aria-label="Reload preview" disabled={build.state !== "live"} onClick={() => setReloads((value) => value + 1)}>
						<RefreshIcon />
					</button>
				)}
				{build.state === "live" ? (
					<a className="icon-btn" href={link} target="_blank" rel="noreferrer" aria-label={isPr ? "Open on GitHub" : "Open site in a new tab"}><ExternalIcon /></a>
				) : (
					<span className="icon-btn" aria-disabled="true" aria-label={isPr ? "Open on GitHub (available once opened)" : "Open site (available once live)"}><ExternalIcon /></span>
				)}
			</div>

			<div className="panel-body">
				{tab === "log" ? (
					<div className="log" ref={log} role="log">
						{lines.length === 0 ? (
							<p className="log-empty">No output yet. It appears here the moment a builder picks this up.</p>
						) : lines.map((line) => (
							<p key={line.key} className="raw" data-level={line.level}>
								<span className="raw-time">{new Date(line.ts).toLocaleTimeString(undefined, { hour12: false })}</span>
								<span>{line.message}</span>
							</p>
						))}
					</div>
				) : build.state === "live" && isPr ? (
					<div className="state">
						<span className="state-icon state-icon--good"><PullRequestIcon /></span>
						<h2>{build.pr?.title || (build.parentId ? "Change added" : "Pull request opened")}</h2>
						{build.pr && <p>{prLabel(build, build.pr)}{build.pr.fork ? ", from your fork" : ""}{build.parentId ? ": one more commit" : ""}</p>}
						{build.pr && <ChangedFiles files={build.pr.files} />}
						<ChecksLine lines={lines} />
						<div className="state-actions">
							<a className="pill-btn pill-btn--ink" href={build.pr?.url ?? `${build.url.replace(/\/+$/, "")}/pulls`} target="_blank" rel="noreferrer">
								{build.pr ? "Review it on GitHub" : "Open the repository's pull requests"}
							</a>
						</div>
					</div>
				) : build.state === "live" ? (
					<iframe
						key={`${build.id}-${reloads}`}
						className="frame"
						src={build.url}
						title="Live preview"
						sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
					/>
				) : build.state === "failed" ? (
					<div className="state">
						<span className="state-icon state-icon--bad"><CrossIcon /></span>
						<h2>{isPr ? "No pull request was opened" : "This build didn't finish"}</h2>
						<p>{sentence(failure) || (isPr ? "It stopped before anything reached GitHub." : "It stopped before anything was published.")}</p>
						<div className="state-actions">
							<button type="button" className="pill-btn pill-btn--ink" onClick={onRetry}>Try again</button>
							<button type="button" className="text-btn" onClick={() => setTab("log")}>See where it stopped</button>
						</div>
					</div>
				) : build.state === "line" ? (
					<div className="state">
						<p className="state-big">#{build.position ?? "…"}</p>
						<h2>in line</h2>
						<p>
							{aheadOf(build.position, running)} {isPr ? "You can close this tab; the pull request opens on GitHub either way." : "You can close this tab; the link works once it's live."}
						</p>
					</div>
				) : (
					<div className="state">
						<span className="build-anim" aria-hidden="true" />
						<h2>{current?.label ?? "Building"}{current?.detail ? ` · ${current.detail}` : ""}</h2>
						<p className="state-time">{formatElapsed(elapsed)}</p>
						<ol className="steps" aria-label="Build progress">
							{stages.map((stage) => (
								<li key={stage.key} data-state={stage.state}>
									<span className="steps-dot" aria-hidden="true">{stage.state === "done" && <CheckIcon />}</span>
									{stage.label}
								</li>
							))}
						</ol>
					</div>
				)}
			</div>
		</section>
	)
}

export function Workspace(props: WorkspaceProps & { view: "chat" | "preview" }) {
	usePullRequestResult(props.build, props.requestHeaders)
	return (
		<main className="workspace" data-view={props.view}>
			<Chat {...props} />
			<Panel {...props} />
		</main>
	)
}
