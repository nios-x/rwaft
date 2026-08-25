"use client"

import { useState } from "react"
import type { FormEvent } from "react"

type DeployMode = "github" | "prompt"

export default function Home() {
  const [mode, setMode] = useState<DeployMode>("github")
  const [repositoryUrl, setRepositoryUrl] = useState("")
  const [promptText, setPromptText] = useState("")
  const [deploymentUrl, setDeploymentUrl] = useState("")
  const [error, setError] = useState("")
  const [isDeploying, setIsDeploying] = useState(false)

  const handleDeploy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setDeploymentUrl("")
    setIsDeploying(true)

    try {
      const backendUrl = (
        process.env.NEXT_PUBLIC_BACKEND_URL || "https://rwaft.onrender.com"
      ).replace(/\/+$/, "")
      const endpoint = mode === "github" ? `${backendUrl}/deploy` : `${backendUrl}/prompt`
      const payload = mode === "github"
        ? { url: repositoryUrl.trim() }
        : { prompt: promptText.trim() }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      setIsDeploying(false)
    }
  }

  return (
    <main className="deploy-page">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Rwaft home"><span className="brand-mark">R</span>rwaft</a>
        <span className="status"><i /> deploy console</span>
      </header>

      <section className="deploy-shell">
        <div className="intro">
          <p className="eyebrow">SHIP ANYTHING</p>
          {mode === "github" ? <h1>Turn a repository<br /><em>into a live site.</em></h1> : <h1>Describe an app,<br /><em>we&apos;ll build &amp; ship it.</em></h1>}
          <p className="lede">{mode === "github" ? "Paste a public React repository and we&apos;ll build, publish, and hand you a URL." : "Type what you want to build. Our AI will scaffold a Vite + React project, write the code, and host it."}</p>
        </div>

        <div className="form-container">
          <div className="tab-switcher">
            <button type="button" className={`tab-btn ${mode === "github" ? "active" : ""}`} onClick={() => { setMode("github"); setError(""); setDeploymentUrl("") }} disabled={isDeploying}>GitHub Repo</button>
            <button type="button" className={`tab-btn ${mode === "prompt" ? "active" : ""}`} onClick={() => { setMode("prompt"); setError(""); setDeploymentUrl("") }} disabled={isDeploying}>AI Prompt</button>
          </div>

          <form className="deploy-form" onSubmit={handleDeploy}>
            {mode === "github" ? <>
              <label htmlFor="repository-url">Repository URL</label>
              <div className="input-wrap"><span className="github-symbol">⌘</span><input id="repository-url" type="url" required placeholder="https://github.com/you/project" value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} disabled={isDeploying} /></div>
              <button type="submit" disabled={isDeploying} className="submit-btn">{isDeploying ? "Deploying..." : "Deploy repository"}{!isDeploying && <span aria-hidden="true">↗</span>}</button>
              <p className="form-note">Public GitHub repositories only · React + Vite ready</p>
            </> : <>
              <label htmlFor="app-prompt">App Description</label>
              <div className="input-wrap textarea-wrap"><textarea id="app-prompt" required rows={4} placeholder="A beautiful pomodoro timer app with a dark mode, ambient sound selector, and circular progress bar..." value={promptText} onChange={(event) => setPromptText(event.target.value)} disabled={isDeploying} /></div>
              <button type="submit" disabled={isDeploying} className="submit-btn">{isDeploying ? "Generating & Deploying..." : "Generate & Deploy"}{!isDeploying && <span aria-hidden="true">↗</span>}</button>
              <p className="form-note">Generates a fresh React app using OpenAI &amp; builds it instantly</p>
            </>}
            {error && <p className="message error" role="alert">{error}</p>}
            {deploymentUrl && <p className="message success" role="status">Deployed. <a href={deploymentUrl} target="_blank" rel="noreferrer">Open your site ↗</a></p>}
          </form>
        </div>
      </section>

      <footer className="footer"><span>01 / READY TO SHIP</span><span>BUILD · PUBLISH · REPEAT</span></footer>
    </main>
  );
}
