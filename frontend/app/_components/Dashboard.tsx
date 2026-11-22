"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import type { MouseEvent } from "react"
import { MISSING_BACKEND_MESSAGE, isBackendConfigured } from "../../lib/config"
import {
	fetchDeployments,
	groupProjects,
	inFlight,
	mergeDeployments,
	removeFromServer,
	type Deployment,
	type Project,
} from "../../lib/deployments"
import { removeRecentBuilds, useRecentBuilds } from "../../lib/recentBuilds"
import { useAccount } from "../../lib/useAccount"
import { useTheme } from "../../lib/useTheme"
import { useUserId } from "../../lib/useUserId"
import { AccountPill, GoogleButton, TokenShop, openTokenShop } from "./Account"
import { DeploymentsView, ProjectDetail, ProjectsView } from "./DashboardViews"
import { ChevronRight, CoinIcon, Mark, MoonIcon, SunIcon } from "./Icons"

type Tab = "projects" | "deployments"
interface Route {
	tab: Tab
	project: string | null
}

/**
 * The dashboard's place lives in the query string (?tab=deployments,
 * ?project=<id>), so a link or a reload lands on the same view. pushState
 * fires no event of its own, hence the local one.
 */
const ROUTE_EVENT = "rwaft:dashboard-route"
const readSearch = () => window.location.search
const serverSearch = () => ""
const subscribeRoute = (onChange: () => void) => {
	window.addEventListener("popstate", onChange)
	window.addEventListener(ROUTE_EVENT, onChange)
	return () => {
		window.removeEventListener("popstate", onChange)
		window.removeEventListener(ROUTE_EVENT, onChange)
	}
}

const parseRoute = (search: string): Route => {
	const params = new URLSearchParams(search)
	const project = params.get("project")
	return {
		tab: params.get("tab") === "deployments" ? "deployments" : "projects",
		project: project && /^[a-z0-9]{8}$/.test(project) ? project : null,
	}
}

const hrefFor = (route: Route) =>
	route.project ? `/dashboard?project=${route.project}` : route.tab === "deployments" ? "/dashboard?tab=deployments" : "/dashboard"

const go = (route: Route) => {
	window.history.pushState(null, "", hrefFor(route))
	window.dispatchEvent(new Event(ROUTE_EVENT))
	window.scrollTo({ top: 0 })
}

/** Plain left clicks stay in the page; a new-tab click keeps its href. */
const routeLink = (route: Route) => ({
	href: hrefFor(route),
	onClick: (event: MouseEvent<HTMLAnchorElement>) => {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
		event.preventDefault()
		go(route)
	},
})

/** Re-read while anything is in line or building, so its status moves without a reload. */
const POLL_MS = 8_000

interface ServerList {
	accountId: string
	deployments: Deployment[]
}

export function Dashboard() {
	const [theme, setTheme] = useTheme()
	const auth = useAccount()
	const anonymousId = useUserId()
	const { account, config, authHeaders } = auth
	const accountId = account?.id ?? null
	const billing = Boolean(config?.billing)

	const search = useSyncExternalStore(subscribeRoute, readSearch, serverSearch)
	const route = useMemo(() => parseRoute(search), [search])

	const [server, setServer] = useState<ServerList | null>(null)
	const [loadError, setLoadError] = useState<{ accountId: string; message: string } | null>(null)

	const refresh = useCallback(async (forAccount: string) => {
		try {
			const deployments = await fetchDeployments(authHeaders())
			setServer({ accountId: forAccount, deployments })
			setLoadError(null)
		} catch (error) {
			setLoadError({ accountId: forAccount, message: error instanceof Error ? error.message : "Your deployments couldn't be loaded" })
		}
	}, [authHeaders])

	useEffect(() => {
		if (!accountId || !isBackendConfigured) return
		let cancelled = false
		void (async () => {
			if (!cancelled) await refresh(accountId)
		})()
		// Back from GitHub or another tab: catch up on what changed meanwhile.
		const onVisible = () => { if (document.visibilityState === "visible") void refresh(accountId) }
		document.addEventListener("visibilitychange", onVisible)
		return () => {
			cancelled = true
			document.removeEventListener("visibilitychange", onVisible)
		}
	}, [accountId, refresh])

	// Only this account's list counts: a sign-out and sign-in as someone else
	// must not show the previous account's projects for a moment.
	const own = server && server.accountId === accountId ? server.deployments : null
	const error = loadError && loadError.accountId === accountId ? loadError.message : null
	const anyInFlight = Boolean(own?.some(inFlight))
	useEffect(() => {
		if (!accountId || !anyInFlight) return
		const timer = setInterval(() => void refresh(accountId), POLL_MS)
		return () => clearInterval(timer)
	}, [accountId, anyInFlight, refresh])

	const recent = useRecentBuilds()
	const deployments = useMemo(() => mergeDeployments(own ?? [], recent), [own, recent])
	const projects = useMemo(() => groupProjects(deployments), [deployments])
	const project = route.project ? projects.find((item) => item.id === route.project) ?? null : null

	const remove = useCallback(async (target: Project) => {
		const ids = target.deployments.map((deployment) => deployment.id)
		const onServer = target.deployments.find((deployment) => !deployment.local)
		if (onServer && accountId) await removeFromServer(onServer.id, true, authHeaders())
		removeRecentBuilds(ids)
		const gone = new Set(ids)
		setServer((current) => current && { ...current, deployments: current.deployments.filter((deployment) => !gone.has(deployment.id)) })
		if (route.project === target.id) go({ tab: "projects", project: null })
	}, [accountId, authHeaders, route.project])

	// Builds made before signing in ran under the anonymous id, and GitHub export checks it.
	const requestHeaders = useCallback(
		() => ({ ...(anonymousId ? { "X-User-Id": anonymousId } : {}), ...authHeaders() }),
		[anonymousId, authHeaders]
	)

	const signedOut = Boolean(config) && !account && !auth.checking
	const settling = !config || auth.checking || (Boolean(accountId) && !own && !error)
	const openProject = (id: string) => go({ tab: "projects", project: id })

	let body: React.ReactNode
	if (!isBackendConfigured) {
		body = <Notice title="The dashboard can't reach rwaft's API" text={MISSING_BACKEND_MESSAGE} />
	} else if (signedOut) {
		body = (
			<>
				<section className="dash-signin" aria-labelledby="signin-title">
					<Mark className="dash-signin-mark" />
					<h1 id="signin-title">Your projects, on every device</h1>
					<p>Sign in to see every app you&apos;ve built, its live link, its versions and where its code is on GitHub.</p>
					{config?.googleClientId ? <GoogleButton auth={auth} theme={theme} width={260} /> : <p className="dash-faint">Sign-in isn&apos;t set up on this server.</p>}
				</section>
				{projects.length > 0 && (
					<ProjectsView
						heading="On this device"
						projects={projects}
						loading={false}
						onOpen={openProject}
						onRemove={remove}
					/>
				)}
			</>
		)
	} else if (route.project) {
		body = (
			<ProjectDetail
				project={project}
				loading={settling}
				back={routeLink({ tab: "projects", project: null })}
				onRemove={remove}
				headers={requestHeaders}
			/>
		)
	} else if (route.tab === "deployments") {
		body = <DeploymentsView deployments={deployments} projects={projects} loading={settling} onOpenProject={openProject} />
	} else {
		body = <ProjectsView heading="Projects" projects={projects} loading={settling} onOpen={openProject} onRemove={remove} />
	}

	return (
		<div className="app" data-screen="page">
			<header className="header">
				<Link href="/" className="brand" aria-label="rwaft home">
					<Mark className="brand-mark" />
					<span>rwaft</span>
				</Link>
				<div className="header-middle dash-crumbs">
					<a className="dash-crumb" {...routeLink({ tab: "projects", project: null })}>Dashboard</a>
					{project && (
						<>
							<ChevronRight className="dash-crumb-sep" />
							<span className="dash-crumb dash-crumb--current">{project.title}</span>
						</>
					)}
				</div>
				<div className="header-right">
					{billing && account && (
						<button type="button" className="chip chip--button dash-credits" onClick={openTokenShop} aria-label={`${account.tokens} credits left. Recharge credits`}>
							<CoinIcon /> {account.tokens} credit{account.tokens === 1 ? "" : "s"}
						</button>
					)}
					<button
						type="button"
						className="icon-btn"
						aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
						onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
					>
						{theme === "dark" ? <SunIcon /> : <MoonIcon />}
					</button>
					<AccountPill auth={auth} theme={theme} />
				</div>
			</header>

			{!signedOut && isBackendConfigured && (
				<nav className="dash-tabs" aria-label="Dashboard">
					<a {...routeLink({ tab: "projects", project: null })} aria-current={route.tab === "projects" ? "page" : undefined}>Projects</a>
					<a {...routeLink({ tab: "deployments", project: null })} aria-current={route.tab === "deployments" && !route.project ? "page" : undefined}>Deployments</a>
				</nav>
			)}

			<main className="dash-main">
				{error && own && (
					<p className="dash-banner" role="alert">
						{error}
						<button type="button" className="text-btn" onClick={() => accountId && void refresh(accountId)}>Try again</button>
					</p>
				)}
				{error && !own && accountId ? (
					<Notice title="Your projects didn't load" text={error} action={<button type="button" className="pill-btn pill-btn--ink" onClick={() => void refresh(accountId)}>Try again</button>} />
				) : body}
			</main>

			{billing && <TokenShop auth={auth} />}
		</div>
	)
}

function Notice({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
	return (
		<section className="dash-empty" role="status">
			<h1>{title}</h1>
			<p>{text}</p>
			{action}
		</section>
	)
}
