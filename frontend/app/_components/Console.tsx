"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent, ReactNode } from "react"
import { BACKEND_URL, MISSING_BACKEND_MESSAGE, isBackendConfigured, readApiJson } from "../../lib/config"
import { useUserId } from "../../lib/useUserId"
import { useBuildLogs } from "../../lib/useBuildLogs"
import { useAccount } from "../../lib/useAccount"
import { useLine } from "../../lib/useLine"
import { useTheme } from "../../lib/useTheme"
import { addRecentBuild, buildTitle, settleRecentBuild, useRecentBuilds } from "../../lib/recentBuilds"
import { deriveProgress, type BuildKind } from "../../lib/stages"
import { STATE_LABEL, viewOf } from "../../lib/builds"
import { GoogleButton, TokenShop, openTokenShop } from "./Account"
import { Header } from "./Header"
import { Home } from "./Home"
import { Workspace } from "./Workspace"
import { FluidBackground } from "./FluidBackground"
import { ChevronLeft } from "./Icons"
import type { PromptBoxProps } from "./PromptBox"

interface ConsoleProps {
  /**
   * The server-rendered footer. Passed in rather than imported so it stays a
   * server component: its links are in the first response for crawlers, and
   * none of it ships as client JavaScript. Shown on the home screen only.
   */
  footer?: ReactNode
  /** Server-rendered like the footer, and shown below the home screen's builds. */
  features?: ReactNode
}

export function Console({ footer, features }: ConsoleProps) {
  const [theme, setTheme] = useTheme()
  const [mode, setMode] = useState<BuildKind>("prompt")
  const [promptText, setPromptText] = useState("")
  const [repositoryUrl, setRepositoryUrl] = useState("")
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  // null = the home screen; an id = that build's workspace.
  const [openId, setOpenId] = useState<string | null>(null)
  const [view, setView] = useState<"chat" | "preview">("chat")
  const [checkoutNotice, setCheckoutNotice] = useState<"success" | "cancelled" | null>(null)
  const heroInput = useRef<HTMLTextAreaElement | null>(null)
  const chatInput = useRef<HTMLTextAreaElement | null>(null)

  const auth = useAccount()
  const anonymousId = useUserId()
  // Wait for a stored session to resolve before attaching, so a signed-in
  // reload does not briefly stream the anonymous channel.
  const logUserId = auth.account?.id ?? (auth.checking ? null : anonymousId)
  const { lines, connected, status, statusJobId, failure } = useBuildLogs(logUserId, auth.account ? auth.token : null)

  const recent = useRecentBuilds()
  const line = useLine(recent.filter((item) => !item.outcome).map((item) => item.id))
  const builds = useMemo(
    () => recent.map((item) => viewOf(item, statusJobId === item.id ? status : null, line[item.id])),
    [recent, status, statusJobId, line]
  )
  const build = openId ? builds.find((item) => item.id === openId) ?? null : null
  const buildLines = useMemo(() => (build ? lines.filter((item) => item.jobId === build.id) : []), [lines, build])
  const stages = useMemo(() => {
    if (!build) return []
    const status = build.state === "live" ? "ready" : build.state === "failed" ? "failed" : build.state === "building" ? "building" : "queued"
    return deriveProgress(build.kind, buildLines, status, build.position).stages
  }, [build, buildLines])
  // Every queue reply carries the line's totals; any fresh one will do.
  const totals = Object.values(line)[0]
  const running = totals?.running ?? 0
  const waiting = totals?.waiting ?? 0

  // Record outcomes once known, and re-read the balance: a failed build is refunded.
  const { refresh } = auth
  const billing = Boolean(auth.config?.billing)
  useEffect(() => {
    let settledAny = false
    for (const item of builds) {
      if (item.outcome) continue
      if (item.state === "live") { settleRecentBuild(item.id, "ready"); settledAny = true }
      if (item.state === "failed") { settleRecentBuild(item.id, "failed"); settledAny = true }
    }
    if (settledAny && billing) void refresh()
  }, [builds, billing, refresh])

  // Dodo returns here with ?checkout=… plus its own payment status; the
  // webhook may land a moment after the browser does, so the balance is
  // re-read a few times. A declined or expired payment comes back on the
  // success URL too, so its status decides.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const checkout = params.get("checkout")
    if (checkout !== "success" && checkout !== "cancelled") return
    const status = params.get("status")
    const result = checkout === "cancelled" || status === "failed" || status === "cancelled" || status === "expired" ? "cancelled" : "success"
    window.history.replaceState(null, "", window.location.pathname)
    let attempts = 0
    const timer = setInterval(() => {
      attempts++
      if (attempts === 1) setCheckoutNotice(result)
      if (result === "success") void refresh()
      if (attempts >= 5 || result === "cancelled") clearInterval(timer)
    }, 1_500)
    return () => clearInterval(timer)
  }, [refresh])

  const signedIn = Boolean(auth.account)
  const cost = auth.config?.costs[mode] ?? 0
  const needsSignIn = billing && !signedIn
  const balance = auth.account?.tokens ?? 0
  const short = billing && signedIn && balance < cost
  const value = mode === "deploy" ? repositoryUrl : promptText
  // Inside a finished app, the chat box changes that app. A failed change
  // retries against the same version it was changing.
  const editTarget = build?.kind === "prompt" && mode === "prompt"
    ? build.state === "live" ? build.id : build.state === "failed" ? build.parentId : undefined
    : undefined

  const handleSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    setError("")
    if (!isBackendConfigured) return setError(MISSING_BACKEND_MESSAGE)
    if (needsSignIn) return setError("Sign in with Google first. Builds are tied to your account.")
    if (short) {
      openTokenShop()
      return setError(`You're out of credits: this costs ${cost} and you have ${balance}. Buy more to keep building.`)
    }
    const userId = logUserId
    if (!userId) return setError("Still setting up your session. Try again in a moment.")

    const source = value.trim()
    setIsSubmitting(true)
    try {
      const response = await fetch(`${BACKEND_URL}/${mode === "deploy" ? "deploy" : "prompt"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": userId, ...auth.authHeaders() },
        body: JSON.stringify(mode === "deploy" ? { url: source, userId } : { prompt: source, userId, ...(editTarget ? { from: editTarget } : {}) }),
      })
      const result = await readApiJson<{ id?: string; url?: string; message?: string; code?: string; balance?: number; charged?: number }>(response)

      if (response.status === 402) {
        if (typeof result.balance === "number") auth.setBalance(result.balance)
        openTokenShop()
      }
      if (response.status === 401 && result.code === "sign_in_required") void refresh()
      if (!response.ok || !result.id || !result.url) throw new Error(result.message || "The build could not be started")

      addRecentBuild({ id: result.id, kind: mode, url: result.url, at: Date.now(), charged: result.charged ?? 0, source, ...(editTarget ? { parentId: editTarget } : {}) })
      setOpenId(result.id)
      setView("chat")
      if (mode === "prompt") setPromptText("")
      else setRepositoryUrl("")
      if (result.charged && auth.account) auth.setBalance(auth.account.tokens - result.charged)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The build could not be started")
    } finally {
      setIsSubmitting(false)
    }
  }

  const blocked = needsSignIn ? (
    auth.config?.googleClientId ? (
      <div className="signin">
        <p>
          Sign up free with Google and get <strong>{auth.config.signupTokens} credits</strong>
          {auth.config.costs.prompt > 0 && <>: that&apos;s {Math.floor(auth.config.signupTokens / auth.config.costs.prompt)} chats, at {auth.config.costs.prompt} credit each</>}.
          {" "}Already have an account? The same button signs you in.
        </p>
        <GoogleButton auth={auth} theme={theme} width={260} />
      </div>
    ) : (
      <p className="signin">Sign-in isn&apos;t set up on this server yet, so builds are unavailable. Its operator needs to set GOOGLE_CLIENT_ID.</p>
    )
  ) : short ? (
    // Out of credits: say so where the user is about to type, with the way out.
    <div className="signin">
      <p>You&apos;re out of credits. Each message costs <strong>{cost}</strong>; you have <strong>{balance}</strong>.</p>
      <button type="button" className="pill-btn pill-btn--ink" onClick={openTokenShop}>Recharge credits</button>
    </div>
  ) : null

  const promptBase: Omit<PromptBoxProps, "inputRef"> = {
    mode,
    setMode: (next) => { setMode(next); setError("") },
    value,
    setValue: mode === "deploy" ? setRepositoryUrl : setPromptText,
    onSubmit: handleSubmit,
    submitting: isSubmitting,
    canSubmit: !isSubmitting && value.trim().length > 0 && !needsSignIn,
    costLabel: !auth.config ? "" : !billing ? "Free" : `${cost} credit${cost === 1 ? "" : "s"}${signedIn ? ` · ${balance} left` : ""}`,
    blocked,
    error,
  }

  const goHome = () => {
    setOpenId(null)
    setError("")
    setTimeout(() => heroInput.current?.focus(), 0)
  }

  // Same prompt, same mode, back in the box: one tap from a failed build to another try.
  const retry = (failed: { kind: BuildKind; source?: string; url: string }) => {
    setMode(failed.kind)
    if (failed.kind === "prompt") setPromptText(failed.source ?? "")
    else setRepositoryUrl(failed.source ?? "")
    setError("")
    setView("chat")
    setTimeout(() => chatInput.current?.focus(), 0)
  }

  const open = (id: string) => {
    setOpenId(id)
    setView("chat")
    setError("")
  }

  return (
    <div className="app" data-screen={build ? "build" : "home"}>
      <FluidBackground theme={theme} />
      <Header auth={auth} theme={theme} setTheme={setTheme} onHome={goHome} running={running} waiting={waiting}>
        {build && (
          <>
            <button type="button" className="icon-btn back" onClick={goHome} aria-label="Back to home">
              <ChevronLeft />
            </button>
            <span className="build-name" title={build.source}>{buildTitle(build)}</span>
            <span className="status" data-state={build.state}>
              <span className="status-long">{build.state === "line" && build.position ? `#${build.position} in line` : STATE_LABEL[build.state]}</span>
              <span className="status-short" aria-hidden="true">{build.state === "line" && build.position ? `#${build.position}` : STATE_LABEL[build.state]}</span>
            </span>
            <div className="view-switch" role="tablist" aria-label="Show">
              <button type="button" role="tab" aria-selected={view === "chat"} onClick={() => setView("chat")}>Chat</button>
              <button type="button" role="tab" aria-selected={view === "preview"} onClick={() => setView("preview")}>Preview</button>
            </div>
          </>
        )}
      </Header>

      {checkoutNotice && (
        <p className="banner" data-tone={checkoutNotice} role="status">
          {checkoutNotice === "success"
            ? "Payment received. Your credits are added as soon as the payment confirms, usually within a few seconds."
            : "The payment didn't go through. You were not charged."}
          <button type="button" className="text-btn" onClick={() => setCheckoutNotice(null)}>Dismiss</button>
        </p>
      )}

      {build ? (
        <Workspace
          view={view}
          build={build}
          lines={buildLines}
          stages={stages}
          connected={connected}
          running={running}
          failure={build.state === "failed" && statusJobId === build.id ? failure : null}
          billing={billing}
          prompt={{ ...promptBase, inputRef: chatInput }}
          editing={Boolean(editTarget)}
          onOpen={open}
          onRetry={() => retry(build)}
          githubExport={Boolean(auth.config?.github)}
          requestHeaders={() => ({ ...(anonymousId ? { "X-User-Id": anonymousId } : {}), ...auth.authHeaders() })}
        />
      ) : (
        <>
          <Home prompt={{ ...promptBase, inputRef: heroInput }} builds={builds} onOpen={open}>{features}</Home>
          {footer}
        </>
      )}

      <TokenShop auth={auth} />
    </div>
  )
}
