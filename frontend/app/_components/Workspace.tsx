"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { annotate, type BuildKind, type Stage } from "../../lib/stages"
import type { LogLine } from "../../lib/useBuildLogs"
import { clockTime, formatElapsed, type BuildView } from "../../lib/builds"
import { CheckIcon, ChevronRight, CopyIcon, CrossIcon, ExternalIcon, RefreshIcon } from "./Icons"
import { PromptBox, type PromptBoxProps } from "./PromptBox"

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
					: /is live$|^Refunded \d+ token/.test(line.message) ? "good"
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
	/** Puts this build's prompt (or repo) back in the box, ready to send again. */
	onRetry: () => void
}

function Chat({ build, lines, connected, failure, billing, prompt, onRetry }: Omit<WorkspaceProps, "stages" | "running">) {
	const thread = useRef<HTMLDivElement>(null)
	const [pinned, setPinned] = useState(true)
	const steps = useMemo(() => stepsFrom(lines, build.kind), [lines, build.kind])
	const inFlight = build.state === "line" || build.state === "building"
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

				{steps.map((step, index) => (
					<div key={step.key} className="msg" data-tone={step.tone}>
						<p>{step.note}</p>
						<details className="msg-raw" open={inFlight && index === steps.length - 1}>
							<summary><ChevronRight className="msg-raw-chev" />{step.raw.length} log line{step.raw.length === 1 ? "" : "s"}</summary>
							{step.raw.map((line) => (
								<code key={line.key} className="raw" data-level={line.level}>{line.message}</code>
							))}
						</details>
					</div>
				))}

				{build.state === "live" && (
					<div className="msg" data-tone="good">
						<p><strong>Your site is live.</strong> Share the link with anyone.</p>
						<a className="msg-link" href={build.url} target="_blank" rel="noreferrer">{build.url} <ExternalIcon /></a>
					</div>
				)}
				{build.state === "failed" && (
					<div className="msg" data-tone="bad">
						<p><strong>This build didn&apos;t finish.</strong> {sentence(failure) || "It stopped before anything was published."}</p>
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

			<PromptBox {...prompt} size="compact" placeholder={prompt.mode === "prompt" ? "Describe another app…" : "Paste a GitHub repo URL…"} />
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

	useEffect(() => {
		if (tab === "log" && log.current) log.current.scrollTop = log.current.scrollHeight
	}, [tab, lines])

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(build.url)
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
				<div className="address" title={build.url}>
					<span className="address-dot" data-state={build.state} aria-hidden="true" />
					<span className="address-text">{build.url.replace(/^https?:\/\//, "")}</span>
				</div>
				<button type="button" className="icon-btn" aria-label={copied ? "Link copied" : "Copy link"} onClick={copy}>
					{copied ? <CheckIcon /> : <CopyIcon />}
				</button>
				<button type="button" className="icon-btn" aria-label="Reload preview" disabled={build.state !== "live"} onClick={() => setReloads((value) => value + 1)}>
					<RefreshIcon />
				</button>
				{build.state === "live" ? (
					<a className="icon-btn" href={build.url} target="_blank" rel="noreferrer" aria-label="Open site in a new tab"><ExternalIcon /></a>
				) : (
					<span className="icon-btn" aria-disabled="true" aria-label="Open site (available once live)"><ExternalIcon /></span>
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
						<h2>This build didn&apos;t finish</h2>
						<p>{sentence(failure) || "It stopped before anything was published."}</p>
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
							{aheadOf(build.position, running)} You can close this tab; the link works once it&apos;s live.
						</p>
					</div>
				) : (
					<div className="state">
						<span className="spinner" aria-hidden="true" />
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
	return (
		<main className="workspace" data-view={props.view}>
			<Chat {...props} />
			<Panel {...props} />
		</main>
	)
}
