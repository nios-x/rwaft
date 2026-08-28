"use client"

import { useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import Link from "next/link"
import { BACKEND_URL, MISSING_BACKEND_MESSAGE, isBackendConfigured } from "../lib/config"
import { useUserId } from "../lib/useUserId"
import { useBuildLogs } from "../lib/useBuildLogs"

type DeployMode = "github" | "prompt"

export default function Home() {
  const [mode, setMode] = useState<DeployMode>("github")
  const [repositoryUrl, setRepositoryUrl] = useState("")
  const [promptText, setPromptText] = useState("")
  const [deploymentUrl, setDeploymentUrl] = useState("")
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const userId = useUserId()
  const { lines, connected, status, deployedUrl, failure, clear } = useBuildLogs(userId)

  const consoleRef = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(true)

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

  const isBuilding = status === "queued" || status === "building"
  const liveUrl = deployedUrl || deploymentUrl

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

  return (
    <main className="deploy-page">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Rwaft home"><span className="brand-mark">R</span>rwaft</Link>
        <span className="status"><i /> deploy console</span>
      </header>

      <section className="deploy-shell">
        <div className="intro">
          <p className="eyebrow">SHIP ANYTHING</p>
          {mode === "github"
            ? <h1>Turn a repository<br /><em>into a live site.</em></h1>
            : <h1>Describe an app,<br /><em>we&apos;ll build &amp; ship it.</em></h1>}
          <p className="lede">
            {mode === "github"
              ? "Paste a public React repository and we'll build, publish, and hand you a URL."
              : "Type what you want to build. Our AI will scaffold a Vite + React project, write the code, and host it."}
          </p>
        </div>

        <div className="form-container">
          <div className="tab-switcher">
            <button type="button" className={`tab-btn ${mode === "github" ? "active" : ""}`} onClick={() => switchMode("github")} disabled={isSubmitting}>GitHub Repo</button>
            <button type="button" className={`tab-btn ${mode === "prompt" ? "active" : ""}`} onClick={() => switchMode("prompt")} disabled={isSubmitting}>AI Prompt</button>
          </div>

          <form className="deploy-form" onSubmit={handleDeploy}>
            {mode === "github" ? <>
              <label htmlFor="repository-url">Repository URL</label>
              <div className="input-wrap">
                <span className="github-symbol">⌘</span>
                <input id="repository-url" type="url" required placeholder="https://github.com/you/project" value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} disabled={isSubmitting} />
              </div>
              <button type="submit" disabled={isSubmitting} className="submit-btn">
                {isSubmitting ? "Queueing..." : "Deploy repository"}{!isSubmitting && <span aria-hidden="true">↗</span>}
              </button>
              <p className="form-note">Public GitHub repositories only · React + Vite ready</p>
            </> : <>
              <label htmlFor="app-prompt">App Description</label>
              <div className="input-wrap textarea-wrap">
                <textarea id="app-prompt" required rows={4} placeholder="A beautiful pomodoro timer app with a dark mode, ambient sound selector, and circular progress bar..." value={promptText} onChange={(event) => setPromptText(event.target.value)} disabled={isSubmitting} />
              </div>
              <button type="submit" disabled={isSubmitting} className="submit-btn">
                {isSubmitting ? "Queueing..." : "Generate & Deploy"}{!isSubmitting && <span aria-hidden="true">↗</span>}
              </button>
              <p className="form-note">Generates a fresh React app, builds it, and hosts the result</p>
            </>}

            {error && <p className="message error" role="alert">{error}</p>}
            {failure && <p className="message error" role="alert">Build failed: {failure}</p>}
            {liveUrl && status === "ready" && (
              <p className="message success" role="status">
                Deployed. <a href={liveUrl} target="_blank" rel="noreferrer">Open your site ↗</a>
              </p>
            )}
            {liveUrl && status !== "ready" && (
              <p className="message" role="status">
                Queued at <a href={liveUrl} target="_blank" rel="noreferrer">{liveUrl}</a> - watch the log below.
              </p>
            )}
          </form>
        </div>
      </section>

      <section className="log-panel" aria-label="Build log">
        <header className="log-header">
          <span className="log-title">
            <i className={`log-dot ${connected ? "on" : "off"}`} aria-hidden="true" />
            build log
            {isBuilding && <span className="log-badge">{status}</span>}
            {status === "ready" && <span className="log-badge ok">ready</span>}
            {status === "failed" && <span className="log-badge bad">failed</span>}
          </span>
          <span className="log-actions">
            <span className="log-meta">{connected ? "streaming" : "offline"}</span>
            <button type="button" className="log-clear" onClick={clear} disabled={lines.length === 0}>clear</button>
          </span>
        </header>

        <div className="log-body" ref={consoleRef} onScroll={handleConsoleScroll} role="log" aria-live="polite">
          {lines.length === 0
            ? <p className="log-empty">
                {isBackendConfigured
                  ? "No output yet. Deploy a repository or describe an app to watch it build here in real time."
                  : MISSING_BACKEND_MESSAGE}
              </p>
            : lines.map((line) => (
                <p key={line.key} className={`log-line ${line.level}`}>
                  <span className="log-time">{new Date(line.ts).toLocaleTimeString()}</span>
                  <span className="log-text">{line.message}</span>
                </p>
              ))}
        </div>
        {!pinned && (
          <button type="button" className="log-follow" onClick={() => setPinned(true)}>Jump to latest ↓</button>
        )}
      </section>

      <footer className="footer"><span>01 / READY TO SHIP</span><span>BUILD · PUBLISH · REPEAT</span></footer>
    </main>
  )
}
