"use client"

import { useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import { BACKEND_URL, MISSING_BACKEND_MESSAGE, isBackendConfigured } from "../lib/config"
import { useUserId } from "../lib/useUserId"
import { useBuildLogs } from "../lib/useBuildLogs"

type DeployMode = "github" | "prompt"

const icon = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
}

const SparkIcon = () => (
  <svg {...icon}>
    <path d="M8 2.5 9.3 6.2 13 7.5l-3.7 1.3L8 12.5 6.7 8.8 3 7.5l3.7-1.3L8 2.5Z" />
  </svg>
)
const RepoIcon = () => (
  <svg {...icon}>
    <path d="M3.75 2.75h7.5a1 1 0 0 1 1 1v9.5h-7a1.5 1.5 0 0 1-1.5-1.5v-9Z" />
    <path d="M5.25 10.75h7" />
  </svg>
)
const PlusIcon = () => (
  <svg {...icon}>
    <path d="M8 3.5v9M3.5 8h9" />
  </svg>
)
const TerminalIcon = () => (
  <svg {...icon}>
    <rect x="2.25" y="3.25" width="11.5" height="9.5" rx="1.75" />
    <path d="M5 6.75 6.75 8.5 5 10.25M8.75 10.25h2.5" />
  </svg>
)
const ExternalIcon = () => (
  <svg {...icon}>
    <path d="M6.5 3.5H12v5.5" />
    <path d="M12 3.5 4 11.5" />
  </svg>
)
const SendIcon = () => (
  <svg {...icon} strokeWidth={1.8}>
    <path d="M8 12.5v-9" />
    <path d="M4.5 7 8 3.5 11.5 7" />
  </svg>
)
const CloseIcon = () => (
  <svg {...icon}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
)
const ChevronIcon = () => (
  <svg {...icon} className="chev">
    <path d="M4.5 6.5 8 10l3.5-3.5" />
  </svg>
)
const ArrowIcon = () => (
  <svg {...icon}>
    <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
  </svg>
)
const DownIcon = () => (
  <svg {...icon}>
    <path d="M8 3.5v9M4.5 9 8 12.5 11.5 9" />
  </svg>
)
/**
 * The mark: three log lines resolving into one live endpoint.
 *
 * The product's whole argument is that you watch the real pipeline and get a
 * URL out of it, so the mark draws that rather than stamping a letter into a
 * gradient tile. The accent dot is the only place the canvas gradient appears
 * at this size, which keeps the mark legible at 16px where a full gradient
 * fill turns to mud.
 */
const Logo = () => (
  <svg className="rail-mark" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="rw-accent" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#3b82f6" />
        <stop offset="55%" stopColor="#8b5cf6" />
        <stop offset="100%" stopColor="#f97316" />
      </linearGradient>
      <linearGradient id="rw-edge" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.24" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0.06" />
      </linearGradient>
    </defs>
    <rect
      x="0.7"
      y="0.7"
      width="26.6"
      height="26.6"
      rx="8.2"
      fill="#141418"
      stroke="url(#rw-edge)"
      strokeWidth="1.4"
    />
    <g stroke="#f4f4f5" strokeWidth="2.1" strokeLinecap="round">
      <path d="M6.6 9.6h6.4" />
      <path d="M6.6 14h8.9" />
      <path d="M6.6 18.4h5.4" />
    </g>
    <circle cx="19.7" cy="14" r="2.5" fill="url(#rw-accent)" />
  </svg>
)

const ExpandIcon = () => (
  <svg {...icon}>
    <path d="M6.25 2.75H2.75v3.5M9.75 2.75h3.5v3.5M6.25 13.25H2.75v-3.5M9.75 13.25h3.5v-3.5" />
  </svg>
)
const CollapseIcon = () => (
  <svg {...icon}>
    <path d="M2.75 6.25h3.5v-3.5M13.25 6.25h-3.5v-3.5M2.75 9.75h3.5v3.5M13.25 9.75h-3.5v3.5" />
  </svg>
)
const BoxIcon = () => (
  <svg {...icon}>
    <path d="M8 2.5 13.25 5.5v5L8 13.5 2.75 10.5v-5L8 2.5Z" />
    <path d="M2.75 5.5 8 8.5l5.25-3M8 8.5v5" />
  </svg>
)

export default function Home() {
  const [mode, setMode] = useState<DeployMode>("prompt")
  const [logFullscreen, setLogFullscreen] = useState(false)
  const [repositoryUrl, setRepositoryUrl] = useState("")
  const [promptText, setPromptText] = useState("")
  const [deploymentUrl, setDeploymentUrl] = useState("")
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const userId = useUserId()
  const { lines, connected, status, deployedUrl, failure, clear } = useBuildLogs(userId)

  const consoleRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const [pinned, setPinned] = useState(true)

  const isBuilding = status === "queued" || status === "building"
  const liveUrl = deployedUrl || deploymentUrl

  // Session run history — real data, so the sidebar list is not decoration.
  const [runs, setRuns] = useState<Array<{ id: number; outcome: "ready" | "failed"; at: string }>>([])
  const lastStatus = useRef<string | null>(null)

  useEffect(() => {
    if (status === lastStatus.current) return
    if (status === "ready" || status === "failed") {
      setRuns((previous) =>
        [{ id: Date.now(), outcome: status, at: new Date().toLocaleTimeString() }, ...previous].slice(0, 8),
      )
    }
    lastStatus.current = status
  }, [status])

  // Fullscreen log: Escape closes it and the page behind it stops scrolling,
  // so the wheel belongs to the log rather than the canvas underneath.
  useEffect(() => {
    if (!logFullscreen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLogFullscreen(false)
    }
    document.addEventListener("keydown", onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [logFullscreen])

  // Follow the tail while the reader is at the bottom, but stop fighting them
  // the moment they scroll up to read something.
  useEffect(() => {
    if (!pinned) return
    const node = consoleRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [lines, pinned])

  const handleConsoleScroll = () => {
    const node = consoleRef.current
    if (!node) return
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight
    setPinned(distanceFromBottom < 40)
  }

  const handleDeploy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setDeploymentUrl("")

    if (!isBackendConfigured) {
      setError(MISSING_BACKEND_MESSAGE)
      return
    }
    if (!userId) {
      setError("Still setting up your session - try again in a moment.")
      return
    }

    setIsSubmitting(true)
    // Start each run from an empty console so the previous build's output
    // cannot be mistaken for this one's.
    clear()

    try {
      const endpoint = mode === "github" ? `${BACKEND_URL}/deploy` : `${BACKEND_URL}/prompt`
      const payload = mode === "github"
        ? { url: repositoryUrl.trim(), userId }
        : { prompt: promptText.trim(), userId }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": userId },
        body: JSON.stringify(payload),
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message || result.status || "Deployment failed")
      }

      setDeploymentUrl(result.url)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Deployment failed")
    } finally {
      setIsSubmitting(false)
    }
  }

  const switchMode = (next: DeployMode) => {
    setMode(next)
    setError("")
    setDeploymentUrl("")
  }

  const focusComposer = () => {
    inputRef.current?.focus()
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const canSubmit = !isSubmitting && (mode === "github" ? repositoryUrl.trim() : promptText.trim())

  return (
    <div className="shell">
      <aside className="rail">
        <a className="rail-brand" href="/">
          <Logo />
          <span className="rail-brand-text">rwaft</span>
        </a>

        <button type="button" className="rail-select" onClick={focusComposer}>
          <BoxIcon />
          Deploy console
          <ChevronIcon />
        </button>

        <nav className="rail-group" aria-label="Primary">
          <button
            type="button"
            className="rail-item"
            aria-current={!logFullscreen ? "true" : undefined}
            onClick={() => {
              setLogFullscreen(false)
              focusComposer()
            }}
          >
            <PlusIcon />
            New build
          </button>
          <button
            type="button"
            className="rail-item"
            aria-current={logFullscreen ? "true" : undefined}
            aria-expanded={logFullscreen}
            onClick={() => setLogFullscreen(true)}
          >
            <TerminalIcon />
            Build log
          </button>
          <a
            className="rail-item"
            href="https://github.com/nios-x/rwaft"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalIcon />
            Source
          </a>
        </nav>

        <div className="rail-group">
          <p className="rail-heading">This session</p>
          {runs.length === 0 ? (
            <p className="rail-empty">No builds yet</p>
          ) : (
            runs.map((run) => (
              <span key={run.id} className="rail-run">
                <span className="rail-run-dot" data-outcome={run.outcome} aria-hidden="true" />
                {run.outcome === "ready" ? "Deployed" : "Failed"}
                <span style={{ marginLeft: "auto", color: "var(--fg-dim)", fontSize: 11.5 }}>
                  {run.at}
                </span>
              </span>
            ))
          )}
        </div>

        <div className="rail-foot">
          <p className="rail-empty">Vite &amp; CRA · React</p>
        </div>
      </aside>

      <main className="canvas">
        <div className="hero">
          <button type="button" className="hero-pill" onClick={() => setLogFullscreen(true)}>
            <span className="hero-pill-dot" data-live={connected} aria-hidden="true" />
            {connected ? "Build log streaming" : "Watch the real build log"}
            <ArrowIcon />
          </button>

          <h1>Let&apos;s build something</h1>

          <form className="composer" onSubmit={handleDeploy}>
            <label className="sr-only" htmlFor="composer-field">
              {mode === "github" ? "Repository URL" : "Describe your app"}
            </label>
            {mode === "github" ? (
              <input
                id="composer-field"
                ref={inputRef as React.RefObject<HTMLInputElement>}
                className="composer-input"
                type="url"
                required
                placeholder="Paste a public GitHub repository URL…"
                value={repositoryUrl}
                onChange={(event) => setRepositoryUrl(event.target.value)}
                disabled={isSubmitting}
              />
            ) : (
              <textarea
                id="composer-field"
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                className="composer-input"
                required
                rows={3}
                placeholder="Describe the app you want rwaft to build…"
                value={promptText}
                onChange={(event) => setPromptText(event.target.value)}
                disabled={isSubmitting}
              />
            )}

            <div className="composer-bar">
              <div className="mode-toggle" role="group" aria-label="Build source">
                <button
                  type="button"
                  className="mode-option"
                  aria-pressed={mode === "github"}
                  onClick={() => switchMode("github")}
                  disabled={isSubmitting}
                >
                  <RepoIcon />
                  Repo
                </button>
                <button
                  type="button"
                  className="mode-option"
                  aria-pressed={mode === "prompt"}
                  onClick={() => switchMode("prompt")}
                  disabled={isSubmitting}
                >
                  <SparkIcon />
                  Prompt
                </button>
              </div>

              <button
                type="submit"
                className="composer-send"
                disabled={!canSubmit}
                aria-label={isSubmitting ? "Queueing build" : "Start build"}
              >
                <SendIcon />
              </button>
            </div>
          </form>

          <p className="hero-note">
            {mode === "github"
              ? "Public repositories · Vite or Create React App with a build script"
              : "Scaffolds Vite + React + TypeScript, builds it, and hosts the result"}
          </p>

          {error && (
            <p className="hero-message" data-tone="error" role="alert">
              {error}
            </p>
          )}
          {failure && (
            <p className="hero-message" data-tone="error" role="alert">
              Build failed: {failure}
            </p>
          )}
          {liveUrl && status === "ready" && (
            <p className="hero-message" data-tone="ready" role="status">
              Deployed —{" "}
              <a href={liveUrl} target="_blank" rel="noreferrer">
                open your site
              </a>
            </p>
          )}
          {liveUrl && status !== "ready" && (
            <p className="hero-message" role="status">
              Reserved at{" "}
              <a href={liveUrl} target="_blank" rel="noreferrer">
                {liveUrl}
              </a>
            </p>
          )}
        </div>

        <section
          className="log log-wrap"
          id="build-log"
          aria-label="Build log"
          data-fullscreen={logFullscreen ? "true" : undefined}
          role={logFullscreen ? "dialog" : undefined}
          aria-modal={logFullscreen ? true : undefined}
        >
          <header className="log-head">
            <span className="log-title">
              <span className="log-dot" data-live={connected} aria-hidden="true" />
              Build log
            </span>
            {isBuilding && <span className="chip" data-tone="run">{status}</span>}
            {status === "ready" && <span className="chip" data-tone="ready">ready</span>}
            {status === "failed" && <span className="chip" data-tone="failed">failed</span>}
            <span className="log-actions">
              <span className="log-meta">{connected ? "streaming" : "offline"}</span>
              <button
                type="button"
                className="log-btn"
                onClick={clear}
                disabled={lines.length === 0}
              >
                <CloseIcon />
                Clear
              </button>
              <button
                type="button"
                className="log-btn"
                onClick={() => setLogFullscreen((open) => !open)}
                aria-expanded={logFullscreen}
              >
                {logFullscreen ? <CollapseIcon /> : <ExpandIcon />}
                {logFullscreen ? "Exit" : "Expand"}
              </button>
            </span>
          </header>

          <div
            className="log-body"
            ref={consoleRef}
            onScroll={handleConsoleScroll}
            role="log"
            aria-live="polite"
          >
            {lines.length === 0 ? (
              <p className="log-empty">
                {isBackendConfigured
                  ? "Nothing on the wire yet. Start a build and the whole pipeline prints here as it happens — dependency installs, AI iterations, bundler output, and any repairs it has to make."
                  : MISSING_BACKEND_MESSAGE}
              </p>
            ) : (
              lines.map((line) => (
                <p key={line.key} className="log-line" data-level={line.level}>
                  <span className="log-time">{new Date(line.ts).toLocaleTimeString()}</span>
                  <span className="log-text">{line.message}</span>
                </p>
              ))
            )}
          </div>

          {!pinned && (
            <button type="button" className="log-btn log-jump" onClick={() => setPinned(true)}>
              <DownIcon />
              Latest
            </button>
          )}
        </section>
      </main>
    </div>
  )
}
